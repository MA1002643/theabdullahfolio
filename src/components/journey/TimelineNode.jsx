'use client';

import React, { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { motion, useInView, useScroll, useTransform } from 'framer-motion';
import { ExternalLink } from 'lucide-react';
import MilestoneMarker from './MilestoneMarker';
import FireText from '@/components/shared/FireText';
import { accentFor } from './accents';

// Tenure readout beside the date pill — the duration a recruiter would
// otherwise compute in their head. Months are INCLUSIVE of both endpoints,
// the LinkedIn/CV convention (Unisys MAY 2023 — SEP 2024 must read
// "1 yr 5 mo", the 17 months its own description claims). Closed entries
// compute statically from `start`/`end` (SSR-deterministic); open entries
// need the live clock, so their count renders only after mount — the same
// hydration contract as the atlas's NOW machinery.
const toMonths = (ym) => {
  const [y, m] = ym.split('-').map(Number);
  return y * 12 + (m - 1);
};

const tenureLabel = (months) => {
  const y = Math.floor(months / 12);
  const m = months % 12;
  if (!y) return `${m} mo`;
  const yrs = `${y} yr${y > 1 ? 's' : ''}`;
  return m ? `${yrs} ${m} mo` : yrs;
};

// One milestone: marker on the spine, a connector that draws outward, and the
// card. Alternating left/right from md up; below md the spine is a left rail
// and every card sits to its right. The geometry contract with TimelineSpine:
// the spine axis is left-[1.375rem] (mobile) / left-1/2 (md+), and every
// absolute offset here is derived from that axis.
//
// Entrance is driven by ONE trigger — `show` — shared by marker, connector and
// card, instead of three whileInView observers that could fire on different
// frames. `show` = this node is IN the viewport right now (live, not latched —
// owner direction: the entrance plays EVERY time a card comes on screen, so
// leaving the viewport re-arms it and scrolling back replays the whole
// choreography) AND the intro loader has lifted; an IntersectionObserver
// fires behind the loader's z-9999 cover, so ungated entrances would play to
// nobody (the same trap the sonner mount-toast hit). The exit half of the
// toggle animates off-screen (a card only leaves `inView` once it is mostly
// out), so what the reader ever sees is entrances.
const wrapVariants = (fromX) => ({
  hidden: { opacity: 0, x: fromX },
  visible: {
    opacity: 1,
    x: 0,
    transition: {
      type: 'spring',
      stiffness: 70,
      damping: 18,
      staggerChildren: 0.07,
      delayChildren: 0.18,
    },
  },
});

const childVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring', stiffness: 120, damping: 20 },
  },
};

const TimelineNode = ({
  milestone,
  isLeft,
  isEraStart,
  revealed,
  reduceMotion,
  dimmed,
}) => {
  const { color: accent, Icon } = accentFor(milestone.type);
  const liRef = useRef(null);

  // Live month for open entries' "so far" tenure — null until mount (see the
  // tenure header note).
  const [nowM, setNowM] = useState(null);
  useEffect(() => {
    const now = new Date();
    setNowM(now.getFullYear() * 12 + now.getMonth());
  }, []);
  const endM = milestone.end ? toMonths(milestone.end) : nowM;
  const tenure =
    endM === null ? null : tenureLabel(endM - toMonths(milestone.start) + 1);

  // Live viewport tracking for the entrance; margin pulls the trigger line in
  // so a card is decently on screen before it commits to animating.
  const inView = useInView(liRef, { amount: 0.3, margin: '-40px 0px' });
  const show = reduceMotion || (revealed && inView);

  // Counter-parallax: the card drifts a touch against scroll direction over
  // its own on-screen life, which is what separates the cards from the spine
  // in depth. Scroll-scrubbed (user-driven), but unlike the fill it IS spatial
  // movement, so reduced motion zeroes it.
  const { scrollYProgress: nodeProgress } = useScroll({
    target: liRef,
    offset: ['start end', 'end start'],
  });
  const parallax = useTransform(nodeProgress, [0, 1], [18, -18]);

  return (
    <li
      ref={liRef}
      id={isEraStart ? `era-${milestone.year}` : undefined}
      data-era-year={milestone.year}
      // `dimmed` is the atlas's track filter reaching down: a highlight, not a
      // filter — the card fades but stays in the list, the layout and the
      // spine geometry, so chip-toggling can never re-shuffle marker centres.
      className={clsx(
        'relative transition-opacity duration-500',
        dimmed && 'opacity-20',
      )}
      style={{ '--jn-accent': accent }}
    >
      {/* Year separator — rendered inside the first node of each era (not as
          its own <li>, which would pollute the list semantics with decorative
          items) and doubling as the EraRail's jump anchor via the li id. */}
      {isEraStart && (
        <div aria-hidden className="relative mb-2 h-10">
          {/* Positioning translates live on this PLAIN wrapper (responsive
              classes work here: straddling the rail on mobile, centred on
              the axis from md up), while framer animates only the inner
              element — the scale animation makes framer own that element's
              whole `transform`, and class-based translates on the SAME node
              get overwritten (the pill used to sit half its width off-axis
              because of exactly that).

              0.5rem, not the axis's 1.375rem (owner correction): the
              serpentine sways ±12px around the 22px axis, so a pill whose
              left edge sat ON the axis had the line behind it only when the
              sway went right — 2021/2023 floated beside the line instead.
              Anchoring at 8px (axis − amplitude − 2px) puts the line behind
              EVERY pill whatever the sway, on every width — the same
              on-the-timeline read as md+'s centred straddle. */}
          <div className="absolute left-[0.5rem] top-1/2 -translate-y-1/2 md:left-1/2 md:-translate-x-1/2">
            <motion.span
              // Year in the page-title ember (owner correction — the era
              // labels belong to the same voice as MY JOURNEY itself).
              className="block whitespace-nowrap rounded-full border border-[#ff6d05]/40 bg-black/80 px-4 py-1 font-mono text-sm tracking-[0.2em] text-[#ff6d05] shadow-[0_0_12px_rgba(255,109,5,0.25)]"
              initial={false}
              animate={
                show ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.85 }
              }
              transition={
                reduceMotion
                  ? { duration: 0 }
                  : { duration: 0.4, ease: 'easeOut' }
              }
            >
              {milestone.year}
            </motion.span>
          </div>
        </div>
      )}

      {/* jn-<id> is the atlas's jump target (the era-<year> li id above is the
          clock's) — focused programmatically after the scroll so keyboard
          selection lands where the bar pointed, hence the tabIndex and the
          suppressed ring (focus is handed TO it, never tabbed onto it). */}
      <div
        id={`jn-${milestone.id}`}
        tabIndex={-1}
        className="relative py-5 outline-none md:py-7"
      >
        {/* Marker, centred on the spine axis. data-spine-marker is the
            container's survey hook — the serpentine path is built through
            these measured centres, which is what keeps the curve passing
            exactly through every marker. */}
        <div
          data-spine-marker
          className="absolute left-[1.375rem] top-[2.15rem] z-10 -translate-x-1/2 md:left-1/2"
        >
          <MilestoneMarker
            accent={accent}
            Icon={Icon}
            active={show}
            reduceMotion={reduceMotion}
          />
        </div>

        {/* Connector — draws from the spine toward the card, so its
            transform-origin flips with the side. Widths are the exact gaps:
            spine axis 1.375rem → card at ml-12 (3rem) on mobile; card width
            calc(50% - 4rem) leaves a 4rem gap minus the marker's radius on
            desktop. */}
        <motion.div
          aria-hidden
          className={clsx(
            // journey-connector: the card-hover energise hook in globals.css
            // (brightens via CSS `filter` only — framer owns this element's
            // transform for the scaleX draw, and filter never touches it).
            'journey-connector absolute top-[3.35rem] h-[2px] left-[1.375rem] w-[1.625rem] origin-left',
            isLeft
              ? 'md:left-auto md:right-1/2 md:w-16 md:origin-right'
              : 'md:left-1/2 md:w-16 md:origin-left',
          )}
          style={{
            background: isLeft
              ? `linear-gradient(to left, transparent, ${accent})`
              : `linear-gradient(to right, ${accent}, transparent)`,
          }}
          initial={false}
          animate={{ scaleX: show ? 1 : 0 }}
          transition={
            reduceMotion
              ? { duration: 0 }
              : { duration: 0.35, ease: 'easeOut', delay: 0.15 }
          }
        />

        {/* Card. The motion wrapper owns position + entrance + parallax; the
            hover lift lives on an INNER element (.journey-lift, plain CSS) so
            the CSS transform can never fight framer's x/y writes on this
            wrapper. */}
        <motion.div
          className={clsx(
            'relative ml-12 md:ml-0 md:w-[calc(50%-4rem)]',
            isLeft ? 'md:mr-auto' : 'md:ml-auto',
          )}
          variants={wrapVariants(reduceMotion ? 0 : isLeft ? -56 : 56)}
          initial={false}
          animate={show ? 'visible' : 'hidden'}
          style={reduceMotion ? undefined : { y: parallax }}
        >
          <div className="journey-lift">
            {/* No accent edge strip here (owner correction): the per-type
                colour on the card's left edge made every card's border read
                a different hue — the frame stays custom-bg-abt's uniform
                gold, exactly like the /about cards, and the type system
                speaks through the marker, connector and date pill instead. */}
            <article className="custom-bg-abt relative overflow-hidden rounded-xl px-5 py-4">
              {/* flex-wrap: the tenure span drops to its own line on narrow
                  phones instead of squeezing the pill (Lidl's is the widest
                  pairing). */}
              <motion.div variants={childVariants} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span
                  className="journey-date rounded-full border px-2.5 py-0.5 font-mono"
                  style={{
                    borderColor: `${accent}55`,
                    color: accent,
                    background: `${accent}14`,
                  }}
                >
                  {milestone.dateLabel}
                </span>
                {tenure && (
                  <span
                    className="journey-tag whitespace-nowrap font-mono"
                    style={{ color: accent, opacity: 0.7 }}
                  >
                    {tenure}
                    {milestone.end ? '' : ' so far'}
                  </span>
                )}
                {milestone.link && (
                  <a
                    href={milestone.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Open ${milestone.title} (new tab)`}
                    className="ml-auto inline-flex items-center gap-1 font-mono text-[11px] tracking-widest text-white/50 transition-colors duration-300 hover:text-[color:var(--jn-accent)]"
                  >
                    VIEW
                    <ExternalLink className="h-3.5 w-3.5" strokeWidth={2} />
                  </a>
                )}
              </motion.div>

              {/* Title = the page-title ember, body = the contact intro's
                  per-word gold→ember fire ink (owner corrections, second
                  round — the flat #ffaa2a/#ffbb55 pairing was superseded). */}
              <motion.h3 variants={childVariants} className="journey-title mt-2.5 font-bold text-[#ff6d05]">
                {milestone.title}
              </motion.h3>

              <motion.p variants={childVariants} className="journey-desc mt-1.5 font-light">
                <FireText text={milestone.description} />
              </motion.p>

              {milestone.tags.length > 0 && (
                <motion.ul
                  variants={childVariants}
                  className="mt-3 flex list-none flex-wrap gap-1.5"
                >
                  {milestone.tags.map((tag) => (
                    // Hover recolours text WITH the border (owner correction
                    // — border-only left the label looking half-lit).
                    <li
                      key={tag}
                      className="journey-tag rounded-full border border-white/15 bg-black/40 px-2 py-0.5 font-mono text-white/65 transition-colors duration-300 hover:border-[color:var(--jn-accent)] hover:text-[color:var(--jn-accent)]"
                    >
                      {tag}
                    </li>
                  ))}
                </motion.ul>
              )}
            </article>
          </div>
        </motion.div>
      </div>
    </li>
  );
};

export default TimelineNode;
