'use client';

import { Fragment, useEffect, useRef, useState } from 'react';
import { m, useInView } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { useDirection } from '@/i18n/useDirection';
import { useViewportCountUp } from '@/hooks/useViewportCountUp';
import { fluid } from '@/lib/fluidScale';
import {
  METER_SEGMENTS,
  meterSegments,
  repoFigureParts,
  usageTotal,
} from '@/lib/uses/stack';
import { describeTool } from '@/lib/uses/toolCopy';
import { useUsesFormat } from './useUsesFormat';
import { cn } from '@/lib/utils';
import { getIconUrl } from '@/utils/skillsIconUrl';
import { riseProps, staged, useStagedReveal } from './useStagedReveal';

// One instrument card in the Stack ledger (see ToolGrid): icon · name · rank
// ordinal on the head line, a one-sentence plain-English description, then
// the usage meter with its figure. Not a button — it discloses nothing; the
// card IS the information. Hover only brightens the frame and lifts the icon
// a hair (CSS), and both are dropped under reduced motion.
//
// Frame: the About page's card border — the gold hairline (`#ffcd5b` at 80%)
// with its orangered glow and hover bloom (owner correction 2026-09-06: "the
// same border line as the card on the about page"); the fill stays the
// ledger's own near-black.
//
// Reveal (same correction — the cards had no scroll effect): each card owns
// its viewport gate (useStagedReveal) and is DEALT onto the ledger — it
// rises 22px while its top leans back from 9° (perspective 900, origin at
// the foot, the card landing flat), and the frame's glow settles from a
// soft bloom to the About rest value once it is down (`data-lit`, CSS).
// Inside, in order: the icon drops in on a spring, the name rises through
// its line mask, the description fades up, the rank ordinal slides in from
// the right, the meter's lit segments fill left→right ONE BY ONE — each
// segment rises and lights 80ms after the last (a CSS transition per
// segment, delays set inline via `--d`), so a three-segment bar reads as
// three landings, not one slab (owner correction 2026-09-06: they "fill in
// all at once") — and the figure fades in last. Its digits — `13 repos · 9
// public · 4 private` — then COUNT UP from zero on the About page's shared
// `useViewportCountUp`.
//
// Both the meter and the count REPLAY every time the meter scrolls into
// view (owner ask): they hang off a live observer on the meter block, not
// the card's once-only reveal gate. The meter's `data-fill` is held through
// a brief exit (a scroll that brushes the edge must not drain it) and drops
// only after a sustained one, which fades the segments out together and
// re-arms them to fill in sequence on the next entry. The first fill waits
// for the card to land (`--d` counts from the card's own delay); a replay
// runs from the moment the meter is back on screen. The first count waits
// for the figure to have landed (`landed`, a timer on the card's own delay)
// so it is watched from zero rather than caught mid-climb behind the fade;
// re-entries count at once. Cards sharing a grid row land left→right;
// cards on screen when the plate reveals cascade 70ms apart. The track is
// the accessible node — `role="img"` with the count sentence — and the
// visible figure beside it is aria-hidden so the number is announced once,
// at its final value. Reduced motion: at rest, meters simply on, figures at
// their final value.

const STEP_S = 0.07; // same-beat cascade between cards
const COLUMN_S = 0.18; // left→right across a shared grid row
const LAND_S = 0.55;
const METER_AFTER_MS = 320; // segments start once the card is down
const SEG_STEP_MS = 80; // one segment lands after the last — never as a slab
const FILL_RESET_MS = 600; // a sustained exit re-arms the meter for its next entry
const FIGURE_AT_S = 0.42; // the figure's fade-in, after the card's delay
const ICON_SPRING = { type: 'spring', stiffness: 300, damping: 18 };

// True the moment `inView` is; false only once it has been false for
// `resetMs` — hysteresis on the exit, so a quick re-entry keeps the meter
// full and a genuine exit re-arms it.
function useSustained(inView, resetMs) {
  const [held, setHeld] = useState(inView);
  useEffect(() => {
    if (inView) {
      setHeld(true);
      return undefined;
    }
    const id = setTimeout(() => setHeld(false), resetMs);
    return () => clearTimeout(id);
  }, [inView, resetMs]);
  return held;
}

// One climbing digit run of the figure. Its own component so each part of
// `13 repos · 9 public · 4 private` owns a ref + tween without the tile
// calling hooks in a loop (the part count varies per card).
function CountFigure({ to, counting, reduceMotion }) {
  const ref = useRef(null);
  const { num, countFormat } = useUsesFormat();
  useViewportCountUp(ref, {
    to,
    inView: counting,
    prefersReducedMotion: reduceMotion,
    format: countFormat,
  });
  return <b ref={ref}>{num(reduceMotion ? to : 0)}</b>;
}

// The tile's one-line description: the catalogue's copy of TOOL_COPY (the
// UsesTools namespace mirrors it under `tools` — tests/unit/usesI18n pins
// the two equal), else the category's generic line (`UsesTools.generic`),
// else describeTool's own fallback. Same precedence as describeTool, in the
// reader's language. UsesTools is deferred (see useToolCopy.jsx), so a tile
// can be on screen before its line is: describeTool's English covers the gap.
// The generic lines live there rather than in `Uses` because only a tile the
// live crawl surfaces can need one, and the crawl is what the fetch waits on.
function useToolDescription(slug, category) {
  const tools = useTranslations('UsesTools');
  if (tools.has(`tools.${slug}`)) return tools(`tools.${slug}`);
  if (!describeTool(slug, '') && tools.has(`generic.${category}`)) {
    return tools(`generic.${category}`);
  }
  return describeTool(slug, category);
}

// "used in 7 public repos · +2 private", as one plural message per shape —
// the same three shapes and the same null as stack.js `repoCountCopy`.
function repoSentence(t, item) {
  const pub = Array.isArray(item?.repos) ? item.repos.length : 0;
  const priv = usageTotal(item) - pub;
  if (pub === 0 && priv === 0) return null;
  if (pub === 0) return t('stack.repoCount.private', { priv });
  return priv > 0
    ? t('stack.repoCount.mixed', { pub, priv })
    : t('stack.repoCount.public', { pub });
}

// The figure's unit words, keyed off stack.js' English units so the parts
// (and their order) stay that module's decision.
const UNIT_KEY = {
  'public repo': 'publicRepos',
  'public repos': 'publicRepos',
  'private repo': 'privateRepos',
  'private repos': 'privateRepos',
  repos: 'repos',
  public: 'public',
  private: 'private',
};

export default function ToolTile({
  item,
  category,
  rank,
  index,
  max,
  counted,
  revealed,
  reduceMotion,
  revealedAtRef,
  onHidden,
}) {
  const t = useTranslations('Uses');
  const { sign } = useDirection();
  const description = useToolDescription(item.slug, category);
  const { ref, on, delay } = useStagedReveal({
    revealed,
    reduceMotion,
    revealedAtRef,
    index,
    step: STEP_S,
    base: 0.1,
    columnStagger: COLUMN_S,
  });
  const seg = meterSegments(item, max);
  const parts = repoFigureParts(item);
  const sentence = repoSentence(t, item);
  const at = (offset, duration) =>
    staged(reduceMotion, delay, offset, duration);
  const litMs = Math.round(delay * 1000) + METER_AFTER_MS;

  // One live observer on the meter block drives both the segment fill and
  // the figure's count-up, so both replay on every re-entry.
  const meterRef = useRef(null);
  const meterInView = useInView(meterRef, {
    amount: 'some',
    margin: '0px 0px -6% 0px',
  });
  const meterHeld = useSustained(meterInView, FILL_RESET_MS);
  const fill = reduceMotion || (on && meterHeld);
  // After the first drain every fill is a replay: no landing wait.
  const [replay, setReplay] = useState(false);
  const wasFilled = useRef(false);
  useEffect(() => {
    if (fill) wasFilled.current = true;
    else if (wasFilled.current) setReplay(true);
  }, [fill]);
  const fillBase = replay ? 0 : litMs;
  const [landed, setLanded] = useState(false);
  useEffect(() => {
    if (!on || landed) return undefined;
    if (reduceMotion) {
      setLanded(true);
      return undefined;
    }
    const id = setTimeout(
      () => setLanded(true),
      Math.round((delay + FIGURE_AT_S) * 1000),
    );
    return () => clearTimeout(id);
  }, [on, landed, reduceMotion, delay]);
  const counting = on && landed && meterInView;

  return (
    <m.li
      ref={ref}
      className="uses-anim uses-tool flex min-w-0 flex-col"
      data-slug={item.slug}
      data-lit={on ? 'true' : 'false'}
      style={{
        padding: `${fluid(0.8)} ${fluid(0.9)} ${fluid(0.85)}`,
        transformPerspective: 900,
        originY: 1,
      }}
      initial={reduceMotion ? false : { opacity: 0, y: 22, rotateX: 9 }}
      animate={
        on
          ? { opacity: 1, y: 0, rotateX: 0 }
          : { opacity: 0, y: 22, rotateX: 9 }
      }
      transition={at(0, LAND_S)}
    >
      <div className="uses-tool__head grid items-center">
        {/* The hover lift is a CSS transform on the outer span; the drop-in
            is framer's on the image, so the two never fight over one
            inline `transform`. */}
        <span className="uses-tool__icon block">
          <m.img
            className="uses-anim"
            src={getIconUrl(item.slug, item.source)}
            alt=""
            width={36}
            height={36}
            loading="lazy"
            decoding="async"
            draggable={false}
            onError={onHidden}
            initial={reduceMotion ? false : { opacity: 0, scale: 0.4, y: -8 }}
            animate={
              on
                ? { opacity: 1, scale: 1, y: 0 }
                : { opacity: 0, scale: 0.4, y: -8 }
            }
            transition={
              reduceMotion
                ? { duration: 0 }
                : { ...ICON_SPRING, delay: delay + 0.14 }
            }
          />
        </span>
        <span className="uses-tool__name uses-mask block min-w-0">
          <m.span
            className="uses-anim uses-mask__in truncate"
            // A tool's name: translate="no" (the pseudo-locale gate reads it).
            translate="no"
            initial={reduceMotion ? false : { y: '140%' }}
            animate={{ y: on ? '0%' : '140%' }}
            transition={at(0.18, 0.55)}
          >
            {item.displayName}
          </m.span>
        </span>
        <m.span
          aria-hidden="true"
          className="uses-anim uses-tool__rank font-mono tabular-nums"
          // The rank sits at the inline end, so it slides in from that side.
          initial={reduceMotion ? false : { opacity: 0, x: 8 * sign }}
          animate={on ? { opacity: 1, x: 0 } : { opacity: 0, x: 8 * sign }}
          transition={at(0.3, 0.45)}
        >
          {rank}
        </m.span>
      </div>

      <m.p
        className="uses-anim uses-tool__desc"
        {...riseProps(on, reduceMotion, at(0.26, 0.5), 6)}
      >
        {description}
      </m.p>

      {/* Track first at full width, figure beneath: every bar on the plate
          is the same length, so fills compare across cards. */}
      <div ref={meterRef} className="uses-meter mt-auto" data-fill={fill ? 'true' : 'false'}>
        <div
          className="uses-meter__track grid"
          role="img"
          aria-label={
            sentence
              ? t('stack.meterLabel', { name: item.displayName, sentence })
              : t('stack.meterPending', { name: item.displayName })
          }
        >
          {Array.from({ length: METER_SEGMENTS }, (_, i) => (
            <span
              key={i}
              className={cn(
                'uses-meter__seg',
                i < seg.public && 'is-public',
                i >= seg.public && i < seg.lit && 'is-private',
              )}
              style={{ '--d': `${fillBase + i * SEG_STEP_MS}ms` }}
            />
          ))}
        </div>
        <m.p
          className="uses-anim uses-tool__figure m-0 font-mono"
          aria-hidden="true"
          {...riseProps(on, reduceMotion, at(FIGURE_AT_S, 0.45), 4)}
        >
          {parts
            ? parts.map((p, i) => (
                <Fragment key={p.unit}>
                  {i > 0 ? ' · ' : null}
                  <CountFigure
                    to={p.n}
                    counting={counting}
                    reduceMotion={reduceMotion}
                  />{' '}
                  {UNIT_KEY[p.unit]
                    ? t(`stack.figure.${UNIT_KEY[p.unit]}`, { n: p.n })
                    : p.unit}
                </Fragment>
              ))
            : counted
              ? '—'
              : t('stack.curated')}
        </m.p>
      </div>
    </m.li>
  );
}
