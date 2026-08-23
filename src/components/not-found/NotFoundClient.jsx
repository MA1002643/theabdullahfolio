'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Briefcase, GraduationCap, History, Phone, Route, User } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { track } from '@vercel/analytics';

import bg from '../../../public/background/contact-bg.png';
import AuroraDustMount from '@/components/AuroraDustMount';
import { onMediaChange } from '@/lib/mediaQuery';
import DidYouMean from './DidYouMean';
import GlitchText from './GlitchText';
import ReturnPortal from './ReturnPortal';
import { ROUTES } from './routes';
import { suggestRoute } from './suggestRoute';

const ROTATING_MESSAGES = [
  "You've drifted into the void.",
  'This page is in another dimension.',
  "Even my 3D skills couldn't render this page.",
  '404: page not found, vibes still immaculate.',
  "You've reached the edge of the portfolio.",
];

// Suggestion chips, derived from the shared ROUTES registry so they can't drift
// from the typo matcher. Icons are a UI-only concern, mapped here by segment.
const SUGGESTION_ICONS = {
  about: User,
  projects: Briefcase,
  qualifications: GraduationCap,
  contact: Phone,
  journey: Route,
  'my-past': History,
};
const SUGGESTIONS = ROUTES.map(({ segment, href, label }) => ({
  label,
  href,
  Icon: SUGGESTION_ICONS[segment],
}));

const PARALLAX_AMPLITUDE_PX = 10;
const MESSAGE_ROTATION_MS = 5000;

/**
 * Orchestrator for the 404 page. Composes the visual layers
 * (particles → glitch → subtitles → portal → suggestions) and
 * owns the small bits of state that span them: rotating message
 * index, mouse parallax offset, and the keyboard shortcut.
 *
 * Lives in `src/components/not-found/` rather than directly in
 * `not-found.js` so the page file can stay a server component
 * (and export a `metadata` object for the document <title>),
 * while all the interactivity lives behind a 'use client' boundary.
 */
export default function NotFoundClient() {
  const router = useRouter();
  const [messageIndex, setMessageIndex] = useState(0);
  const [parallax, setParallax] = useState({ x: 0, y: 0 });
  const [hasHover, setHasHover] = useState(false);
  // Closest known route to a mistyped path ({href,label}) or null.
  // Resolved once on mount in the analytics effect below (same single
  // read of window.location.pathname), then rendered via <DidYouMean>.
  const [suggestion, setSuggestion] = useState(null);
  // Single source of truth for "skip ongoing motion effects". Used
  // by the rotating subtitle and mouse parallax below; the visual
  // ambient effects (orbs, glitch scramble) honour the same media
  // query via their own components or via CSS in globals.css.
  const prefersReducedMotion = useReducedMotion();

  // Rotating subtitle. AnimatePresence in the JSX swaps the active
  // message with a vertical fade — index increments every 5s.
  //
  // Skipped entirely for reduced-motion users: the interval never
  // starts, the index stays at 0, and AnimatePresence never sees
  // a key change — so they get a single stable line ("You've
  // drifted into the void.") rather than a 5-second crossfade
  // cycle that would conflict with the rest of the page's
  // reduced-motion stack.
  useEffect(() => {
    if (prefersReducedMotion) return undefined;
    const id = setInterval(() => {
      setMessageIndex((i) => (i + 1) % ROTATING_MESSAGES.length);
    }, MESSAGE_ROTATION_MS);
    return () => clearInterval(id);
  }, [prefersReducedMotion]);

  // Detect pointer-fine + hover-capable input so the mouse parallax
  // doesn't run on touch devices (where the only event source would
  // be `mousemove`s synthesised from taps, producing a janky lurch).
  useEffect(() => {
    const mql = window.matchMedia('(hover: hover) and (pointer: fine)');
    const update = () => setHasHover(mql.matches);
    update();
    return onMediaChange(mql, update);
  }, []);

  // Mouse parallax — bound only when the device (a) supports
  // hover/pointer-fine input AND (b) the user hasn't asked for
  // reduced motion. Parallax produces continuous animated content
  // changes in response to input, which is exactly the kind of
  // motion vestibular users want suppressed, so the reduced-motion
  // check matters even on hover-capable hardware.
  useEffect(() => {
    if (!hasHover || prefersReducedMotion) return undefined;
    const handleMouse = (e) => {
      setParallax({
        x: (e.clientX / window.innerWidth - 0.5) * PARALLAX_AMPLITUDE_PX * 2,
        y: (e.clientY / window.innerHeight - 0.5) * PARALLAX_AMPLITUDE_PX * 2,
      });
    };
    window.addEventListener('mousemove', handleMouse);
    return () => window.removeEventListener('mousemove', handleMouse);
  }, [hasHover, prefersReducedMotion]);

  // Keyboard shortcut: H or Escape returns home. Several guards
  // before we actually route:
  //   • Skip while the user is typing in an input/textarea/
  //     contenteditable so typing the letter "h" never yanks them
  //     off the page. None on this page today, but cheap insurance.
  //   • Skip if another handler has already called preventDefault
  //     on this event — respect the existing intent.
  //   • Skip on key repeat so holding H doesn't spam router.push
  //     30+ times/second during the navigation that's already in
  //     flight.
  //   • Skip when Cmd/Ctrl/Alt is held: Cmd+H on macOS hides the
  //     app, Ctrl+H in Chrome/Firefox opens history. Both would
  //     break user expectations if we hijacked them. Shift is
  //     intentionally NOT in the skip list — Shift+H just yields
  //     capital "H" and is still a valid way to type the shortcut.
  useEffect(() => {
    const handleKey = (e) => {
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target?.isContentEditable) {
        return;
      }
      if (e.defaultPrevented || e.repeat || e.metaKey || e.ctrlKey || e.altKey) {
        return;
      }
      if (e.key === 'Escape' || e.key.toLowerCase() === 'h') {
        router.push('/');
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [router]);

  // Operational observability — record the path that triggered
  // this 404, plus the referrer that brought the user here. Lands
  // in the Vercel Analytics custom-events feed so dead links
  // (mistyped URLs, stale bookmarks, broken inbound links) become
  // discoverable in the dashboard rather than silently rotting.
  //
  // Both values are sanitised before sending:
  //   • `path` strips query/hash because query strings can carry
  //     PII (session tokens, emails in unsubscribe links, JWT
  //     reset tokens, etc.).
  //   • `referrer` is parsed and reduced to `origin + pathname` —
  //     same reasoning: the raw value can carry the SAME PII from
  //     whichever page sent the user here. Malformed referrers
  //     fall through to '(invalid)' rather than crashing or
  //     leaking the broken string.
  //
  // The same `path` also drives the "did you mean" recovery: we
  // resolve the closest known route once here (reusing the single
  // pathname read), stash it for <DidYouMean> to render, and record
  // which suggestion — if any — was offered. That turns the event
  // into a fuller picture of each dead end: not just "what broke",
  // but "did we have a confident guess for it" — useful for spotting
  // common typos worth a real redirect vs. genuinely unknown paths.
  useEffect(() => {
    const path = window.location.pathname;
    let referrer = '(direct)';
    if (document.referrer) {
      try {
        const parsed = new URL(document.referrer);
        referrer = `${parsed.origin}${parsed.pathname}`;
      } catch {
        referrer = '(invalid)';
      }
    }
    const match = suggestRoute(path);
    setSuggestion(match);
    track('404_hit', { path, referrer, suggestion: match?.href ?? '(none)' });
  }, []);

  // Console easter egg — devs who inspect the page get a nod and a
  // pointer to the source. Logged once per mount.
  useEffect(() => {
    console.log(
      '%c🚀 Looking for something? Source: github.com/MA1002643/theabdullahfolio',
      'color: #ff6d05; font-size: 14px; font-weight: bold;',
    );
  }, []);

  return (
    <main className="not-found-bg relative isolate flex min-h-screen flex-col items-center justify-center overflow-hidden px-4 py-12 text-center">
      {/* Background mirrors the about / contact pages exactly: the same
          contact-bg.png at half opacity, a black overlay to deepen it, then
          the cursor- + scroll-reactive aurora "dust" composited over the top
          (screen blend) by the shared mount. This replaces the void page's
          former radial gradient + amethyst firefly orbs. The mount self-gates
          on motion preference + loader reveal, so reduced-motion users get the
          static image + overlay alone. `alt=""` marks it decorative. */}
      <Image
        src={bg}
        alt=""
        priority
        sizes="100vw"
        className="-z-50 fixed top-0 left-0 w-full h-full object-cover object-center opacity-50"
      />
      <div className="-z-40 fixed top-0 left-0 w-full h-full bg-black/70" />
      <AuroraDustMount />

      <div className="relative z-10 flex flex-col items-center gap-6">
        <GlitchText
          text="404"
          // Match the same gate as the mouse listener above —
          // passing `{x:0,y:0}` would attach an inline transform
          // to the heading that silently clobbers the pulse-resolve
          // scale animation, so we forward `undefined` whenever
          // parallax isn't actually being driven.
          parallax={hasHover && !prefersReducedMotion ? parallax : undefined}
        />

        <div className="flex min-h-[6rem] flex-col items-center gap-2">
          {/* Top subtitle: rotates every 5s. AnimatePresence handles
              the vertical fade crossfade between messages.
              `min-h` on the parent prevents the layout below from
              shifting when message text length changes. */}
          <div className="flex h-7 items-center">
            <AnimatePresence mode="wait">
              <motion.p
                key={messageIndex}
                // Entrance + exit both use `y` transforms, so both
                // are gated on reduced-motion. The rotation interval
                // is already gated upstream (messageIndex never
                // changes for reduced-motion users), so in practice
                // `exit` never fires either way — but defining it
                // safely keeps the contract clean if a future change
                // re-introduces rotation.
                initial={
                  prefersReducedMotion ? false : { opacity: 0, y: 10 }
                }
                animate={{ opacity: 1, y: 0 }}
                exit={prefersReducedMotion ? undefined : { opacity: 0, y: -10 }}
                transition={
                  prefersReducedMotion ? { duration: 0 } : { duration: 0.4 }
                }
                className="text-base text-fire-amber sm:text-lg"
              >
                {ROTATING_MESSAGES[messageIndex]}
              </motion.p>
            </AnimatePresence>
          </div>

          <motion.p
            initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={
              prefersReducedMotion
                ? { duration: 0 }
                : { delay: 0.8, duration: 0.5 }
            }
            className="text-sm sm:text-base"
            style={{ color: "#ffaa2a", textShadow: "none" }}
          >
            This page doesn&apos;t exist — yet.
          </motion.p>
        </div>

        {/* Contextual recovery — only renders when the mistyped path
            is a confident near-miss of a real route. Sits in the
            stagger between the subtitles and the portal. */}
        <DidYouMean suggestion={suggestion} />

        <ReturnPortal />

        <motion.div
          initial={prefersReducedMotion ? false : { opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={
            prefersReducedMotion
              ? { duration: 0 }
              : { delay: 1.5, duration: 0.5 }
          }
          className="mt-4 flex flex-wrap items-center justify-center gap-3"
        >
          {SUGGESTIONS.map(({ label, href, Icon }) => (
            <Link
              key={href}
              href={href}
              prefetch={false}
              className="group custom-bg inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-xs uppercase tracking-wider transition-all duration-300 hover:border-[#ff6d05]/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff6d05]"
            >
              <Icon className="elite-cta-icon h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
              <span className="elite-cta-text">{label}</span>
            </Link>
          ))}
        </motion.div>
      </div>

      {/* Keyboard hint — gated on `hasHover` (true only when the
          device reports both hover-capable and pointer-fine input,
          via the same matchMedia query that powers the mouse
          parallax above). That hides the hint on every touch-only
          device — phone OR tablet — and shows it the moment a
          device actually has a real pointer (laptop, desktop, or
          a tablet with Magic Keyboard / Surface keyboard attached).
          Strictly more correct than a width breakpoint: an iPad in
          portrait at 1024×768 is still touch-only and shouldn't
          claim an "H" key.

          The keydown listener for H/Escape stays bound on every
          device — the hint is just suppressed where it would
          mislead. Initial render is hasHover=false (SSR-safe), so
          server output never claims an H key; the hint fades in
          after hydration on capable devices. */}
      {hasHover && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 2, duration: 0.6 }}
          className="absolute bottom-6 left-1/2 -translate-x-1/2 text-[10px] uppercase tracking-[0.3em]"
          style={{ color: "rgba(255, 170, 42, 0.55)", textShadow: "none" }}
        >
          Press H to go home
        </motion.p>
      )}
    </main>
  );
}
