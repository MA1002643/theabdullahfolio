'use client';

import { motion } from 'framer-motion';
import FireText from '@/components/shared/FireText';
import { fluid } from '@/lib/fluidScale';
import Plate, { Figure } from './Plate';
import { riseProps, staged, useStagedReveal } from './useStagedReveal';

// 05 · BILL OF MATERIALS — this site's own manifest, read at build: EVERY
// dependency and devDependency package.json declares, sorted into groups by
// rule (buildFacts.js `BOM_RULES` — patterns, never a list of names, so a
// package added tomorrow appears on the next build and a removed one goes;
// owner ask 2026-09-07), each with the version package-lock.json actually
// resolved for it — `^3.3.0` in the manifest is Tailwind 3.4.17 in the build
// (owner audit 2026-09-06: "pinned" was the wrong word for a caret range,
// and three resolve higher; the range is the fallback when the lockfile has
// no entry). Names in mono wearing the bench's station-name fire ink,
// versions in the page title's ember (owner ask 2026-09-07 — the readout
// reads as a readout, the label as a label), dotted leaders between them.
// The foot line: the package count, the .nvmrc (local dev —
// Vercel resolves `engines`; see the pipeline plate), the engines range and
// the build stamp — every figure in the title's ember, the words grey.
//
// Reveal (owner ask, same day): each group owns its viewport gate and
// PRINTS — its heading rises through a line mask, then row by row, 80ms
// apart (the ledger meter's segment beat — one rhythm across the page), the
// name rises, the dotted leader draws left→right and the version stamps in
// (a hair large and ember, settling to its amber). The foot line arrives
// last on its own gate. Reduced motion: at rest.
// The group lead-in halved when the bill went from 4 hand-picked groups to
// the manifest's 8 (2026-09-07): at the old 0.16 the last heading waited
// 1.22s before it began, which read as a stall rather than a cascade. 0.09
// keeps the last group starting at about the beat four groups used to.
const GROUP_STEP_S = 0.09;
const ROW_S = 0.08;

const maskRise = (on, reduceMotion, transition) => ({
  initial: reduceMotion ? false : { y: '140%' },
  animate: { y: on ? '0%' : reduceMotion ? '0%' : '140%' },
  transition,
});

function LedgerGroup({ group, index, revealed, reduceMotion, revealedAtRef }) {
  const { ref, on, delay } = useStagedReveal({
    revealed,
    reduceMotion,
    revealedAtRef,
    index,
    step: GROUP_STEP_S,
    base: 0.1,
  });
  const at = (offset, duration) => staged(reduceMotion, delay, offset, duration);

  return (
    <dl ref={ref} className="m-0">
      <dt className="uses-eyebrow uses-mask font-mono uppercase" style={{ marginBottom: fluid(0.4) }}>
        <motion.span className="uses-anim uses-mask__in" {...maskRise(on, reduceMotion, at(0, 0.5))}>
          {group.label}
        </motion.span>
      </dt>
      {group.items.map((item, i) => {
        const rowAt = 0.12 + i * ROW_S;
        return (
          <dd key={item.name} className="uses-ledger__row m-0 flex items-baseline gap-2 font-mono">
            {/* The row label wears the bench's station-name ink (owner ask
                2026-09-07: "the same colour that is applied to the Visual
                Studio Code text"): FireText's per-word slice of the shared
                gold→ember ramp. A package name is one word, so each takes
                the ramp's bright-gold head, exactly as that station's first
                word does. The explicit colour on the wrapper is the
                fallback the clipped fill sits over — it also paints
                `truncate`'s ellipsis, which the clip never reaches. */}
            <span className="uses-ledger__name uses-mask min-w-0 text-[#ffd27d]">
              <motion.span
                className="uses-anim uses-mask__in truncate"
                {...maskRise(on, reduceMotion, at(rowAt, 0.5))}
              >
                <FireText text={item.name} />
              </motion.span>
            </span>
            <motion.span
              aria-hidden="true"
              className="uses-anim uses-ledger__leader"
              style={{ originX: 0 }}
              initial={reduceMotion ? false : { scaleX: 0 }}
              animate={{ scaleX: on ? 1 : reduceMotion ? 1 : 0 }}
              transition={at(rowAt + 0.08, 0.45)}
            />
            <motion.span
              // The number is the readout, so it rests in the page title's
              // ember (owner ask, same day). The stamp still lands a hair
              // large and BRIGHTER — the ramp's gold head — and settles to
              // that ember, so the gesture survives the recolour.
              className="uses-anim uses-ledger__version tabular-nums text-[#ff6d05]"
              style={{ originX: 1 }}
              initial={reduceMotion ? false : { opacity: 0, scale: 1.25, y: 2, color: '#ffd27d' }}
              animate={
                on
                  ? { opacity: 1, scale: 1, y: 0, color: '#ff6d05' }
                  : { opacity: reduceMotion ? 1 : 0, scale: 1, y: 0, color: '#ff6d05' }
              }
              transition={at(rowAt + 0.24, 0.55)}
            >
              {item.installed ?? item.version}
            </motion.span>
          </dd>
        );
      })}
    </dl>
  );
}

function Foot({ facts, total, index, revealed, reduceMotion, revealedAtRef }) {
  const { ref, on, delay } = useStagedReveal({
    revealed,
    reduceMotion,
    revealedAtRef,
    index,
    step: GROUP_STEP_S,
    base: 0.1,
  });
  const all = facts?.bom?.total ?? null;
  return (
    <motion.p
      ref={ref}
      className="uses-anim uses-caption font-mono uppercase text-foreground/60"
      style={{ marginTop: fluid(1.25) }}
      {...riseProps(on, reduceMotion, staged(reduceMotion, delay, 0.1, 0.5), 8)}
    >
      {total > 0 ? (
        <>
          <Figure>{total}</Figure>
          {/* The groups list the whole manifest, so the two agree and one
              figure says it. "N of M" survives only for the case where a
              future rule filters something out — never a silent gap. */}
          {all && all !== total ? (
            <>
              {' '}
              of <Figure>{all}</Figure>
            </>
          ) : null}{' '}
          packages
        </>
      ) : null}
      {facts?.node?.nvmrc ? (
        <>
          {' '}
          · .nvmrc <Figure>{facts.node.nvmrc}</Figure>
        </>
      ) : null}
      {facts?.node?.engines ? (
        <>
          {' '}
          · engines <Figure>{facts.node.engines}</Figure>
        </>
      ) : null}
      {facts?.builtAtLabel ? (
        <>
          {' '}
          · built <Figure>{facts.builtAtLabel}</Figure>
        </>
      ) : null}
    </motion.p>
  );
}

export default function BillOfMaterials({ facts }) {
  const groups = facts?.bom?.groups ?? null;
  const total = groups ? groups.reduce((n, g) => n + g.items.length, 0) : 0;
  // The lockfile is the source only when it resolved every listed package.
  const resolved = !!groups && groups.every((g) => g.items.every((i) => i.installed));
  const source = resolved ? 'package-lock.json' : 'package.json';
  // The date is the readout (ember, month included); the words the label.
  const provenance = facts?.builtAtLabel ? (
    <>
      {source} · verified at build · <Figure>{facts.builtAtLabel}</Figure>
    </>
  ) : (
    `${source} · verified at build`
  );

  return (
    <Plate
      slug="bom"
      ordinal="05"
      eyebrow="Bill of materials · this site"
      title="What it is made of"
      provenance={provenance}
    >
      {({ revealed, reduceMotion, revealedAtRef }) => (
        <div>
          {groups ? (
            <div className="grid sm:grid-cols-2" style={{ gap: `${fluid(1.25)} ${fluid(2.5)}` }}>
              {groups.map((g, gi) => (
                <LedgerGroup
                  key={g.label}
                  group={g}
                  index={gi}
                  revealed={revealed}
                  reduceMotion={reduceMotion}
                  revealedAtRef={revealedAtRef}
                />
              ))}
            </div>
          ) : (
            <p className="uses-note text-foreground/60">
              The manifest could not be read at build, so no versions are listed.
            </p>
          )}

          <Foot
            facts={facts}
            total={total}
            index={groups?.length ?? 0}
            revealed={revealed}
            reduceMotion={reduceMotion}
            revealedAtRef={revealedAtRef}
          />
        </div>
      )}
    </Plate>
  );
}
