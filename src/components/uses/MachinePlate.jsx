'use client';

import { m } from 'framer-motion';
import { ArrowDownRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useDataT } from '@/i18n/useDataT';
import { localizeMachineRow } from '@/i18n/data';
import { useDirection } from '@/i18n/useDirection';
import FireText from '@/components/shared/FireText';
import { useCardTilt } from '@/hooks/useCardTilt';
import { USES_FLAGS } from '@/lib/flags';
import { fluid } from '@/lib/fluidScale';
import Plate, { figTag } from './Plate';
import { useUsesFormat } from './useUsesFormat';
import { riseProps, staged, useStagedReveal } from './useStagedReveal';

// 00 · THE MACHINE — the hardware, typeset as an engraved nameplate: a single
// wide plate in the uniform gold frame (`custom-bg-abt`, exactly /about's),
// a graduation-tick strip etched along its top edge (the instrument
// metaphor), label column in mono uppercase, value column in the site's fire
// ink. Rows are separated by the footer's ember hairline. A real <dl>: the
// labels ARE terms and the values ARE definitions.
//
// Reveal (owner correction 2026-09-06 — "the machine has no scroll effect"):
// the plate is ENGRAVED, row by row, each row on its own viewport gate
// (useStagedReveal). Per row: the hairline above it draws left→right; the
// label lands as a stamp — its tracking settles from wide (0.42em) to the
// column's 0.18em as it fades in; the value is CUT in behind a travelling
// ember cutter — a clip-path wipe left→right with a 2px lit edge riding the
// wipe front (the same duration and ease, so the edge is always exactly
// where the cut is), the note and cross-reference rising once the cut has
// passed. The nameplate itself rises 20px and its frame's glow settles as
// the first row starts. At page load every row is on screen at once, so
// they cascade 140ms apart (the plate's "same beat" stagger); a row reached
// by scrolling plays alone, immediately. Reduced motion: every layer at
// rest, no cutter rendered.
//
// The plate reads as a physical object, so it is one of the two surfaces
// that carry `useCardTilt` (±4°, spring physics, ember glare) — inert on
// touch and under reduced motion by the hook's own gate, and killable via
// USES_FLAGS.tilt.
//
// The Phone row is a genuine cross-reference, not decoration: the town in the
// footer's live-location plate comes from that device, and the row links to
// it (same-page anchor — `#footer-location`).
const CUT_S = 0.85;
const CUT_EASE = [0.65, 0, 0.35, 1];
const ROW_STEP_S = 0.14;
const ROW_BASE_S = 0.2;

// The cut runs in reading direction (issue #82): left→right, or right→left in
// an RTL document, where the value text starts at the right edge. Shut, the
// clip hides the whole box from the far side; open, it hides nothing.
const CUT = {
  ltr: { shut: 'inset(0 100% 0 0)', open: 'inset(0 0% 0 0)', from: '0%', to: '100%' },
  rtl: { shut: 'inset(0 0 0 100%)', open: 'inset(0 0 0 0%)', from: '100%', to: '0%' },
};

function MachineRow({ row, index, revealed, reduceMotion, revealedAtRef }) {
  const t = useTranslations('Uses');
  const { dir } = useDirection();
  const cut = CUT[dir];
  const { ref, on, delay, instant } = useStagedReveal({
    revealed,
    reduceMotion,
    revealedAtRef,
    index,
    step: ROW_STEP_S,
    base: ROW_BASE_S,
  });
  // `instant`: focus reached the row's link before the reveal, so it lands at once.
  const at = (offset, duration, ease) => staged(reduceMotion || instant, delay, offset, duration, ease);
  const cutStart = 0.12;
  const afterCut = cutStart + CUT_S * 0.7;

  return (
    <div
      ref={ref}
      className="uses-row relative grid items-baseline gap-x-6 gap-y-1 sm:grid-cols-[9rem_1fr]"
      style={{ paddingBlock: fluid(0.75) }}
    >
      {index > 0 ? (
        <m.span
          aria-hidden="true"
          className="uses-anim uses-row__rule"
          initial={reduceMotion ? false : { scaleX: 0 }}
          animate={{ scaleX: on ? 1 : reduceMotion ? 1 : 0 }}
          transition={at(0, 0.6)}
        />
      ) : null}

      <dt className="uses-label font-mono uppercase text-foreground/60">
        {/* The stamp: tracking settles wide→column as it lands. The guard
            class pins `letter-spacing: inherit` (the dt's own 0.18em) under
            reduced motion on the first paint. */}
        <m.span
          className="uses-anim uses-anim-track inline-block"
          initial={reduceMotion ? false : { opacity: 0, letterSpacing: '0.42em' }}
          animate={
            on
              ? { opacity: 1, letterSpacing: '0.18em' }
              : { opacity: 0, letterSpacing: reduceMotion ? '0.18em' : '0.42em' }
          }
          transition={at(0.04, 0.6)}
        >
          {row.label}
        </m.span>
      </dt>

      <dd className="uses-value min-w-0 font-light">
        <span className="relative block">
          {/* The cut — a clip wipe over the fire ink… */}
          <m.span
            className="uses-anim uses-anim-clip block"
            initial={reduceMotion ? false : { clipPath: cut.shut }}
            animate={{
              clipPath: on || reduceMotion ? cut.open : cut.shut,
            }}
            transition={at(cutStart, CUT_S, CUT_EASE)}
          >
            <FireText text={row.value} />
          </m.span>
          {/* …and the cutter riding its front: same duration, same ease, so
              the lit edge sits exactly on the wipe. Lit for the middle of
              the travel, dark at both ends. Not rendered under reduced
              motion — there is no cut to lead. */}
          {reduceMotion ? null : (
            <m.span
              aria-hidden="true"
              className="uses-cutter"
              initial={{ left: cut.from, opacity: 0 }}
              animate={on ? { left: cut.to, opacity: [0, 1, 1, 0] } : { left: cut.from, opacity: 0 }}
              transition={{
                left: at(cutStart, CUT_S, CUT_EASE),
                opacity: {
                  duration: CUT_S,
                  delay: delay + cutStart,
                  times: [0, 0.06, 0.86, 1],
                  ease: 'linear',
                },
              }}
            />
          )}
        </span>
        {row.note ? (
          <m.span
            className="uses-anim uses-note mt-1 block text-foreground/60"
            {...riseProps(on, reduceMotion, at(afterCut, 0.5), 6)}
          >
            {row.note}
          </m.span>
        ) : null}
        {row.href ? (
          <m.a
            href={row.href}
            className="uses-anim uses-xref mt-1.5 inline-flex items-center gap-1 font-mono uppercase text-[#ffaa2a] underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ff6d05]"
            {...riseProps(on, reduceMotion, at(afterCut + 0.1, 0.5), 6)}
          >
            {row.hrefLabel || t('machine.seeItLive')}
            <ArrowDownRight aria-hidden="true" className="h-3 w-3" />
          </m.a>
        ) : null}
      </dd>
    </div>
  );
}

export default function MachinePlate({ rows: source }) {
  const t = useTranslations('Uses');
  const dataT = useDataT();
  const { num, ord } = useUsesFormat();
  // Labels, values and notes in the reader's language (the Data catalogue,
  // keyed by each row's English label); hrefs untouched.
  const rows = source.map((row) => localizeMachineRow(row, dataT));
  const tilt = useCardTilt({ maxTilt: 4 });
  const tiltOn = USES_FLAGS.tilt && tilt.enabled;

  return (
    <Plate
      slug="machine"
      ordinal={ord(0)}
      eyebrow={t('machine.eyebrow')}
      title={t('machine.title')}
      provenance={t.rich('machine.provenance', {
        count: rows.length,
        n: num(rows.length),
        fig: figTag,
      })}
    >
      {({ revealed, reduceMotion, revealedAtRef }) => (
        <Nameplate
          rows={rows}
          revealed={revealed}
          reduceMotion={reduceMotion}
          revealedAtRef={revealedAtRef}
          tilt={tilt}
          tiltOn={tiltOn}
        />
      )}
    </Plate>
  );
}

function Nameplate({ rows, revealed, reduceMotion, revealedAtRef, tilt, tiltOn }) {
  // The plate's own gate: it rises as a whole while its first row starts
  // engraving. `data-lit` lets the CSS settle the frame's glow from a soft
  // bloom to the About card's rest value once it has landed.
  const { ref, on, delay, instant } = useStagedReveal({ revealed, reduceMotion, revealedAtRef });

  return (
    <m.div
      ref={ref}
      className="uses-anim uses-nameplate custom-bg-abt relative isolate overflow-hidden rounded-xl"
      data-lit={on ? 'true' : 'false'}
      style={{
        ...(tiltOn ? tilt.style : {}),
        padding: `${fluid(1.75)} ${fluid(1.5)} ${fluid(1.25)}`,
      }}
      {...(tiltOn ? tilt.handlers : {})}
      {...riseProps(on, reduceMotion, staged(reduceMotion || instant, delay, 0, 0.7), 20)}
    >
      {tiltOn ? (
        <m.div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-xl"
          style={tilt.glareStyle}
        />
      ) : null}

      <dl className="relative">
        {rows.map((row, i) => (
          <MachineRow
            key={row.label}
            row={row}
            index={i}
            revealed={revealed}
            reduceMotion={reduceMotion}
            revealedAtRef={revealedAtRef}
          />
        ))}
      </dl>
    </m.div>
  );
}
