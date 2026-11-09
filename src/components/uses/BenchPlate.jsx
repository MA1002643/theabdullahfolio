'use client';

import { m } from 'framer-motion';
import { ArrowUpRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useDataT } from '@/i18n/useDataT';
import { localizeBenchRow } from '@/i18n/data';
import { useDirection } from '@/i18n/useDirection';
import FireText from '@/components/shared/FireText';
import { USES_FLAGS } from '@/lib/flags';
import { fluid } from '@/lib/fluidScale';
import EditorFrame from './EditorFrame';
import Plate, { figTag } from './Plate';
import { useUsesFormat } from './useUsesFormat';
import { riseProps, staged, useStagedReveal } from './useStagedReveal';

// 01 · THE BENCH — the development environment: the six stations (editor,
// agentic pair, shell, formatting, type, browser tooling) run THREE ACROSS
// from `md` (tablets, laptops, desktops), the extensions row spans all three
// beneath them, and the DOM-built editor frame — real theme, sanitised
// settings excerpt — sits under the whole set at full width. Below `md` it is
// one column, stations then frame, unchanged. (Owner correction 2026-09-05:
// the earlier 5/7 split, list beside frame, made the single list column very
// tall at every laptop width.) Roles are mono amber labels, names wear the
// fire ink, details sit at the ≥/60 informational contrast. External links
// open in a new tab with the footer's "(opens in a new tab)" aria suffix and
// underline in the page title's own ember — never the foreground white.
//
// Reveal (owner correction 2026-09-06): every station POWERS ON on its own
// viewport gate — the hairline above it draws in, the role label slides in
// from the left, the name RISES THROUGH A MASK (the line-mask reveal: the
// text climbs up from below its own baseline box, clipped to that box, so
// it appears to be printed upward into place), then the detail line fades
// up. Three stations sharing a grid row land left→right (the hook's column
// offset). The extension chips pop in on a spring, 50ms apart, once their
// row arrives; the editor frame opens on its own gate (EditorFrame). Reduced
// motion: everything at rest.
const STATION_STEP_S = 0.1;
const CHIP_SPRING = { type: 'spring', stiffness: 420, damping: 24 };

function Station({ item, index, revealed, reduceMotion, revealedAtRef }) {
  const t = useTranslations('Uses');
  // The role label slides in from the reading-start side (issue #82).
  const { sign } = useDirection();
  const { ref, on, delay, instant } = useStagedReveal({
    revealed,
    reduceMotion,
    revealedAtRef,
    index,
    step: STATION_STEP_S,
    base: 0.1,
    columnStagger: 0.16,
  });
  // `instant`: focus arrived before the reveal, so its link lands at once.
  const at = (offset, duration) => staged(reduceMotion || instant, delay, offset, duration);

  return (
    <li
      ref={ref}
      className="uses-row relative grid min-w-0 gap-y-0.5"
      style={{ paddingBlock: fluid(0.7) }}
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
      <span className="uses-label font-mono uppercase text-[#ffaa2a]">
        <m.span
          className="uses-anim inline-block"
          initial={reduceMotion ? false : { opacity: 0, x: -12 * sign }}
          animate={on ? { opacity: 1, x: 0 } : { opacity: 0, x: reduceMotion ? 0 : -12 * sign }}
          transition={at(0.02, 0.5)}
        >
          {item.role}
        </m.span>
      </span>
      <span className="uses-value uses-mask font-medium">
        <m.span
          className="uses-anim uses-mask__in"
          initial={reduceMotion ? false : { y: '140%' }}
          animate={{ y: on || reduceMotion ? '0%' : '140%' }}
          transition={at(0.12, 0.6)}
        >
          {item.link ? (
            <a
              href={item.link}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t('opensNewTab', { name: item.name })}
              className="inline-flex items-baseline gap-1 decoration-[#ff6d05] underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ff6d05]"
            >
              <span translate="no">
                <FireText text={item.name} />
              </span>
              <ArrowUpRight
                aria-hidden="true"
                className="h-3 w-3 self-center text-[#ffaa2a]"
              />
            </a>
          ) : (
            // A station is named for its tools: names, not prose (data.js
            // keeps them so — prose belongs in the translated `detail`).
            <span translate="no">
              <FireText text={item.name} />
            </span>
          )}
        </m.span>
      </span>
      {item.detail ? (
        <m.span
          className="uses-anim uses-note text-foreground/60"
          {...riseProps(on, reduceMotion, at(0.3, 0.5), 6)}
        >
          {item.detail}
        </m.span>
      ) : null}
    </li>
  );
}

function Extensions({ extensions, index, revealed, reduceMotion, revealedAtRef }) {
  const t = useTranslations('Uses');
  const { sign } = useDirection();
  const { ref, on, delay } = useStagedReveal({
    revealed,
    reduceMotion,
    revealedAtRef,
    index,
    step: STATION_STEP_S,
    base: 0.1,
  });

  return (
    <li
      ref={ref}
      className="relative grid min-w-0 gap-y-1.5 md:col-span-3"
      style={{ paddingBlock: fluid(0.7) }}
    >
      <m.span
        className="uses-anim uses-label inline-block font-mono uppercase text-[#ffaa2a]"
        initial={reduceMotion ? false : { opacity: 0, x: -12 * sign }}
        animate={on ? { opacity: 1, x: 0 } : { opacity: 0, x: reduceMotion ? 0 : -12 * sign }}
        transition={staged(reduceMotion, delay, 0, 0.5)}
      >
        {t('bench.extensions')}
      </m.span>
      {/* Extension names, as the marketplace lists them: translate="no". */}
      <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0" translate="no">
        {extensions.map((ext, i) => (
          <m.li
            key={ext}
            className="uses-anim uses-chipmark rounded-full border border-[#ffcd5b]/35 px-2 py-0.5 font-mono text-foreground/70"
            initial={reduceMotion ? false : { opacity: 0, scale: 0.6, y: 6 }}
            animate={
              on
                ? { opacity: 1, scale: 1, y: 0 }
                : { opacity: 0, scale: reduceMotion ? 1 : 0.6, y: reduceMotion ? 0 : 6 }
            }
            transition={
              reduceMotion ? { duration: 0 } : { ...CHIP_SPRING, delay: delay + 0.12 + i * 0.05 }
            }
          >
            {ext}
          </m.li>
        ))}
      </ul>
    </li>
  );
}

export default function BenchPlate({ bench: source, extensions, frame }) {
  const t = useTranslations('Uses');
  const dataT = useDataT();
  const { num, ord } = useUsesFormat();
  // Roles and details translated; tool names, links and extension ids never.
  const bench = source.map((item) => localizeBenchRow(item, dataT));
  return (
    <Plate
      slug="bench"
      ordinal={ord(1)}
      eyebrow={t('bench.eyebrow')}
      title={t('bench.title')}
      provenance={t.rich('bench.provenance', {
        count: bench.length,
        n: num(bench.length),
        file: frame.fileName,
        fig: figTag,
      })}
    >
      {({ revealed, reduceMotion, revealedAtRef }) => (
        // One `minmax(0,1fr)` column with `min-w-0` items at EVERY width, not
        // a bare auto column: the editor frame's <pre> (white-space: pre, its
        // own horizontal scroller) would otherwise set the column's minimum
        // to its longest line and push the whole plate past a phone's edge.
        <div
          className="grid grid-cols-[minmax(0,1fr)] items-start"
          style={{ gap: fluid(2) }}
        >
          {/* The stations: a plain list on a phone, a 3-across grid from md.
              `uses-bench__stations` scopes the hairline correction in
              globals.css — each row draws its own rule element, so without
              it the first grid row's 2nd and 3rd cells would be ruled above. */}
          <ul
            className="uses-bench__stations m-0 min-w-0 list-none p-0 md:grid md:grid-cols-3"
            style={{ columnGap: fluid(2) }}
          >
            {bench.map((item, i) => (
              <Station
                key={item.name}
                item={item}
                index={i}
                revealed={revealed}
                reduceMotion={reduceMotion}
                revealedAtRef={revealedAtRef}
              />
            ))}

            {extensions?.length ? (
              <Extensions
                extensions={extensions}
                index={bench.length}
                revealed={revealed}
                reduceMotion={reduceMotion}
                revealedAtRef={revealedAtRef}
              />
            ) : null}
          </ul>

          {/* The editor frame, under all three columns at full width. */}
          <div className="min-w-0">
            {USES_FLAGS.editorFrame ? (
              <EditorFrame
                frame={frame}
                revealed={revealed}
                reduceMotion={reduceMotion}
                revealedAtRef={revealedAtRef}
              />
            ) : null}
          </div>
        </div>
      )}
    </Plate>
  );
}
