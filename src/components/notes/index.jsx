'use client';

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from '@/i18n/navigation';
import { motion, useInView } from 'framer-motion';
import { useLocale, useTranslations } from 'next-intl';

import { useLoaderRevealed } from '@/hooks/useLoaderRevealed';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { wordFill } from '@/lib/fireRamp';
import { fluid, fluidText } from '@/lib/fluidScale';
import { DEFAULT_LOCALE } from '@/i18n/locales';
import { intlTag } from '@/i18n/format';

// The /notes index body — the standfirst and the record list (issue #32, W8).
//
// ── Why this is a client component when /cv's equivalent is not ─────────────
// The sibling route added in the same issue does its scroll choreography in
// pure CSS (`animation-timeline: view()`, see the /cv block in globals.css)
// precisely so that route can keep shipping ZERO JavaScript. That trade does
// not transfer here, for two reasons:
//
//   1. THERE IS NOTHING TO SCROLL TO. `docs/` holds one document today, so the
//      standfirst AND the whole list sit above the fold. A view() timeline is
//      driven by an element's passage across the viewport — an element already
//      fully in view at scroll 0 is past its range before the reader arrives,
//      so every reveal would render finished. A scroll-driven reveal on this
//      page is a reveal nobody ever sees.
//   2. THE INTRO LOADER WOULD EAT IT ANYWAY. LoaderWrapper covers the page for
//      ~3.3s from the first paint, so a time-based CSS entrance would play and
//      finish behind the overlay — the exact failure `useLoaderRevealed()`
//      exists to fix, and a media query cannot read that signal.
//
// So the entrance is gated on the loader lifting and plays as the reader first
// sees the page. Each record ALSO owns a `useInView` gate, so the day `docs/`
// holds six documents and the list runs past the fold, the ones below it still
// animate when they arrive rather than having finished unwatched — the
// per-element discipline @/components/uses/useStagedReveal documents at length.
// That hook is deliberately re-implemented here rather than imported: it pulls
// its ease from Plate.jsx, and importing it would drag that entire component
// into this route's bundle for the sake of four numbers.
//
// ── Colour ──────────────────────────────────────────────────────────────────
// The standfirst wears the Architect-of-Enchantment paragraph's ink: the shared
// gold→ember ramp (@/lib/fireRamp), sampled PER WORD so the copy darkens in
// reading order, with the halo — and only the halo — on the parent. That split
// is load-bearing rather than stylistic: once copy is split into child spans, a
// `background-clip:text` fill on the parent does not inherit, and worse, inside
// a GPU-promoted layer it rasterises once and paints the words regardless of
// their per-word opacity (the About tilt-card bug). A drop-shadow is a filter,
// which composites over the faded words correctly. The record titles, summaries
// and readouts take their own tier of the same palette — see `.note-record__*`
// in globals.css, where the three voices and their contrast ratios are set out.

// The site's shared reveal ease (PLATE_EASE in @/components/uses/Plate) — a
// soft over-damped landing. Duplicated rather than imported; see above.
const EASE = [0.22, 0.61, 0.36, 1];

// Per-word stagger for the standfirst. ~37 words × 0.03 ≈ a 1.1s left→right
// wave: unmistakably a wave, but confident rather than draggy.
const WORD_STAGGER = 0.03;

// Gap between consecutive records arriving on the SAME beat, so a list deals
// out one at a time instead of landing as a slab.
const RECORD_STAGGER = 0.14;

// A record counts as arriving "with" the loader reveal if its gate opens within
// this window of it — the useStagedReveal threshold, and for its reason: an
// element the reader scrolled to should play immediately, not sit out a stagger
// delay it has no visible siblings to be staggered against.
const SAME_BEAT_MS = 200;

// The standfirst is the catalogue's (Notes.index.intro, issue #82) — it is
// page chrome describing the documents, so it translates even though the
// documents themselves stay English.

/**
 * The standfirst's words, each with the separator that follows it. English
 * splits on spaces exactly as it always has. Other languages go through
 * `Intl.Segmenter`: Chinese and Japanese put no spaces between words, and a
 * whole paragraph as ONE inline-block "word" would never wrap.
 */
function splitWords(text, locale) {
  if (locale === DEFAULT_LOCALE || typeof Intl.Segmenter !== 'function') {
    const words = text.split(' ');
    return words.map((w, i) => ({ w, gap: i < words.length - 1 ? ' ' : '' }));
  }
  const out = [];
  for (const { segment } of new Intl.Segmenter(intlTag(locale), { granularity: 'word' }).segment(text)) {
    if (/^\s+$/u.test(segment)) {
      if (out.length) out[out.length - 1].gap = ' ';
    } else if (out.length && !out[out.length - 1].gap && /^\p{P}+$/u.test(segment)) {
      // Punctuation rides on the word before it, as it does in the English split.
      out[out.length - 1].w += segment;
    } else {
      out.push({ w: segment, gap: '' });
    }
  }
  return out;
}

// Body-copy sizing, shared by the standfirst and the record summaries so the
// two read as the same prose. 1rem at scale 1 with a 0.8125rem legibility
// floor; the line-height floor holds the same 1.6 ratio as the font floor so
// the rhythm never drifts as either binds.
const PROSE = {
  fontSize: fluidText(1, 0.8125),
  lineHeight: 'max(1.3rem, calc(1.6rem * var(--fluid-scale, 1)))',
};

/**
 * The standfirst: each word condenses out of a soft blur while rising and
 * fading, staggered left→right.
 *
 * The de-blur is the gesture that makes it read as copy FORMING rather than
 * copy sliding — the same "materialize from the ether" entrance the contact
 * page opens with, which pairs a spring on the rise (matter settling) with an
 * eased blur and opacity (a focus pull). Reduced motion gets a single still
 * fade: no blur, no rise, no wave.
 */
function Standfirst({ revealed, reduceMotion }) {
  const t = useTranslations('Notes');
  const locale = useLocale();
  const intro = t('index.intro');
  const words = useMemo(() => splitWords(intro, locale), [intro, locale]);

  const container = {
    hidden: {},
    visible: {
      transition: { staggerChildren: reduceMotion ? 0 : WORD_STAGGER },
    },
  };

  const word = reduceMotion
    ? { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { duration: 0.3 } } }
    : {
        hidden: { opacity: 0, y: 14, filter: 'blur(10px)' },
        visible: {
          opacity: 1,
          y: 0,
          filter: 'blur(0px)',
          transition: {
            y: { type: 'spring', stiffness: 120, damping: 20 },
            opacity: { duration: 0.5, ease: 'easeOut' },
            filter: { duration: 0.6, ease: 'easeOut' },
          },
        },
      };

  return (
    <motion.p
      className="note-anim max-w-prose font-light"
      style={{
        ...PROSE,
        // Halo ONLY. The fill is per-word below, for the reason set out in the
        // header: a single clip here would rasterise inside this page's
        // promoted layers and paint every word at full opacity mid-reveal.
        // Values match `.text-fire-amber` in globals.css.
        filter:
          'drop-shadow(0 0 4px rgba(255, 178, 60, 0.55)) drop-shadow(0 0 12px rgba(255, 73, 0, 0.35))',
      }}
      variants={container}
      initial={reduceMotion ? false : 'hidden'}
      animate={revealed ? 'visible' : 'hidden'}
    >
      {words.map(({ w, gap }, i) => (
        <Fragment key={`${i}-${w}`}>
          {/* inline-block so the word can take a transform and a blur; the
              space stays a bare text node OUTSIDE the span so the paragraph
              still wraps naturally. */}
          <motion.span
            className="note-anim-word"
            variants={word}
            style={{ display: 'inline-block', ...wordFill(i, words.length) }}
          >
            {w}
          </motion.span>
          {gap}
        </Fragment>
      ))}
    </motion.p>
  );
}

/**
 * One decision record.
 *
 * The choreography is "the record prints", in the site's own vocabulary:
 *   · the ember NODE ignites at the head of the rail (the /uses marker pop),
 *   · the RAIL draws downward beside the entry (the /cv entry rail, which
 *     draws at reading pace so the line tracks the reader),
 *   · the TITLE wipes in left→right behind a clip-path while its gradient
 *     stays put — so the words read as being set, not as sliding in,
 *   · the SUMMARY rises out of a short blur,
 *   · the READOUT stamps: its tracking settles from wide to tight, the
 *     `.uses-anim-track` label gesture.
 *
 * Only the readout's tracking is a layout property; everything else is opacity,
 * transform and clip-path, so the whole cascade composites.
 */
function Record({ note, index, revealed, reduceMotion, revealedAtRef }) {
  // `tr`, not `t`: this component's `t` is its transition helper below.
  const tr = useTranslations('Notes');
  const ref = useRef(null);
  // `amount: 'some'` with a negative bottom margin rather than a fraction of
  // the element: a record with a long summary can be taller than a phone
  // viewport, and a fraction of it could then never be satisfied — the /uses
  // plates hit exactly that and it is why they are written this way.
  const inView = useInView(ref, {
    once: true,
    amount: 'some',
    margin: '0px 0px -10% 0px',
  });
  const gate = reduceMotion || (revealed && inView);

  // Resolved once, on the tick the gate opens: the cascade offset if this
  // record arrived with the loader reveal, 0 if the reader scrolled to it.
  const [delay, setDelay] = useState(null);
  useEffect(() => {
    if (!gate || delay != null) return;
    if (reduceMotion) {
      setDelay(0);
      return;
    }
    const at = revealedAtRef?.current;
    const sameBeat =
      typeof at === 'number' && performance.now() - at < SAME_BEAT_MS;
    setDelay(sameBeat ? index * RECORD_STAGGER : 0);
  }, [gate, delay, reduceMotion, revealedAtRef, index]);

  // Under reduced motion the record is at rest from the first render; with
  // motion it plays once its delay has resolved (one effect tick later).
  const on = reduceMotion || (gate && delay != null);
  const at = delay ?? 0;
  const t = (offset, duration = 0.5) =>
    reduceMotion ? { duration: 0 } : { duration, ease: EASE, delay: at + offset };

  const rise = (offset, duration = 0.5, distance = 8) => ({
    initial: reduceMotion ? false : { opacity: 0, y: distance },
    animate: on
      ? { opacity: 1, y: 0 }
      : { opacity: 0, y: reduceMotion ? 0 : distance },
    transition: t(offset, duration),
  });

  return (
    <li
      ref={ref}
      className="note-record relative"
      // Inline-start, so the rail's gutter follows the reading direction
      // (issue #82; the rail itself is positioned in globals.css).
      style={{ paddingInlineStart: fluid(1.6) }}
    >
      {/* The rail's static track — the grey hairline the ember draws over, so
          the entry has a left edge from the first paint whatever the motion
          state. Decorative; the link carries the semantics. */}
      <span aria-hidden="true" className="note-record__track" />

      <motion.span
        aria-hidden="true"
        className="note-anim note-record__rail"
        initial={reduceMotion ? false : { scaleY: 0 }}
        animate={{ scaleY: on ? 1 : reduceMotion ? 1 : 0 }}
        transition={t(0.08, 0.7)}
      />

      <motion.span
        aria-hidden="true"
        className="note-anim note-record__node"
        initial={reduceMotion ? false : { opacity: 0, scale: 0 }}
        animate={
          on
            ? { opacity: 1, scale: 1 }
            : { opacity: 0, scale: reduceMotion ? 1 : 0 }
        }
        transition={t(0, 0.45)}
      />

      <h2 style={{ fontSize: fluidText(1.375, 1.0625), lineHeight: 1.25 }}>
        <Link className="note-record__link" href={`/notes/${note.slug}`}>
          {/* The wipe lives on this wrapper, the gradient on the span inside
              it. Keeping them on separate elements is what makes the effect
              read as typesetting: the fill never moves or fades, the mask
              simply opens across it. It is also the safe arrangement — an
              ancestor's clip-path is a paint-time clip, so it applies to the
              promoted layer the clipped-gradient child rasterises into. */}
          <motion.span
            // The title is the document's own, and the documents are English
            // only (issue #82): marked so, which also keeps the left→right
            // typesetting wipe running in the title's own direction.
            lang="en"
            dir="ltr"
            className="note-anim-clip inline-block [will-change:clip-path,transform]"
            initial={
              reduceMotion ? false : { clipPath: 'inset(0 100% 0 0)', y: 6 }
            }
            animate={
              on
                ? { clipPath: 'inset(0 0% 0 0)', y: 0 }
                : {
                    clipPath: reduceMotion ? 'inset(0 0% 0 0)' : 'inset(0 100% 0 0)',
                    y: reduceMotion ? 0 : 6,
                  }
            }
            transition={t(0.2, 0.75)}
          >
            <span className="note-record__title">{note.title}</span>
          </motion.span>
        </Link>
      </h2>

      {note.summary ? (
        <motion.p
          lang="en"
          dir="ltr"
          className="note-anim note-record__summary max-w-prose font-light"
          style={{ ...PROSE, marginTop: fluid(0.5) }}
          {...rise(0.36, 0.55)}
        >
          {note.summary}
        </motion.p>
      ) : null}

      {/* The line count is READ from the file, not estimated. It is the honest
          measure for a technical record and it is checkable — the source path
          beside it says exactly which file to check it against. */}
      <motion.p
        className="note-anim note-anim-track note-record__readout font-mono uppercase"
        style={{
          marginTop: fluid(0.7),
          fontSize: fluidText(0.75, 0.6875),
          letterSpacing: '0.14em',
        }}
        initial={reduceMotion ? false : { opacity: 0, letterSpacing: '0.42em' }}
        animate={
          on
            ? { opacity: 1, letterSpacing: '0.14em' }
            : {
                opacity: 0,
                letterSpacing: reduceMotion ? '0.14em' : '0.42em',
              }
        }
        transition={t(0.46, 0.6)}
      >
        <span className="note-record__figure">{note.linesLabel}</span>{' '}
        <span className="note-record__label">
          {tr('index.lines', { count: note.lines ?? 0 })}
        </span>
        <span className="note-record__sep" aria-hidden="true">
          ·
        </span>
        {/* A file path in the repository: translate="no". */}
        <span className="note-record__source" dir="ltr" translate="no">
          {note.source}
        </span>
      </motion.p>
    </li>
  );
}

export default function NotesIndex({ notes }) {
  const prefersReduced = useReducedMotion();
  const loaderRevealed = useLoaderRevealed();

  // `useReducedMotion` is null on the server, so it is gated behind a mounted
  // flag (the /journey and /uses pattern): SSR and the first client render
  // agree on the hidden pose, and the `.note-anim` CSS guard in globals.css
  // covers the OS case for the paint in between, before React has read the
  // media query.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const reduceMotion = mounted && !!prefersReduced;

  const revealed = reduceMotion || loaderRevealed;

  // When the page revealed, for each record's per-element gate. Stamped in an
  // effect rather than during render: React may abandon a render, and a stamp
  // written there would outlive a reveal that never committed. The children
  // read it one paint later, which is all the same-beat window needs.
  const revealedAtRef = useRef(null);
  useEffect(() => {
    if (revealed && revealedAtRef.current == null) {
      revealedAtRef.current = performance.now();
    }
  }, [revealed]);

  return (
    <div
      className="mx-auto w-full max-w-3xl"
      style={{
        // The standfirst used to butt straight up against the page subtitle —
        // the title block carries only its own 0.25rem subtitle offset, and
        // this column added nothing. A full line of air separates the heading
        // furniture from the prose it introduces.
        marginTop: fluid(3.25),
        paddingBottom: fluid(6),
      }}
    >
      <Standfirst revealed={revealed} reduceMotion={reduceMotion} />

      <ul
        className="flex flex-col"
        style={{ marginTop: fluid(3.5), gap: fluid(3) }}
      >
        {notes.map((note, i) => (
          <Record
            key={note.slug}
            note={note}
            index={i}
            revealed={revealed}
            reduceMotion={reduceMotion}
            revealedAtRef={revealedAtRef}
          />
        ))}
      </ul>
    </div>
  );
}
