'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, useInView } from 'framer-motion';
import { ArrowUpRight } from 'lucide-react';
import SliceLabel from '@/components/contact/SliceLabel';
import { githubUsername, profileGithubUrl } from '@/components/footer/footer-data';
import { useMagneticPull } from '@/hooks/useMagneticPull';
import { USES_FLAGS } from '@/lib/flags';
import { fluid, fluidText } from '@/lib/fluidScale';
import { countTiles, resolveStack } from '@/lib/uses/stack';
import {
  SKILLS_CACHE_KEY,
  SKILLS_CACHE_TTL_MS,
  SKILLS_LAST_FETCHED_KEY,
} from '@/utils/skillsIconUrl';
import LiveAge from './LiveAge';
import Plate, { Figure } from './Plate';
import ToolGrid from './ToolGrid';
import { riseProps, staged, useStagedReveal } from './useStagedReveal';

// 02 · THE STACK — crawled live from the owner's repositories. The plate
// renders the CURATED set immediately (never an empty plate, and the grid's
// height is reserved from the first paint), then fetches /api/github-skills
// once it scrolls near the viewport (the SkillsCard discipline: viewport-
// gated, 10-min server TTL, the About page's localStorage cache reused so a
// visitor arriving from /about sees the live counts instantly). When the
// payload is real the tiles upgrade in place with their repo counts and the
// provenance line earns its `● LIVE` token; when it is empty or errored the
// curated set stays and the live claim is DROPPED — never asserted on stale
// or fallback data.
//
// The provenance line's figures — the tool count and the age's digits — wear
// the page title's ember (owner correction 2026-09-05), the words the line's
// grey: numbers read as the instrument's readout, words as its label. The
// count is `countTiles` over whatever the plate is showing, so it is the live
// crawl's total when live and the curated set's when not — never typed in.
//
// Accessibility: the "verified" announcement lives in a role="status" region
// that changes text once per real fetch; the ticking age (LiveAge, its own
// component so the per-second render never touches the grid) is aria-hidden.
const ENDPOINT = '/api/github-skills';

export default function StackPlate({ fallback }) {
  const gateRef = useRef(null);
  // Start fetching a little before the plate is on screen so the counts are
  // usually there by the time the tiles reveal.
  const near = useInView(gateRef, { once: true, margin: '240px 0px' });

  const [payload, setPayload] = useState(null);
  const [fetchedAt, setFetchedAt] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [statusText, setStatusText] = useState('');

  useEffect(() => {
    if (!near || !USES_FLAGS.liveStack || typeof window === 'undefined') return undefined;
    let cancelled = false;
    const controller = new AbortController();

    // The About card's cache — a payload younger than the TTL is a real crawl
    // result, so it is applied as live with its own fetch time.
    let servedFromCache = false;
    try {
      const last = Number(window.localStorage.getItem(SKILLS_LAST_FETCHED_KEY));
      const cached = window.localStorage.getItem(SKILLS_CACHE_KEY);
      if (cached && Number.isFinite(last) && Date.now() - last < SKILLS_CACHE_TTL_MS) {
        const categories = JSON.parse(cached);
        setPayload({ categories });
        setFetchedAt(new Date(last).toISOString());
        setLoaded(true);
        setStatusText('Stack verified against GitHub.');
        servedFromCache = true;
      }
    } catch {
      // Storage blocked or corrupt — fall through to a live fetch.
    }
    if (servedFromCache) return () => controller.abort();

    fetch(`${ENDPOINT}?username=${encodeURIComponent(githubUsername)}`, {
      signal: controller.signal,
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return;
        setLoaded(true);
        if (!data?.categories) return;
        setPayload(data);
        const at = typeof data.fetchedAt === 'string' ? data.fetchedAt : new Date().toISOString();
        setFetchedAt(at);
        if (!data._fallback) {
          setStatusText('Stack verified against GitHub.');
          try {
            window.localStorage.setItem(SKILLS_LAST_FETCHED_KEY, String(Date.now()));
            window.localStorage.setItem(SKILLS_CACHE_KEY, JSON.stringify(data.categories));
          } catch {
            // Quota / private mode — the plate still renders.
          }
        }
      })
      .catch(() => {
        if (!cancelled) setLoaded(true);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [near]);

  const stack = useMemo(() => resolveStack(payload, fallback), [payload, fallback]);
  const total = countTiles(stack.groups);

  const magnet = useMagneticPull();
  const magnetOn = USES_FLAGS.magnetic && magnet.enabled;

  const provenance = stack.live ? (
    <>
      <span aria-hidden="true" className="uses-live-dot" /> live ·{' '}
      <Figure>{total}</Figure> tools
      {fetchedAt ? (
        <>
          {' '}
          ·{' '}
          <span aria-hidden="true">
            <LiveAge fetchedAt={fetchedAt} />
          </span>
          <span className="sr-only">verified against GitHub</span>
        </>
      ) : null}
    </>
  ) : (
    <>
      curated · <Figure>{total}</Figure> tools ·{' '}
      {loaded ? 'GitHub unreachable' : 'syncing with GitHub…'}
    </>
  );

  return (
    <Plate
      slug="stack"
      ordinal="02"
      eyebrow={stack.live ? 'Stack · crawled from the repositories' : 'Stack · curated set'}
      title="The stack"
      provenance={provenance}
    >
      {({ revealed, reduceMotion, revealedAtRef }) => (
        <div ref={gateRef}>
          <p role="status" aria-live="polite" className="sr-only">
            {statusText}
          </p>

          <ToolGrid
            groups={stack.groups}
            revealed={revealed}
            reduceMotion={reduceMotion}
            revealedAtRef={revealedAtRef}
          />

          <RepositoriesCta
            revealed={revealed}
            reduceMotion={reduceMotion}
            revealedAtRef={revealedAtRef}
            magnet={magnet}
            magnetOn={magnetOn}
          />
        </div>
      )}
    </Plate>
  );
}

// The page's one CTA — the repositories every count above points at. Its
// own viewport gate (the ledger above it is taller than any viewport, so
// the plate's gate fired long before this is seen).
//
// Dressed as the contact page's "Send message" (owner ask 2026-09-06: the
// same colour, border line and hover): flat ember text on the About-card
// surface (`custom-bg-abt` — the gold hairline, the slate gradient, the
// orangered rest glow), the same hover bloom and spring scale, SliceLabel's
// blade sweeping in from the pill's right edge to part the letters — and the
// magnetic lean it already had. Every hover effect is inert on touch and
// under reduced motion by its own gate. The transition is scoped to
// box-shadow/opacity: the transform is Framer's per frame (magnetic x/y +
// the scale spring), and a CSS transition on it would lag the follow.
function RepositoriesCta({ revealed, reduceMotion, revealedAtRef, magnet, magnetOn }) {
  const { ref, on, delay } = useStagedReveal({ revealed, reduceMotion, revealedAtRef });
  const [hovered, setHovered] = useState(false);
  return (
    <motion.div
      ref={ref}
      className="uses-anim flex justify-center"
      style={{ marginTop: fluid(1.75) }}
      {...riseProps(on, reduceMotion, staged(reduceMotion, delay, 0.1, 0.5), 10)}
    >
      <motion.a
        href={`${profileGithubUrl}?tab=repositories`}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="See the repositories on GitHub (opens in a new tab)"
        className="btn-slice custom-bg-abt inline-flex cursor-pointer items-center justify-center gap-2 rounded-full font-semibold tracking-wide shadow-sm transition-[box-shadow,opacity] duration-300 hover:shadow-[0_0_8px_rgba(255,109,5,0.65),0_0_20px_rgba(255,109,5,0.4)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ff6d05]"
        style={{
          color: '#ff6d05',
          textShadow: 'none',
          padding: `${fluid(0.5)} ${fluid(1.5)}`,
          fontSize: fluidText(1, 0.875),
          ...(magnetOn ? magnet.style : {}),
        }}
        {...(magnetOn ? magnet.handlers : {})}
        onHoverStart={() => setHovered(true)}
        onHoverEnd={() => setHovered(false)}
        whileHover={{ scale: 1.04 }}
        whileTap={{ scale: 0.96 }}
        transition={{ type: 'spring', stiffness: 400, damping: 22, mass: 0.6 }}
      >
        <SliceLabel text="SEE THE REPOSITORIES" hovered={hovered} />
        <ArrowUpRight aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
      </motion.a>
    </motion.div>
  );
}
