'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { motion, useInView } from 'framer-motion';
import { journeyData } from '@/app/data';
import FireText from '@/components/shared/FireText';
import { ACCENTS } from './accents';

// The overlap atlas — /journey's fifth instrument, and the only inline one:
// every entry as a bar on ONE month-true axis, grouped into the three lanes of
// the type system (career / education / community), so the page's real story —
// jobs, the degree and volunteering RUNNING AT THE SAME TIME — is visible in a
// single glance before the timeline tells it in sequence.
//
// It is wired into the same shared state as the fixed instruments, never a
// parallel copy of it:
//
//   · the era election (container's IntersectionObserver) that winds the
//     EraRail clock and rolls the ghost year ALSO lights the bars of the
//     elected era — scrolling the timeline sweeps the atlas,
//   · selecting a bar jumps to that entry's card with the SAME scrollIntoView
//     contract as the clock's year buttons (smooth, auto under reduced
//     motion), and the jump winds the clock on the way down because the clock
//     is scroll-driven — no second code path,
//   · the track filter is owned by the container: the chips dim non-matching
//     bars here AND the matching timeline cards below (TimelineNode's `dimmed`
//     prop), so the two views can never disagree about what is highlighted,
//   · the NOW line is the live clock made spatial — open-ended bars close
//     EXACTLY on it (never a pixel past — owner correction) and wear a dashed
//     edge, and the line itself echoes the EraRail needle's ember.
//
// Hydration: everything derived from the clock (axis span, bar widths, the NOW
// line) renders only after mount — `nowM` starts null, so server HTML and the
// first client render agree even when the build month and the visit month
// differ (the PageTitle reduced-motion mismatch is the documented cautionary
// tale). The frame that IS deterministic — lane rows at their packed heights,
// labels, chips — renders on the server so the section holds its layout.
const BAR_H = 30; // bar height, px
const BAR_GAP = 9; // vertical gap between stacked lanes, px
const LANE_STEP = BAR_H + BAR_GAP;
const LABEL_W = 104; // lane-label column, px — the axis indents to match
const OPEN_END = 12 * 9999; // packing sentinel for still-running entries

// The grid is a FIXED-METRIC instrument, like the EraRail's 300px dial: a
// month is a constant number of pixels, so the grid width follows the DATA
// (span × scale + label column + run-out), always out-measures the max-w-5xl
// section, and pans on laptops exactly as on phones. The scale itself is set
// so captions sit INSIDE their bars (owner correction — no spilled text),
// INCLUDING the short still-running 2026 roles: an open bar closes EXACTLY
// on the NOW line (a bar past "now" reads as broken time — earlier owner
// correction), so the only way its caption fits inside is a scale generous
// enough for the worst case — 'Constant Security Services · Security
// Officer' across its ~4 on-axis months needs ~87px/month, hence 90. The
// owner chose that trade explicitly (2026-09-01): a long pan over any
// caption outside its bar. CLOSED bars shorter than their caption still
// take a caption-width FLOOR (the bar widens just enough to hold its text),
// and an open bar that STILL can't hold its caption — a future role only a
// month or two old — falls back to printing it OUTSIDE, to the LEFT of the
// bar, never past now, with the lane packing reserving that left-side room.
// Packing reserves max(duration, caption) per bar either way, so bars and
// captions can never collide. Caption width is estimated, not measured:
// 11px monospace advances ~6.6px/char (Menlo 0.602em); CHAR_W rounds up and
// CAPTION_PAD covers the bar's px-2.5 padding plus comfortable clearance.
// This is also why the in-grid type (.ja-bar/.ja-axis/.ja-lane) sits
// OUTSIDE the fluid-scale system: type that grew with the viewport would
// outgrow both the floor and the reservation.
const PX_PER_MONTH = 90; // the scale — one year of axis = 1080px (see the
// caption-fit note above; 40 left the short open roles' captions outside)
const RUNOUT_W = 80; // room past the final year for its centred label (bars
// never overrun the axis any more — open bars clamp to the NOW line)
const CHAR_W = 7; // estimated caption advance, px/char
const CAPTION_PAD = 34; // px-2.5 both sides + comfortable clearance

const TRACKS = [
  { type: 'career', label: 'Career' },
  { type: 'education', label: 'Education' },
  { type: 'milestone', label: 'Community' },
];

const CHIPS = [
  // 'All' wears the card gold — it belongs to no single track.
  { key: 'all', label: 'All', accent: '#f9d174' },
  ...TRACKS.map((t) => ({
    key: t.type,
    label: t.label,
    accent: ACCENTS[t.type].color,
  })),
];

const toMonths = (ym) => {
  const [y, m] = ym.split('-').map(Number);
  return y * 12 + (m - 1);
};

// Greedy interval packing: first lane whose last FOOTPRINT ends before this
// one's footprint STARTS. The footprint is the bar's duration OR its caption,
// whichever reaches further — a 4-month role with a 27-character caption
// occupies far more axis than it occupies time, and packing by duration alone
// would print the next bar straight through the caption. Closed bars spill
// caption to the RIGHT (footprint end reaches past the bar); open bars are
// clamped at the NOW line and spill caption to the LEFT instead, so their
// footprint STARTS early (`fs`, computed in STRUCTURE) — which is also why
// the sort and the lane test both read `fs`, not `s`. Same-month handovers
// still stack (KFC ends and Lidl begins in the same SEP 2021 — flush bars on
// one lane would erase the overlap the atlas exists to show). Mutates `lane`
// onto the items it is given.
const packLanes = (items) => {
  const laneEnds = [];
  [...items]
    .sort((a, b) => a.fs - b.fs || (b.e ?? OPEN_END) - (a.e ?? OPEN_END))
    .forEach((item) => {
      let lane = 0;
      while (lane < laneEnds.length && laneEnds[lane] >= item.fs) lane += 1;
      laneEnds[lane] = Math.max(
        item.e ?? OPEN_END,
        item.s + item.capMonths - 1,
      );
      item.lane = lane;
    });
  return laneEnds.length;
};

// Everything the clock does NOT touch, computed once at module scope: month
// spans, lane packing per track, and the axis origin (January of the earliest
// year). Open entries keep `e: null` here and resolve against the live month
// at render.
const STRUCTURE = (() => {
  const entries = journeyData.map((d) => {
    // Caption = `org · role`, role being the title's first segment (the two
    // college titles carry no ' · ', so the whole title IS the role — which
    // is exactly right for a qualification).
    const role = d.title.split(' · ')[0];
    const caption = `${d.org} · ${role}`;
    return {
      ...d,
      s: toMonths(d.start),
      e: d.end ? toMonths(d.end) : null,
      open: !d.end,
      role,
      capPx: caption.length * CHAR_W + CAPTION_PAD,
      capMonths: Math.ceil(
        (caption.length * CHAR_W + CAPTION_PAD) / PX_PER_MONTH,
      ),
    };
  });
  const maxFixedEnd = Math.max(...entries.map((d) => d.e ?? 0));
  // Footprint start for packing. Closed bars start where they start. An open
  // bar closes ON the NOW line, so a caption its clamped width can't hold is
  // printed to the LEFT of the bar — `fs` backs the footprint up by the
  // months that caption overhang could need. The live clock isn't known at
  // module scope (packing must be deterministic for the SSR skeleton), so the
  // bar's guaranteed span is measured to the last DATED end — the earliest
  // "now" the axis can ever show — making the reservation pessimistic, never
  // short.
  entries.forEach((d) => {
    const guaranteed = d.open ? Math.max(0, maxFixedEnd - d.s) : Infinity;
    d.fs = d.s - Math.max(0, d.capMonths - guaranteed);
  });
  const groups = TRACKS.map((track) => {
    const items = entries.filter((d) => d.type === track.type);
    return { ...track, items, laneCount: packLanes(items) };
  }).filter((g) => g.items.length > 0);
  const t0 = Math.floor(Math.min(...entries.map((d) => d.s)) / 12) * 12;
  // The span the axis has BEFORE the clock weighs in — the server-rendered
  // skeleton sizes the grid from this, so mount only ever widens it (and only
  // when today lies past the last dated end's year).
  const minSpan = (Math.floor(maxFixedEnd / 12) + 1) * 12 - t0;
  return { groups, t0, maxFixedEnd, minSpan };
})();

// Screen-reader form of the date range — the display glyphs read badly aloud
// ('—' is silence, '→' is "right arrow").
const spokenDates = (d) =>
  d.dateLabel.replace('—', 'to').replace('→', 'to now');

// The live line under the title — the page's whole thesis in one sentence
// ("2 roles + 1 degree — in parallel."). Composed at module scope from the
// data alone: "still running" is `end: null`, a property of the record, not
// the clock, so the sentence is SSR-deterministic and needs no mount gate.
const LIVE = (() => {
  const open = journeyData.filter((d) => !d.end);
  if (!open.length) return null;
  const noun = {
    career: ['role', 'roles'],
    education: ['degree', 'degrees'],
    milestone: ['community post', 'community posts'],
  };
  const parts = TRACKS.map(({ type }) => {
    const n = open.filter((d) => d.type === type).length;
    return n ? `${n} ${noun[type][n > 1 ? 1 : 0]}` : null;
  }).filter(Boolean);
  return { total: open.length, text: parts.join(' + ') };
})();

const TimelineAtlas = ({
  activeYear,
  filter,
  onFilter,
  revealed,
  reduceMotion,
}) => {
  const rootRef = useRef(null);
  const inView = useInView(rootRef, { amount: 0.15, margin: '-40px 0px' });
  const show = reduceMotion || (revealed && inView);

  // The live clock, month-granular, mount-gated (see the header note).
  const [nowM, setNowM] = useState(null);
  useEffect(() => {
    const now = new Date();
    setNowM(now.getFullYear() * 12 + now.getMonth());
  }, []);

  // The atlas opens panned to the NOW edge — the timeline below reads
  // newest-first, so the atlas leads with the same end of time and the user
  // pans BACK through the years, exactly as scrolling does. Runs once the
  // clock layer exists (same gate as the bars themselves).
  const scrollerRef = useRef(null);
  useEffect(() => {
    if (nowM === null) return;
    const el = scrollerRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [nowM]);

  // Clock-dependent scale: the axis runs from January of the first year to
  // January AFTER whichever is later — the last dated end or today — so the
  // NOW line always has room and the axis grows a year the moment the clock
  // crosses into one the data hasn't caught up with. Positions are plain
  // pixels, not percentages: the grid is fixed-metric, so px IS the truth and
  // the grid's own width derives from the same span.
  const scale = useMemo(() => {
    if (nowM === null) return null;
    const t1 =
      (Math.floor(Math.max(STRUCTURE.maxFixedEnd, nowM) / 12) + 1) * 12;
    const span = t1 - STRUCTURE.t0;
    const px = (m) => (m - STRUCTURE.t0) * PX_PER_MONTH;
    const years = [];
    for (let m = STRUCTURE.t0; m <= t1; m += 12) years.push(m);
    return { px, years, gridW: LABEL_W + span * PX_PER_MONTH + RUNOUT_W };
  }, [nowM]);

  // Same jump contract as the EraRail clock's year buttons; the focus hand-off
  // keeps a keyboard selection anchored where the scroll lands.
  const jump = (d) => {
    const card = document.getElementById(`jn-${d.id}`);
    if (!card) return;
    card.scrollIntoView({
      behavior: reduceMotion ? 'auto' : 'smooth',
      block: 'center',
    });
    card.focus({ preventScroll: true });
  };

  return (
    <motion.div
      ref={rootRef}
      // journey-atlas: JourneyPalette's jump target (the palette's "overlap
      // atlas" action), the same id-anchor contract as the era-<year> lis.
      id="journey-atlas"
      className="relative z-10 mb-14 md:mb-16"
      initial={false}
      animate={{ opacity: show ? 1 : 0, y: show ? 0 : 24 }}
      transition={
        reduceMotion ? { duration: 0 } : { duration: 0.55, ease: 'easeOut' }
      }
    >
      {/* Head — eyebrow + title on the left, the track chips on the right. */}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4 border-b border-white/10 pb-4">
        <div>
          {/* Eyebrow amber — the exact hue of /about's "DELIVERY TELEMETRY"
              eyebrow, so every uppercase microlabel reads in one voice; the
              title takes the page-title ember (owner correction, both). */}
          <p className="ja-eyebrow font-mono uppercase text-[#ffaa2a]">
            Overlap view
          </p>
          <h2 className="ja-title mt-1.5 font-bold text-[#ff6d05]">
            The atlas — three tracks, one clock
          </h2>
          {/* Fire ink (owner correction): the contact intro's per-word
              gold→ember ramp, not a flat amber. */}
          {LIVE && (
            <p className="ja-note mt-1.5 font-mono">
              <FireText
                text={`Running today: ${LIVE.text}${LIVE.total > 1 ? ' — in parallel.' : '.'}`}
              />
            </p>
          )}
        </div>
        <div
          role="group"
          aria-label="Highlight one track"
          className="flex flex-wrap gap-1.5"
        >
          {CHIPS.map(({ key, label, accent }) => {
            const pressed = filter === key;
            return (
              <button
                key={key}
                type="button"
                aria-pressed={pressed}
                onClick={() => onFilter(key)}
                className={clsx(
                  'ja-chip rounded-full border px-3 py-1 font-mono uppercase transition-colors duration-300',
                  !pressed &&
                    'border-white/15 text-white/45 hover:border-white/35 hover:text-white/80',
                )}
                style={
                  pressed
                    ? {
                        borderColor: `${accent}88`,
                        color: accent,
                        background: `${accent}14`,
                      }
                    : undefined
                }
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* The grid. A focusable region because it always pans — GRID_W is
          wider than the section on every screen (see the fixed-metric note
          above), so laptop and phone get the same sideways scroll. */}
      <div
        ref={scrollerRef}
        role="region"
        aria-label="Overlap atlas: every role and course as parallel bars on one time axis"
        tabIndex={0}
        className="ja-scroller mt-6 overflow-x-auto pb-1.5"
      >
        {/* Width follows the data (skeleton uses the clock-free minimum span,
            so mount can only widen it, invisibly, inside this scroller). The
            padding is the run-out: the final year's centred label plus the
            caption-floored right-edge bars live there. */}
        <div
          style={{
            width: scale
              ? scale.gridW
              : LABEL_W + STRUCTURE.minSpan * PX_PER_MONTH + RUNOUT_W,
            paddingRight: RUNOUT_W,
          }}
        >
          <div className="relative">
            {/* Year axis — decorative; every bar carries its dates itself. */}
            <div
              aria-hidden
              className="relative h-6"
              style={{ marginLeft: LABEL_W }}
            >
              {scale &&
                scale.years.map((m) => (
                  <div
                    key={m}
                    className="absolute top-0 -translate-x-1/2"
                    style={{ left: scale.px(m) }}
                  >
                    {/* Year labels wear the page-title ember (owner
                        correction — the grey axis didn't belong to the
                        theme); the tick above each echoes it softer. */}
                    <span className="mx-auto block h-2 w-px bg-[#ff6d05]/60" />
                    <span className="ja-axis mt-0.5 block text-center font-mono text-[#ff6d05]">
                      {Math.floor(m / 12)}
                    </span>
                  </div>
                ))}
            </div>

            {/* Year rules behind the lanes. */}
            <div
              aria-hidden
              className="pointer-events-none absolute bottom-0 right-0 top-6"
              style={{ left: LABEL_W }}
            >
              {scale &&
                scale.years.map((m) => (
                  // Gold hairlines, not white/[0.06] — the near-invisible
                  // white rules sank into the black ground (owner
                  // correction: the grid needs real contrast).
                  <span
                    key={m}
                    className="absolute bottom-0 top-0 w-px bg-[#f9d174]/20"
                    style={{ left: scale.px(m) }}
                  />
                ))}
            </div>

            {/* Lane groups — the deterministic frame: rows and their packed
              heights render on the server, bars land after mount. */}
            {STRUCTURE.groups.map(({ type, label, items, laneCount }) => {
              const accent = ACCENTS[type].color;
              return (
                <div
                  key={type}
                  className="flex items-start border-t border-white/10 py-3.5 first:border-t-0"
                >
                  {/* STICKY within the pan (position:sticky against the
                      scroller, a flex-item's containing scrollport): the
                      grid opens panned to NOW and the labels used to live
                      only at its far-left edge, so every lane read nameless
                      until you panned all the way back. The column is a
                      FULL-HEIGHT panel (owner correction — a text-height
                      scrim let bars peek out beneath it): self-stretch
                      fills the row, and the backing span bleeds over the
                      row's py-3.5 so no bar sliver survives at any lane
                      depth, closed by a hairline right edge. pointer-
                      events-none so a covered bar stays clickable. */}
                  <div
                    className="ja-lane pointer-events-none sticky left-0 z-20 shrink-0 self-stretch pt-1.5 font-mono uppercase tracking-[0.16em]"
                    style={{ width: LABEL_W, color: accent }}
                  >
                    <span
                      aria-hidden
                      className="absolute -bottom-3.5 -top-3.5 left-0 right-0"
                      style={{
                        background: 'rgba(2,6,17,0.97)',
                        boxShadow: '1px 0 0 rgba(255,255,255,0.08)',
                      }}
                    />
                    <span className="relative flex items-center gap-1.5">
                      <span
                        aria-hidden
                        className="h-1.5 w-1.5 rounded-full bg-current"
                      />
                      {label}
                    </span>
                    <span className="relative mt-0.5 block normal-case tracking-[0.06em] text-white/40">
                      {items.length} {items.length === 1 ? 'entry' : 'entries'}
                    </span>
                  </div>

                  <div
                    className="relative flex-1"
                    style={{ height: laneCount * LANE_STEP - BAR_GAP }}
                  >
                    {scale &&
                      items.map((d) => {
                        const isDim = filter !== 'all' && d.type !== filter;
                        // Closed bars: month-true width (inclusive month
                        // cells), floored at the caption. Open bars: clamped
                        // so the right edge lands EXACTLY on the NOW line —
                        // never floored, never past now (owner correction);
                        // one that can't hold its caption prints it outside,
                        // to the LEFT (packing reserved that room via `fs`).
                        const width = d.open
                          ? Math.max((nowM - d.s) * PX_PER_MONTH, 8)
                          : Math.max((d.e - d.s + 1) * PX_PER_MONTH, d.capPx);
                        const captionLeft = d.open && d.capPx > width;
                        return (
                          <button
                            key={d.id}
                            type="button"
                            data-active={
                              d.year === activeYear ? 'true' : undefined
                            }
                            onClick={() => jump(d)}
                            title={`${d.title} — ${d.dateLabel}`}
                            aria-label={`Jump to ${d.title}, ${spokenDates(d)}`}
                            className={clsx(
                              // No overflow-hidden and no truncation — the
                              // caption is a promise (owner direction: org
                              // and role fully visible), guaranteed by the
                              // closed-bar floor / open-bar left spill plus
                              // the packing reservation.
                              'ja-bar absolute flex items-center rounded-md border px-2.5 text-left font-mono',
                              d.open ? 'border-dashed' : 'border-solid',
                              isDim && 'pointer-events-none opacity-[0.13]',
                            )}
                            style={{
                              '--ja-accent': accent,
                              left: scale.px(d.s),
                              width,
                              top: d.lane * LANE_STEP,
                              height: BAR_H,
                            }}
                          >
                            <span
                              className={clsx(
                                'whitespace-nowrap',
                                // Outside-left caption: right edge pinned
                                // just before the bar starts, clear of the
                                // px-2.5 padding box.
                                captionLeft &&
                                  'absolute right-full mr-2 text-right',
                              )}
                            >
                              <span className="text-white/90">{d.org}</span>
                              <span className="text-white/50"> · {d.role}</span>
                            </span>
                          </button>
                        );
                      })}
                  </div>
                </div>
              );
            })}

            {/* The NOW line — the clock made spatial, in the EraRail needle's
              ember, drawn last so it reads over the bars it closes. */}
            {scale && (
              <div
                aria-hidden
                className="pointer-events-none absolute bottom-0 right-0 top-0"
                style={{ left: LABEL_W }}
              >
                <div
                  className="absolute bottom-0 top-0"
                  style={{ left: scale.px(nowM) }}
                >
                  <span className="ja-lane absolute top-0 -translate-x-1/2 whitespace-nowrap font-mono uppercase tracking-[0.2em] text-[#ff6d05]">
                    Now
                  </span>
                  <span
                    className="absolute top-5 h-[5px] w-[5px] -translate-x-1/2 rounded-full bg-[#ff6d05]"
                    style={{
                      filter: 'drop-shadow(0 0 4px rgba(255,109,5,0.8))',
                    }}
                  />
                  <span className="absolute bottom-0 top-5 w-px -translate-x-1/2 bg-gradient-to-b from-[#ff6d05]/80 via-[#ff6d05]/40 to-transparent" />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Reading key — fire ink (owner correction): each sentence runs the
          contact intro's per-word gold→ember ramp. */}
      <p className="ja-note mt-3 flex flex-wrap gap-x-5 gap-y-1 font-mono">
        <span>
          <FireText text="Select any bar to jump to it." />
        </span>
        <span>
          <FireText text="Dashed edge = still running." />
        </span>
        <span>
          <FireText text="Stacked bars = concurrent." />
        </span>
      </p>
    </motion.div>
  );
};

export default TimelineAtlas;
