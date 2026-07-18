'use client';

// Route-wide footer for the sub-pages (issue #30) — an editorial "colophon".
//
// The ledger is composed as an asymmetric masthead (a 5 / 4 / 3 grid) rather
// than a four-up corporate footer:
//   • IDENTITY — name, role, positioning line, the mandatory project-GitHub CTA,
//     and one live, semantic signal: honest availability + local time
//     (AvailabilityStatus.jsx).
//   • INDEX — a numbered, route-aware table of contents; each row pairs the
//     label (per-glyph .hover-swap roll) with a descriptor and an arrow that
//     slides in on hover, and the current route holds its row open in orange.
//   • ELSEWHERE — professional links + the contact micro-block.
// A meta row carries the guitar sound toggle and the copyright.
//
// Behind/over it: the layered atmospheric plate (cool lift + two drifting brand
// orbs + grain, see .footer-atmosphere) and the giant "plucked-string" wordmark
// (FooterWordmark.jsx).
//
// Everything is composed from the existing neon-orange glass design system —
// .custom-bg, .elite-divider, text-glow-*, .hover-swap, useMagneticPull — so the
// footer reads as part of the same universe as the hero, not bolted on. All
// motion is transform/opacity/colour (no layout, no CLS) and fully honours
// prefers-reduced-motion.
//
// Rendered ONCE in src/app/(sub pages)/layout.js, so it appears on /about,
// /qualifications, /projects and /contact without per-page duplication.

import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Mail } from 'lucide-react';
import { useFooterReveal } from './useFooterReveal';
import { usePointerCapability } from '@/hooks/usePointerCapability';
import { cn } from '@/lib/utils';
import FooterWordmark from './FooterWordmark';
import FooterMetaReveal from './FooterMetaReveal';
import DecipherEmail from './DecipherEmail';
import AvailabilityStatus from './AvailabilityStatus';
import LiveLocation from './LiveLocation';
import ElsewhereTerminal from './ElsewhereTerminal';
import FooterManifest from './FooterManifest';
import FooterIdentity from './FooterIdentity';
import { getPluckSynth } from './pluckSynth';
import { brand, email } from './footer-data';

// Shared focus ring — a full-strength orange indicator against the dark plate,
// with an offset so it reads clearly on tightly-packed link rows.
const FOCUS_RING =
  'rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff6d05] focus-visible:ring-offset-2 focus-visible:ring-offset-night-950';

// Touch-device audio: a self-hosted, royalty-free acoustic-guitar track that
// plays when a visitor who CAN'T hover (phone / keyboard-less tablet) turns the
// sound on — since there is no cursor to pluck the wordmark there. Hover-capable
// devices play the live synth instead (see FooterWordmark). Drop the MP3 at the
// path below; provenance + licence are in public/audio/README.md.
const TRACK_SRC = '/audio/guitar-tabla-fusion.mp3';
const TRACK_VOLUME = 0.5; // gentle, ambient — background, not foreground

// Small uppercase column heading. A functional footer group label (Product /
// Company style), not a decorative section eyebrow.
function ColumnHeading({ children }) {
  return (
    <h2 className="mb-3 text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#fc83ff] [text-shadow:0_0_8px_rgba(255,85,247,0.4)]">
      {children}
    </h2>
  );
}

// Reveal a single footer block as IT scrolls into view — not when the whole
// (viewport-tall) footer's top edge first peeks in. The footer is ~a viewport
// tall (taller still on mobile, where the columns stack), so one shared observer
// would fire the entire reveal on the first-pixel peek and the lower blocks
// (reach strip, meta row) would finish animating hundreds of px below the fold,
// unseen. Each block instead runs its own re-arming, loader-gated observer
// (amount:0.2 → it animates once ~a fifth of it is on screen; see
// useFooterReveal), so on this persistent footer it plays every time the block
// is genuinely scrolled to and is never spent by a page-transition transient.
function FooterReveal({ as = 'div', variants, className, children, ...rest }) {
  const ref = useRef(null);
  const revealed = useFooterReveal(ref, 0.2);
  const MotionTag = motion[as];
  return (
    <MotionTag
      ref={ref}
      variants={variants}
      initial="hidden"
      animate={revealed ? 'show' : 'hidden'}
      className={className}
      {...rest}
    >
      {children}
    </MotionTag>
  );
}

export default function Footer() {
  const rawReduced = useReducedMotion();

  // useReducedMotion resolves synchronously on the client but is null on the
  // server; gate it behind a mounted flag so SSR and the first client render
  // agree (no reduced-motion-only hydration warning), then let it settle.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const reduced = mounted && rawReduced;

  // The copyright year is read from `new Date()` only AFTER mount. Evaluating it
  // during the server render (and the first client render) risks a hydration
  // mismatch if the page is served across a year boundary — server on Dec 31,
  // client hydrating Jan 1 — since the two renders would emit different year
  // strings. Pre-mount SSR + first client render omit the year so they agree; it
  // fills in a frame later, well before the footer scrolls into view and the
  // split-flap copyright cascade plays.
  const copyright = mounted
    ? `© ${new Date().getFullYear()} ${brand.name}`
    : `© ${brand.name}`;

  // The reach strip reveals its three items in sequence (availability → email
  // decode → live-location) rather than as one block fade. `reachRevealed` is the
  // single source of truth for that timeline: it drives the CSS stagger
  // (data-revealed) AND starts the email decode (DecipherEmail's `active`), so
  // they stay in lockstep. It fires when 0.6 of the strip is on screen and re-arms
  // when the strip is fully out of view (see useFooterReveal) — never spent by a
  // page-transition transient on this persistent footer.
  const reachRef = useRef(null);
  const reachRevealed = useFooterReveal(reachRef, 0.6);

  // Footer guitar audio is opt-in (no surprise sound): OFF by default, toggled
  // by the SoundControl below. Enabling it also unlocks the shared AudioContext
  // from this click gesture (browser autoplay policy). soundOn is passed to
  // FooterWordmark, which mutes/unmutes the same shared synth.
  const [soundOn, setSoundOn] = useState(false);

  // Can the visitor actually PLUCK the wordmark? True for a mouse or an iPad/
  // tablet with a trackpad (a fine, hover-capable pointer); false for a phone or
  // a keyboard-less iPad (coarse, touch-only). This is a live matchMedia signal,
  // not UA sniffing — attaching a Magic Keyboard flips it with no reload. It
  // decides the SOUND SOURCE: a hover-capable device plays the live synth (the
  // visitor plucks the strings by hand), while a touch surface — with no cursor
  // to perform the strings — plays the recorded acoustic-guitar track instead.
  const canHover = usePointerCapability();

  // `autoPlay` = "touch surface with the sound on" → play the recorded track (and
  // run the wordmark's ambient visual strum). The synth is muted here so the two
  // never sound at once (see FooterWordmark).
  const autoPlay = soundOn && !canHover;

  // The recorded track element (touch only). Royalty-free & self-hosted; see
  // public/audio/README.md for the source + licence.
  const trackRef = useRef(null);

  const toggleSound = () => {
    const willOn = !soundOn;
    if (willOn) {
      getPluckSynth().unlock();
      // Start the track from THIS user gesture (autoplay policy) when the visitor
      // can't hover; hover-capable devices leave it paused and use the synth.
      if (!canHover && trackRef.current) {
        trackRef.current.volume = TRACK_VOLUME;
        trackRef.current.play().catch(() => {});
      }
    } else {
      trackRef.current?.pause();
    }
    setSoundOn(willOn);
  };

  // Keep the track in lockstep with autoPlay — covers a keyboard/trackpad being
  // attached or removed mid-play (canHover flips live) and pausing on sound-off.
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    if (autoPlay) {
      el.volume = TRACK_VOLUME;
      el.play().catch(() => {});
    } else {
      el.pause();
    }
  }, [autoPlay]);

  // The giant footer wordmark — now a per-letter "plucked string" interaction
  // (visual pluck + a synthesised guitar note on hover) — lives in its own
  // client component; see FooterWordmark.jsx / pluckSynth.js.

  // Entrance choreography for a single block. Reduced motion collapses to a
  // plain opacity fade — no transform; otherwise the block rises 14px as it
  // scrolls into view. Each block reveals on its own observer (see
  // FooterReveal), so there is no cross-block stagger to orchestrate here.
  const block = reduced
    ? { hidden: { opacity: 0 }, show: { opacity: 1, transition: { duration: 0.3 } } }
    : {
        hidden: { opacity: 0, y: 14 },
        show: {
          opacity: 1,
          y: 0,
          transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] },
        },
      };

  // The Index block reveals as a plain fade (no y-rise): its board runs the
  // Split-Flap Cascade, where each row owns its own staggered rise. Letting the
  // block also translate would double-move those rows, so this block drops the
  // 14px lift the other columns use and fades in place.
  const blockFade = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { duration: reduced ? 0.3 : 0.5, ease: [0.22, 1, 0.36, 1] },
    },
  };

  return (
    <footer
      role="contentinfo"
      className="relative isolate mt-auto w-full overflow-hidden bg-night-950 text-[#a3a3a3]"
    >
      {/* ── Elite atmospheric background (issue #30) ── Replaces the flat black
          plate (and the old warm ground glow that used to pool under the
          wordmark). Layered depth: a cool central lift plus two large, softly-
          blurred brand orbs (ember + amethyst) that drift on a slow GPU
          transform loop, finished with a fine grain overlay. The very top edge
          (seamless with the page) and the bottom-centre (under the wordmark) are
          kept dark — colour lives in the mid-field + sides — so nothing competes
          with the ledger, portrait or cards. Sits at -z-30, behind the portrait
          (-z-20) and the wordmark/content; the drifting orbs still under
          prefers-reduced-motion. */}
      <div
        className="footer-atmosphere pointer-events-none absolute inset-0 -z-30"
        aria-hidden="true"
      />
      <div
        className="footer-grain pointer-events-none absolute inset-0 -z-30"
        aria-hidden="true"
      />

      {/* Giant submerged wordmark — half-sunk below the footer edge and faded
          out toward the bottom (that fade is unchanged). Each letter is now an
          independent "guitar string": on hover it plucks (a damped spring),
          flashes bright along its outline, and rings a soft note from
          an unfolding qawwali-style melody (Web Audio, synthesised — see FooterWordmark.jsx /
          pluckSynth.js). Sweeping the cursor across the name strums it. Purely
          decorative + aria-hidden; the vertical pluck is suppressed under
          reduced motion. */}
      <FooterWordmark
        name={brand.name}
        reduced={reduced}
        soundOn={soundOn}
        autoPlay={autoPlay}
        canHover={canHover}
      />

      {/* Recorded acoustic-guitar track for touch surfaces (no cursor to pluck
          the strings). Hidden + decorative; loads only when first played. */}
      <audio ref={trackRef} src={TRACK_SRC} loop preload="none" aria-hidden="true" />

      <div className="mx-auto w-full max-w-6xl px-4 pb-32 pt-12 sm:px-6 md:px-10 md:pb-44 md:pt-16">
        {/* Editorial masthead. An asymmetric 5 / 4 / 3 ledger — a dominant
            identity block, a numbered index of the site, then a compact "reach"
            column — set over the submerged wordmark. It reads like a magazine
            colophon rather than a four-up corporate footer. Collapses to a
            single column below lg; identity spans the full width at md. */}
        <div className="grid grid-cols-1 gap-x-6 gap-y-12 md:grid-cols-2 lg:grid-cols-[5fr_4fr_3fr]">
          {/* (1) IDENTITY + MANDATORY PROJECT GITHUB CTA — its own component, with
              the "Wet Ink" signature entrance (per-element CSS choreography keyed
              off data-revealed; see FooterIdentity.jsx + .footer-identity[data-
              revealed] in globals.css). */}
          <FooterIdentity />

          {/* (2) INDEX — the site's four routes, staged as a split-flap
              DEPARTURES board (FooterManifest.jsx). On reveal each row's ordinal
              flaps in and settles; the current route reads NOW BOARDING with a
              live pulse. Route-aware, keyboard-focusable, and it keeps the
              per-glyph hover roll on each destination. */}
          <FooterReveal
            as="nav"
            variants={blockFade}
            aria-label="Site"
            className="lg:footer-col-rule"
          >
            <ColumnHeading>Index</ColumnHeading>
            <FooterManifest />
          </FooterReveal>

          {/* (3) ELSEWHERE — the three professional destinations, staged as a
              live terminal (ElsewhereTerminal.jsx): each command types itself
              out on reveal, prints its resolved destination, and a blinking
              ember caret waits at the prompt — extending the git-graph CTA's
              own "❯" terminal vocabulary. The availability flag, contact email
              and live-location plate now live in the full-width reach strip
              below the grid (Baseline Strip layout), not in this column. */}
          <FooterReveal variants={block} className="lg:footer-col-rule">
            <ColumnHeading>Elsewhere</ColumnHeading>
            <ElsewhereTerminal />
          </FooterReveal>
        </div>

        {/* ── Reach strip (Baseline Strip layout, issue #30 follow-up) ── A
            full-width band that closes the masthead: the availability flag, the
            contact email, and the live-location plate — lifted out of the
            identity + elsewhere columns so the three columns stay tight and the
            lower edge reads as one balanced rule instead of a ragged bottom.
            Hairline separators grow to space the three items across the width
            (they drop out and the strip stacks below `sm`). Sits above the
            unchanged meta row + wordmark. */}
        {/* Staged reveal (issue #30 follow-up): instead of the shared block fade
            revealing the strip all at once, the three items lead in one after
            another the moment the strip scrolls into view — the availability
            flag, then the email (which deciphers in step with its own fade), then
            the live-location plate, with the hairline separators drawing between.
            `data-revealed` drives the CSS stagger (globals.css) and `active`
            starts the decode from the same gate, so they stay in lockstep. */}
        <address
          ref={reachRef}
          // Omit the attribute until mounted so the server / JS-off / failed-
          // hydration render leaves the items at their visible base opacity
          // (the CSS only hides on an explicit data-revealed="false"). After
          // mount it stages "false" → "true" to drive the reveal.
          data-revealed={mounted ? (reachRevealed ? 'true' : 'false') : undefined}
          className="footer-reach-strip not-italic"
        >
          <AvailabilityStatus className="footer-reach-strip__reveal" />
          <span className="footer-reach-strip__sep" aria-hidden="true" />
          <a
            href={`mailto:${email}`}
            className={cn(
              'footer-reach-strip__mail footer-link-underline hover-swap group inline-flex items-center gap-2.5 break-all text-[0.95rem] text-[#a3a3a3]',
              FOCUS_RING,
            )}
          >
            <Mail
              className="h-[1.05rem] w-[1.05rem] shrink-0 text-[#ff6d05]"
              strokeWidth={1.75}
              aria-hidden="true"
            />
            <DecipherEmail text={email} active={reachRevealed} />
          </a>
          <span className="footer-reach-strip__sep" aria-hidden="true" />
          <LiveLocation />
        </address>

        {/* ── Meta row: guitar sound toggle + "SOUND {ON/OFF} · HOVER THE LINES"
            instruction (bound to the same state) and the copyright line. Sits
            just above the giant plucked-string wordmark, so "hover the lines"
            points straight at it. Reveals with the "Split-Flap Cascade" — the
            whole row ripples in glyph-by-glyph, left to right (FooterMetaReveal
            / metaRevealMotion.jsx), the same split-flap language as the Manifest
            departures board. Collapses to a plain fade under reduced motion. */}
        <FooterMetaReveal
          reduced={reduced}
          soundOn={soundOn}
          onToggle={toggleSound}
          canHover={canHover}
          copyright={copyright}
          className="mt-14 flex flex-col items-center gap-4 pt-6 sm:flex-row sm:items-center sm:justify-between"
        />
      </div>
    </footer>
  );
}
