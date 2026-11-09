'use client';

import { useRef, useState } from 'react';
import { m, useInView } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { useViewportCountUp } from '@/hooks/useViewportCountUp';
import { fluid } from '@/lib/fluidScale';
import { maxUsage, rankByUsage } from '@/lib/uses/stack';
import { CATEGORY_COPY } from '@/lib/uses/toolCopy';
import ToolTile from './ToolTile';
import { useUsesFormat } from './useUsesFormat';
import { riseProps, staged, useStagedReveal } from './useStagedReveal';

// The Stack plate's ledger (owner correction, 2026-09-05 — replaces the
// icon-only grid with its hover chip). The brief was precise: a reader from
// outside the industry must understand every category and every tool; the
// bare "1 · +2" count read too light; and the hover chip listing repositories
// duplicated the About page's Skills card, so the plate must not repeat it.
//
// What renders instead, per CATEGORY_ORDER group:
//   · a heading in plain English (CATEGORY_COPY.label) with a `7 of 42` tally
//     and a one-line strapline saying what the category IS;
//   · the tools as instrument cards, RANKED most-used first (rankByUsage),
//     each with its icon, name, rank ordinal, a one-sentence lay description
//     (toolCopy) and a usage METER — sixteen segments, public repositories in
//     ember then private in amber, sized against the busiest tool on the
//     plate — with the count beside it in the digit grammar;
//   · one reading key for the meters at the foot.
// Nothing here is a button and nothing discloses a repository list: the
// per-repository breakdown lives on /about, once, and the plate's CTA below
// points at the repositories themselves. The tiles are therefore plain list
// items; the old roving-focus / spotlight / pinned-chip model is gone with
// the chip it served.
//
// The tally (owner correction 2026-09-06): its two figures wear the page
// title's ember, the "of" the line's grey — the page's digit grammar — and
// they COUNT UP from zero every time the category head scrolls into view,
// on the About page's shared `useViewportCountUp` (a live observer, not the
// once-only reveal gate: a sustained exit resets and re-arms, a flicker does
// not). The cards' repo figures count the same way, each on its own figure
// line (ToolTile). The head itself reveals on its own gate: the label
// rises through its line mask, the rule draws out to the right, the tally
// fades in as it starts counting, the strapline rises after.
//
// A tile whose icon fails to load drops out (onHidden), as before, so a
// dead icon URL never leaves an empty card.

const HEAD_STEP_S = 0.07;

// A category's heading and strapline in the reader's language. The Uses
// catalogue mirrors CATEGORY_COPY under toolCopy.categories (pinned equal by
// tests/unit/usesI18n.test.js); a category the catalogue lacks falls back to
// the dictionary, and one the dictionary lacks to its own key, as before.
export function categoryCopy(t, category) {
  const base = `toolCopy.categories.${category}`;
  const own = CATEGORY_COPY[category];
  if (!own && !t.has(`${base}.label`)) return { label: category, lay: '' };
  return {
    label: t.has(`${base}.label`) ? t(`${base}.label`) : own.label,
    lay: t.has(`${base}.lay`) ? t(`${base}.lay`) : (own?.lay ?? ''),
  };
}

function CategoryHead({
  headingId,
  label,
  lay,
  count,
  total,
  index,
  revealed,
  reduceMotion,
  revealedAtRef,
}) {
  const t = useTranslations('Uses');
  const { num, countFormat } = useUsesFormat();
  const { ref, on, delay } = useStagedReveal({
    revealed,
    reduceMotion,
    revealedAtRef,
    index,
    step: HEAD_STEP_S,
    base: 0.1,
  });
  const at = (offset, duration) => staged(reduceMotion, delay, offset, duration);

  // The count-up's own observer — live, so the figures replay on every
  // re-entry (owner ask), gated on the once-reveal so nothing counts behind
  // the loader.
  const tallyRef = useRef(null);
  const tallyInView = useInView(tallyRef, { amount: 'some', margin: '0px 0px -8% 0px' });
  const counting = on && tallyInView;
  const countRef = useRef(null);
  const totalRef = useRef(null);
  useViewportCountUp(countRef, {
    to: count,
    inView: counting,
    prefersReducedMotion: reduceMotion,
    format: countFormat,
  });
  useViewportCountUp(totalRef, {
    to: total,
    inView: counting,
    prefersReducedMotion: reduceMotion,
    format: countFormat,
  });

  return (
    <div ref={ref}>
      <div className="uses-stack__head flex items-baseline">
        <h3 id={headingId} className="uses-stack__cat uses-mask m-0 font-mono uppercase">
          <m.span
            className="uses-anim uses-mask__in"
            initial={reduceMotion ? false : { y: '140%' }}
            animate={{ y: on ? '0%' : '140%' }}
            transition={at(0, 0.55)}
          >
            {label}
          </m.span>
        </h3>
        <m.span
          aria-hidden="true"
          className="uses-anim uses-stack__rule"
          initial={reduceMotion ? false : { scaleX: 0 }}
          animate={{ scaleX: on ? 1 : 0 }}
          transition={at(0.1, 0.7)}
        />
        {/* The digits are aria-hidden while they climb; the section's
            aria-labelled list below carries the count. */}
        <m.p
          ref={tallyRef}
          className="uses-anim uses-stack__tally m-0 font-mono uppercase tabular-nums"
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: on ? 1 : 0 }}
          transition={at(0.2, 0.4)}
        >
          {/* One message, "<count></count> of <total></total>", so the
              connective and its word order are the translator's (issue #82);
              the two figures are the count-up's own nodes, filled in place. */}
          {t.rich('stack.tally', {
            count: () => (
              <span key="count" ref={countRef} className="uses-stack__figure">
                {num(reduceMotion ? count : 0)}
              </span>
            ),
            total: () => (
              <span key="total" ref={totalRef} className="uses-stack__figure">
                {num(reduceMotion ? total : 0)}
              </span>
            ),
          })}
        </m.p>
      </div>
      {lay ? (
        <m.p
          className="uses-anim uses-stack__lay m-0"
          {...riseProps(on, reduceMotion, at(0.16, 0.5), 6)}
        >
          {lay}
        </m.p>
      ) : null}
    </div>
  );
}

function ReadingKey({ counted, revealed, reduceMotion, revealedAtRef }) {
  const t = useTranslations('Uses');
  const { ref, on, delay } = useStagedReveal({ revealed, reduceMotion, revealedAtRef });
  return (
    <m.p
      ref={ref}
      className="uses-anim uses-stack__key m-0 font-mono uppercase text-foreground/60"
      style={{ marginTop: fluid(1.2) }}
      {...riseProps(on, reduceMotion, staged(reduceMotion, delay, 0, 0.5), 6)}
    >
      {counted ? (
        <>
          <span aria-hidden="true" className="uses-stack__swatch is-public" />
          {t('stack.keyPublic')}
          {' · '}
          <span aria-hidden="true" className="uses-stack__swatch is-private" />
          {t('stack.keyPrivate')}
          {' · '}
          {t('stack.keyRelative')}
        </>
      ) : (
        t('stack.keyPending')
      )}
    </m.p>
  );
}

export default function ToolGrid({ groups, revealed, reduceMotion, revealedAtRef }) {
  const t = useTranslations('Uses');
  const { num, ord } = useUsesFormat();
  const [hidden, setHidden] = useState(() => new Set());

  const visible = groups
    .map((g) => ({
      category: g.category,
      items: rankByUsage(g.items.filter((it) => !hidden.has(it.slug))),
    }))
    .filter((g) => g.items.length > 0);
  const total = visible.reduce((n, g) => n + g.items.length, 0);
  const max = maxUsage(visible);
  const counted = max > 0;

  // One running index across heads and cards: it only orders the same-beat
  // cascade (what is on screen when the plate reveals), so a head always
  // leads its own cards.
  let running = 0;

  return (
    <div className="uses-stack" data-counted={counted ? 'true' : 'false'}>
      {visible.map((g, gi) => {
        const copy = categoryCopy(t, g.category);
        const headingId = `uses-stack-${g.category}`;
        const headIndex = running;
        running += 1;
        return (
          <section
            key={g.category}
            data-category={g.category}
            aria-labelledby={headingId}
            style={{ marginTop: gi > 0 ? fluid(1.5) : 0 }}
          >
            <CategoryHead
              headingId={headingId}
              label={copy.label}
              lay={copy.lay}
              count={g.items.length}
              total={total}
              index={headIndex}
              revealed={revealed}
              reduceMotion={reduceMotion}
              revealedAtRef={revealedAtRef}
            />

            <ul
              className="uses-stack__grid m-0 grid list-none p-0"
              style={{ gap: fluid(0.6), marginTop: fluid(0.8) }}
              aria-label={t('stack.listLabel', {
                label: copy.label,
                count: num(g.items.length),
              })}
            >
              {g.items.map((item, i) => {
                const index = running;
                running += 1;
                return (
                  <ToolTile
                    key={item.slug}
                    item={item}
                    category={g.category}
                    rank={ord(i + 1)}
                    index={index}
                    max={max}
                    counted={counted}
                    revealed={revealed}
                    reduceMotion={reduceMotion}
                    revealedAtRef={revealedAtRef}
                    onHidden={() =>
                      setHidden((prev) => {
                        const next = new Set(prev);
                        next.add(item.slug);
                        return next;
                      })
                    }
                  />
                );
              })}
            </ul>
          </section>
        );
      })}

      {/* The reading key — what the meters mean. Bars are RELATIVE: the
          busiest tool fills its meter and every other is drawn against it. */}
      <ReadingKey
        counted={counted}
        revealed={revealed}
        reduceMotion={reduceMotion}
        revealedAtRef={revealedAtRef}
      />
    </div>
  );
}
