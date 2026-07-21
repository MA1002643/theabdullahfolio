'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Music } from 'lucide-react';
import { SiSpotify } from 'react-icons/si';
import { useNowPlaying } from './useNowPlaying';
import SpotifyBars from './SpotifyBars';
import ProgressRing from './ProgressRing';
import Spectrum from './Spectrum';
import Marquee from './Marquee';
import { formatTime, formatPlayedAgo } from './format';

// ── Now Playing widget (issue #42) ──────────────────────────────────────────
// A floating, living record of what the owner is listening to.
//
// THEME: identical to the about page's "Career snapshot" card. The surface is
// the shared `.custom-bg-abt` chrome (warm-gold #ffcd5bcc border, slate-and-gold
// gradient interior, backdrop blur, orange neon glow) — reused as a CLASS rather
// than copied as hex values, so this widget stays in lockstep if that card is
// ever retuned. Because the widget expands on hover, `.custom-bg-abt:hover`
// brightens the glow exactly when the console opens — the emphasis comes free
// from the existing design system.
//
// Type ladder matches the card too: the #ffaa2a eyebrow microlabel, `.text-gold`
// (#f4e3b8) for the live title, #d4af7a / #b8946a for supporting copy, and
// #ff6d05 for every active accent (progress arc, bars, spectrum, bar fill).
//
// NOTE: the per-album adaptive tint was deliberately removed — a fixed card
// theme and a colour that changes per album are mutually exclusive. The server
// still runs the sharp pass, because the same pass produces `blurDataURL`.
//
// Signature behaviour (unchanged): the album art is a small "record" wrapped in
// a progress arc that advances in real time, re-anchored to Spotify's reported
// position each poll; on hover/focus it expands into a console with full
// progress + times, an ambient spectrum ribbon and a Spotify cue; track changes
// crossfade; long titles marquee; and it yields (fades out) while the page
// footer is in view so it never covers the footer's own controls.
// Motion is transform / opacity / clip plus a small width+radius+height morph
// for the expand — and EVERY animation, the morph included, is gated on
// prefers-reduced-motion (snaps instead of tweening).

// ── Career-snapshot palette ─────────────────────────────────────────────────
const EMBER = '#ff6d05'; // primary accent — arc, bars, spectrum, bar fill
const AMBER = '#ffaa2a'; // eyebrow microlabel
const GOLD_MUTED = '#d4af7a'; // artist / album / timecode
const GOLD_SOFT = '#b8946a'; // least-emphasis copy
const WARM_TRACK = 'rgb(255 205 91 / 0.18)'; // unfilled arc + progress groove

const RING = 46; // collapsed album-art ring diameter (px)
const COLLAPSED_W = 246;
const EXPANDED_W = 306;
const EASE = [0.22, 1, 0.36, 1];

export default function NowPlaying() {
  const { data, loading } = useNowPlaying(30000);
  const [expanded, setExpanded] = useState(false);
  const [footerHidden, setFooterHidden] = useState(false);
  const reduceMotion = useReducedMotion();
  const pathname = usePathname();

  const isPlaying = Boolean(data?.isPlaying);
  const durationMs = data?.durationMs ?? null;
  const serverProgress = data?.progressMs ?? null;
  const trackId = data?.track?.id;

  // ── Footer awareness ──────────────────────────────────────────────────────
  // The widget is fixed bottom-left on every page; the sub-pages' footer places
  // its own interactive controls (sound toggle, wordmark) in that same corner.
  // Observe the footer and fade the widget out while it's on screen, restoring
  // it on scroll-up. Re-runs per route (SPA nav swaps the footer element).
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return undefined;
    const footer = document.querySelector('footer');
    if (!footer) {
      setFooterHidden(false);
      return undefined;
    }
    const io = new IntersectionObserver(
      ([entry]) => setFooterHidden(entry.isIntersecting),
      { rootMargin: '0px 0px -8% 0px' },
    );
    io.observe(footer);
    return () => io.disconnect();
  }, [pathname]);

  // ── Live progress clock ───────────────────────────────────────────────────
  // Re-anchor on every new server position; tick forward locally once a second
  // so the arc + timecode advance smoothly between the 30s polls.
  const anchorRef = useRef({ base: 0, at: 0 });
  const [displayMs, setDisplayMs] = useState(0);

  useEffect(() => {
    if (isPlaying && serverProgress != null) {
      anchorRef.current = {
        base: serverProgress,
        at: typeof performance !== 'undefined' ? performance.now() : 0,
      };
      setDisplayMs(serverProgress);
    } else {
      setDisplayMs(0);
    }
  }, [isPlaying, serverProgress, trackId, durationMs]);

  useEffect(() => {
    if (!isPlaying || serverProgress == null) return undefined;

    const tick = () => {
      const { base, at } = anchorRef.current;
      const now = typeof performance !== 'undefined' ? performance.now() : at;
      const next = base + (now - at);
      setDisplayMs(durationMs ? Math.min(durationMs, next) : next);
    };

    // Only run the per-second clock while the tab is actually visible. A hidden
    // tab has nothing to paint, and on mobile a wakeup every second drains
    // battery for no benefit. Tear the interval down on `hidden` and rebuild it
    // on `visible`; because performance.now() keeps advancing while hidden, the
    // immediate tick on resume jumps straight to the correct position (no lag).
    let id = null;
    const start = () => {
      if (id != null) return;
      tick();
      id = setInterval(tick, 1000);
    };
    const stop = () => {
      if (id == null) return;
      clearInterval(id);
      id = null;
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') stop();
      else start();
    };

    if (document.visibilityState !== 'hidden') start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [isPlaying, serverProgress, durationMs, trackId]);

  // Render nothing during SSR / initial load / when there's genuinely no track —
  // no hydration mismatch (server renders null too) and no empty shell flash.
  if (loading || !data?.track?.title) return null;

  const { track, blurDataURL, playedAt } = data;
  const progress = isPlaying && durationMs ? Math.min(1, displayMs / durationMs) : 0;
  const label = isPlaying ? 'NOW PLAYING' : 'LAST PLAYED';
  const playedAgo = !isPlaying ? formatPlayedAgo(playedAt) : null;

  // Fold footer-hide into the expanded flag so the card also visually collapses
  // as it fades out behind the footer.
  const showExpanded = expanded && !footerHidden;
  const expandDur = reduceMotion ? 0 : 0.34;

  const open = () => setExpanded(true);
  const close = () => setExpanded(false);
  // The non-link card is a disclosure BUTTON (role="button" below), so it needs
  // real keyboard activation, not just focus-to-reveal. Enter/Space toggles the
  // console (preventDefault stops Space from scrolling the page); Escape
  // collapses it without moving focus. Mouse hover + focus still preview it via
  // the handlers on <Card>.
  const toggle = () => setExpanded((v) => !v);
  const onCardKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggle();
    } else if (e.key === 'Escape') {
      setExpanded(false);
    }
  };

  // Spotify only supplies an external URL for real catalogue tracks; local
  // files and other non-linkable items arrive with trackUrl: null (see
  // buildTrackPayload). With no destination, render the card as a plain
  // container instead of an <a> — an "#" href would open a dead tab to this
  // very page and contradict the "Open on Spotify" cue. The card still shows
  // the track and expands on hover; it just isn't a link.
  const trackUrl = track.trackUrl || null;
  const hasLink = Boolean(trackUrl);
  const Card = hasLink ? motion.a : motion.div;
  // The <a href> is a link: focusable for free, and role=link exposes its
  // aria-label + aria-expanded natively. The non-link branch is instead a
  // disclosure BUTTON: role="button" + tabIndex={0} + onClick/onKeyDown make it
  // an honest, keyboard-operable control. A bare/generic <div> here would be a
  // focusable NON-interactive element — a11y-inaccurate and a lint smell — while
  // role="group" (also non-interactive) has the same problem; button is the role
  // that actually matches "focus/click to toggle a region", and mirrors the
  // About page's experience-trigger card (index.jsx). No aria-haspopup: the
  // console is INLINE content, not a popup/dialog, so aria-expanded stands alone.
  const linkProps = hasLink
    ? { href: trackUrl, target: '_blank', rel: 'noopener noreferrer' }
    : { tabIndex: 0, role: 'button', onClick: toggle, onKeyDown: onCardKeyDown };
  const baseAria = `${label.toLowerCase()}: ${track.title} by ${track.artist}.`;
  const ariaLabel = hasLink ? `${baseAria} Open on Spotify.` : baseAria;

  return (
    <motion.div
      className="fixed bottom-6 left-6 z-50"
      style={{
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 1.25rem)',
        left: 'calc(env(safe-area-inset-left, 0px) + 1.25rem)',
      }}
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 2, duration: 0.6, ease: EASE }}
    >
      {/* `custom-bg-abt` supplies the entire Career-snapshot card chrome —
          gold border, slate/gold gradient interior, backdrop blur and the
          neon glow (plus its brighter :hover glow, which fires exactly as the
          console expands). Only geometry is animated here. */}
      <Card
        {...linkProps}
        aria-label={ariaLabel}
        aria-expanded={showExpanded}
        title={`${isPlaying ? 'Now playing' : 'Last played'}: ${track.title} — ${track.artist}`}
        onMouseEnter={open}
        onMouseLeave={close}
        onFocus={open}
        onBlur={close}
        className={`custom-bg-abt group relative block overflow-hidden text-left ${
          hasLink ? 'cursor-pointer' : 'cursor-default'
        }`}
        animate={{
          width: showExpanded ? EXPANDED_W : COLLAPSED_W,
          borderRadius: showExpanded ? 20 : 9999,
          opacity: footerHidden ? 0 : 1,
          y: footerHidden ? 14 : 0,
        }}
        transition={{ duration: expandDur, ease: EASE }}
        style={{ pointerEvents: footerHidden ? 'none' : 'auto' }}
      >
        {/* ── Expanded console (grows the card upward) ───────────────────── */}
        <AnimatePresence initial={false}>
          {showExpanded && (
            <motion.div
              key="panel"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.32, ease: EASE }}
              className="relative overflow-hidden"
            >
              <div className="px-4 pt-3.5">
                <div className="flex items-center justify-between">
                  {/* Eyebrow microlabel — the Career snapshot's exact treatment */}
                  <span
                    className="loader-percent text-[10px] uppercase"
                    style={{ color: AMBER, letterSpacing: '0.22em' }}
                  >
                    {label}
                  </span>
                  {isPlaying ? (
                    <SpotifyBars accent={EMBER} />
                  ) : (
                    playedAgo && (
                      <span
                        className="text-[9px] uppercase tracking-wider"
                        style={{ color: GOLD_SOFT }}
                      >
                        {playedAgo}
                      </span>
                    )
                  )}
                </div>

                {track.album && (
                  <p
                    className="mt-1 truncate text-[11px]"
                    style={{ color: GOLD_MUTED }}
                  >
                    {track.album}
                  </p>
                )}

                {/* Full progress bar + live timecode — only meaningful while
                    playing; last-played shows the track's total length. */}
                <div className="mt-2.5">
                  <div
                    className="h-[3px] w-full overflow-hidden rounded-full"
                    style={{ background: WARM_TRACK }}
                  >
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${(isPlaying ? progress : 0) * 100}%`,
                        background: EMBER,
                        transition: reduceMotion ? 'none' : 'width 900ms linear',
                      }}
                    />
                  </div>
                  <div
                    className="loader-percent mt-1 flex justify-between text-[9px]"
                    style={{ color: GOLD_MUTED }}
                  >
                    <span>{formatTime(isPlaying ? displayMs : 0)}</span>
                    <span>{durationMs ? formatTime(durationMs) : '--:--'}</span>
                  </div>
                </div>

                {/* Ambient spectrum ribbon — animates only while truly playing. */}
                <div className="mt-2">
                  <Spectrum
                    accent={EMBER}
                    active={isPlaying && !reduceMotion}
                    height={30}
                  />
                </div>

                {/* Only advertise the Spotify link when there actually is one
                    — a non-linkable item (local file) has no destination. */}
                {hasLink && (
                  <div className="mt-1 flex items-center gap-1.5 pb-0.5">
                    <SiSpotify size={11} color="#1DB954" aria-hidden="true" focusable="false" />
                    <span
                      className="text-[9px] uppercase tracking-wider"
                      style={{ color: GOLD_MUTED }}
                    >
                      Open on Spotify
                    </span>
                  </div>
                )}
              </div>

              {/* Hairline divider — warm gold, matching the card's border family. */}
              <div
                className="mx-4 mt-3 h-px"
                style={{
                  background:
                    'linear-gradient(90deg, transparent, rgb(255 205 91 / 0.45) 20%, rgb(255 205 91 / 0.45) 80%, transparent)',
                }}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Base row (always visible) ──────────────────────────────────── */}
        <div className="relative flex items-center gap-3 px-3 py-2.5">
          {/* Album "record" + live progress arc + Spotify pip */}
          <div className="relative shrink-0">
            <ProgressRing
              size={RING}
              stroke={2}
              progress={progress}
              accent={EMBER}
              trackColor={WARM_TRACK}
              reduceMotion={reduceMotion}
            >
              {track.albumArt ? (
                <Image
                  src={track.albumArt}
                  alt={track.album || track.title}
                  fill
                  sizes="46px"
                  unoptimized
                  className={`object-cover ${
                    isPlaying ? '' : 'opacity-70 grayscale-[35%]'
                  }`}
                  {...(blurDataURL
                    ? { placeholder: 'blur', blurDataURL }
                    : {})}
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-white/5">
                  <Music
                    className="h-4 w-4"
                    style={{ color: GOLD_SOFT }}
                    aria-hidden="true"
                    focusable="false"
                  />
                </div>
              )}
            </ProgressRing>

            {/* Authentic Spotify badge — the constant brand + affordance mark.
                Static (no pulse): the equaliser bars already carry the play
                signal, so a second forever-loop here would just add noise. */}
            <span
              aria-hidden="true"
              className="absolute -bottom-0.5 -right-0.5 flex h-[15px] w-[15px] items-center justify-center rounded-full"
              style={{ background: 'rgb(2 6 23 / 0.92)' }}
            >
              <SiSpotify size={12} color="#1DB954" aria-hidden="true" focusable="false" />
            </span>
          </div>

          {/* Track title + artist, crossfading on track change */}
          <div className="min-w-0 flex-1">
            <AnimatePresence mode="wait">
              <motion.div
                key={trackId}
                initial={reduceMotion ? false : { opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
                transition={{ duration: 0.3, ease: EASE }}
              >
                <div className="flex items-center gap-1.5">
                  {isPlaying && <SpotifyBars accent={EMBER} />}
                  {/* Live title wears `.text-gold` (#f4e3b8 + soft warm halo),
                      the same treatment the card gives its headline values. */}
                  <Marquee
                    text={track.title}
                    active={isPlaying}
                    className={`text-xs font-semibold ${
                      isPlaying ? 'text-gold' : 'text-[#d4af7a]'
                    }`}
                  />
                </div>
                <p
                  className="mt-0.5 truncate text-[10px]"
                  style={{ color: isPlaying ? GOLD_MUTED : GOLD_SOFT }}
                >
                  {track.artist}
                </p>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </Card>
    </motion.div>
  );
}
