'use client';

import { useEffect, useRef } from 'react';
import {
  motion,
  useInView,
  useMotionTemplate,
  useReducedMotion,
  useScroll,
  useTransform,
} from 'framer-motion';
import { Link2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useCardTilt } from '@/hooks/useCardTilt';
import { GUESTBOOK_FLAGS } from '@/lib/flags';
import { timeAgo } from '@/lib/guestbook/timeAgo';
import ReactionBar from './ReactionBar';
import SignatureGlyph from './SignatureGlyph';

// One guestbook message: a `custom-bg-abt` neon glass card (the About page's
// card language) with the author row on top and the message as plain text —
// React text nodes only, never innerHTML, which is the XSS story here.
//
// Entrance: each mount cohort — the first load, or a page flip on the
// paginated wall — staggers in by in-page index; a card that arrives alone
// (an optimistic post, a polled-in message) lands at index 0, so it enters
// with no delay by construction. `layout` keeps the rest of the wall reflowing smoothly when a
// new card lands on top. Under reduced motion the entrance collapses to a
// plain fade (the NavButton pattern): opacity is kept — the card still has to
// appear — but the y-rise and scale are pinned at rest.

// Cap the initial stagger so a long wall doesn't hold its tail hostage —
// after ~12 cards everything below the fold enters together.
const MAX_STAGGER_S = 0.6;

export default function MessageCard({
  message,
  index,
  staggered,
  isNew,
  now,
  canReact,
  onReact,
  canDelete = false,
  isOwn = false,
  onDelete,
}) {
  const reduceMotion = useReducedMotion();
  // 3D tilt + specular glare (issue #40 Phase 4) — the about-page hook,
  // self-gated on pointer-fine + reduced motion; the flag only decides
  // whether it is WIRED. Composes with the entrance animation because the
  // tilt lives in style motion-values, not the animate targets.
  const { style: tiltStyle, glareStyle, handlers: tiltHandlers } = useCardTilt();
  const tiltOn = GUESTBOOK_FLAGS.tilt && Boolean(tiltStyle);

  // Scroll depth falloff (issue #40 Phase 4): a card low in the viewport sits
  // slightly blurred and dimmed, sharpening as it rises toward reading
  // height. Deliberately FILTER-only (blur + brightness, compositor-friendly)
  // — opacity belongs to the entrance/exit animations and a style motion
  // value would override them.
  const cardRef = useRef(null);
  const depthOn = GUESTBOOK_FLAGS.scrollChoreography && !reduceMotion;
  const { scrollYProgress } = useScroll({
    target: cardRef,
    offset: ['start end', 'start 0.65'],
  });
  const depthBlur = useTransform(scrollYProgress, [0, 1], [2.2, 0]);
  const depthBright = useTransform(scrollYProgress, [0, 1], [0.85, 1]);
  const depthFilter = useMotionTemplate`blur(${depthBlur}px) brightness(${depthBright})`;

  const delay = staggered ? Math.min(index * 0.05, MAX_STAGGER_S) : 0;

  // Scroll reveal (owner-directed, the journey nodes' LIVE manners): the
  // entrance is gated on the card being in view and re-arms when it leaves —
  // scroll down the wall and each card reveals as it arrives; scroll back
  // and it plays again. The stagger delay applies only to the card's FIRST
  // reveal (the mount cohort arriving together); a lone card scrolling back
  // into view answers immediately, not index-in-line. Reduced motion pins
  // everything visible. Shares cardRef with the depth-falloff useScroll.
  const inView = useInView(cardRef, { amount: 0.18 });
  const revealedOnceRef = useRef(false);
  const entranceDelay = revealedOnceRef.current ? 0 : delay;
  useEffect(() => {
    if (inView) revealedOnceRef.current = true;
  }, [inView]);
  const shown = reduceMotion || inView;

  const { author } = message;
  // Provider decides presentation (issue #40 follow-up: Google sign-in).
  // GitHub handles are public identities — linkable, shown as @handle.
  // Google usernames are internal ids (google:<sub>), never displayed: the
  // card shows the person's name and the avatar links nowhere. Messages
  // stored before the provider field existed are all GitHub, so missing
  // means github.
  const isGitHub = (author.provider ?? 'github') === 'github';
  const displayHandle = isGitHub
    ? `@${author.username || author.name}`
    : author.name || 'Guest';

  const avatarImg = author.avatar ? (
    // Plain <img>, not next/image: remote avatars would need a global
    // remotePatterns change for a 32px thumbnail the CDNs already serve
    // sized (GitHub honours ?s=64; Google URLs carry their own size).
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={
        isGitHub
          ? `${author.avatar}${author.avatar.includes('?') ? '&' : '?'}s=64`
          : author.avatar
      }
      alt=""
      width={32}
      height={32}
      loading="lazy"
      decoding="async"
      className="h-8 w-8 rounded-full border border-[#ff6d05]/30 transition-transform duration-300 group-hover:scale-110"
    />
  ) : (
    <span
      aria-hidden="true"
      className="flex h-8 w-8 items-center justify-center rounded-full border border-[#ff6d05]/30 bg-black/40 font-mono text-xs text-[#f9d174]"
    >
      {(author.name || author.username || '?').charAt(0).toUpperCase()}
    </span>
  );

  const hoverReveal = (
    <span className="pointer-events-none absolute -bottom-6 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap font-mono text-xs text-[#fc83ff]/80 opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-focus-visible:opacity-100">
      {displayHandle}
    </span>
  );

  // Every confirmed mark is addressable: copy /guestbook#<id> and the wall
  // flips to its page, scrolls it to reading height and replays its ignite
  // (GuestbookWall's hash effect). Clipboard write is async and can be denied
  // (permissions, non-secure contexts) — say so instead of failing silently.
  const copyLink = async () => {
    const url = `${window.location.origin}/guestbook#${message.id}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Link copied — it points straight at this mark');
    } catch {
      toast.error('Could not copy the link');
    }
  };

  return (
    <motion.li
      ref={cardRef}
      id={message.id}
      layout={!reduceMotion}
      initial={
        reduceMotion ? { opacity: 0 } : { opacity: 0, y: 20, scale: 0.97 }
      }
      animate={
        shown
          ? reduceMotion
            ? { opacity: 1 }
            : { opacity: 1, y: 0, scale: 1 }
          : { opacity: 0, y: 20, scale: 0.97 }
      }
      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -10 }}
      transition={{ duration: 0.35, delay: entranceDelay, ease: 'easeOut' }}
      style={{
        ...(tiltOn ? tiltStyle : {}),
        ...(depthOn ? { filter: depthFilter } : {}),
      }}
      {...(tiltOn ? tiltHandlers : {})}
      className={`relative rounded-xl custom-bg-abt p-4 sm:p-5 ${
        message.pending ? 'gb-pending' : ''
      }`}
    >
      {/* Brief ignite for a message that just landed (own post confirmed, or a
          new arrival) — a one-shot ember bloom that settles back to the card's
          resting shadow. Skipped under reduced motion. */}
      {isNew && !reduceMotion ? (
        <motion.span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-xl"
          initial={{ boxShadow: '0 0 0px rgba(255, 109, 5, 0)' }}
          animate={{
            boxShadow: [
              '0 0 0px rgba(255, 109, 5, 0)',
              '0 0 22px rgba(255, 109, 5, 0.55)',
              '0 0 0px rgba(255, 109, 5, 0)',
            ],
          }}
          transition={{ duration: 2, ease: 'easeInOut' }}
        />
      ) : null}

      {/* Decorative opening quote, sitting inside the card's top-left. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute left-2 top-0 select-none font-serif text-4xl leading-none text-[#ff6d05]/10"
      >
        &ldquo;
      </span>

      <div className="flex items-center gap-3">
        {/* Avatar. GitHub: links to the profile, with the handle reveal on
            hover as the "hover card" — focusable, so keyboard users get the
            same path (the reveal rides focus-visible as well as hover).
            Google: same visuals, no link — there is no public profile to
            point at, and the internal id must not leak. */}
        {isGitHub ? (
          <a
            href={`https://github.com/${author.username}`}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${author.username} on GitHub (opens in a new tab)`}
            className="group relative shrink-0 rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ff6d05]"
          >
            {avatarImg}
            {hoverReveal}
          </a>
        ) : (
          <span className="group relative shrink-0 rounded-full">
            {avatarImg}
            {hoverReveal}
          </span>
        )}

        {/* No justify-between here (owner fix): with three children that
            distributed the leftover space around the TIME, floating it
            toward the card's centre whenever the bin rendered. The name
            takes flex-1 instead, so the timestamp stays pinned to the right
            edge and the bin, when present, sits beside it — nudging it only
            by its own width. */}
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {/* Ember, not gold (owner call): the author's name carries the same
              #ff6d05 the GUESTBOOK headline is filled with — names are
              content, and content speaks in the title's own ink. */}
          <span className="min-w-0 flex-1 truncate font-mono text-sm text-[#ff6d05]">
            {displayHandle}
          </span>
          {/* Timestamp in the numeral ember (owner call, third pass) — the
              pagination digits' #ff6d05, one colour for every number. */}
          <span className="shrink-0 font-mono text-xs text-[#ff6d05]">
            {message.pending ? 'sending…' : timeAgo(message.createdAt, now)}
          </span>
          {/* Copy-link — every confirmed card is deep-linkable, so the URL
              can travel (a visitor showing off their mark, the owner citing
              one). Same quiet-pink-to-ember voice as the bin beside it;
              always visible (hover-reveal would strand touch screens). */}
          {!message.pending ? (
            <button
              type="button"
              onClick={copyLink}
              aria-label="Copy a link to this message"
              className="shrink-0 rounded-md p-1.5 text-[#fc83ff]/60 transition-colors duration-300 hover:bg-[#ff6d05]/10 hover:text-[#ff6d05] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ff6d05]"
            >
              <Link2 aria-hidden="true" className="h-3.5 w-3.5" />
            </button>
          ) : null}
          {/* Bin — the viewer's own confirmed card, or ANY confirmed card
              when the viewer is the wall's admin (the route enforces
              own-or-admin regardless). Quiet pink at rest, ember on intent;
              the removal itself is the wall's optimistic flow with a
              success/failure toast. */}
          {canDelete && !message.pending && onDelete ? (
            <button
              type="button"
              onClick={() => onDelete(message.id)}
              aria-label={
                isOwn
                  ? 'Delete your message'
                  : `Delete ${author.name || displayHandle}'s message`
              }
              className="shrink-0 rounded-md p-1.5 text-[#fc83ff]/60 transition-colors duration-300 hover:bg-[#ff6d05]/10 hover:text-[#ff6d05] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ff6d05]"
            >
              <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
      </div>

      {/* Fire-amber ink for the message body (owner call): the SAME gradient
          the contact form paints on typed input — visitor words read in the
          exact ink they would have been typed in. `.gb-fire-ink` is the
          contact textarea's 180deg amber→ember clip WITHOUT the
          `.text-fire-amber` glow filter (body copy, not a badge). Clip-text
          inside these animated cards follows the RepoStatsCard precedent
          (clipped paragraph inside a tilt card) — verify entrances on a real
          GPU if this ever misbehaves. */}
      <p className="gb-fire-ink mt-3 pl-1 text-sm leading-relaxed sm:text-base">
        {message.message}
      </p>

      {/* Ink signature, drawing on just after the card's entrance settles —
          and only once the card is actually IN VIEW (`play`): a below-fold
          signature holds un-drawn at page load and inks itself when its
          card arrives, re-arming with the card's replayed entrance.
          entranceDelay (not delay) so a re-entry draws immediately, not
          index-in-line. SignatureGlyph re-validates the path before
          rendering and returns null for anything that fails the grammar. */}
      {message.signature ? (
        <SignatureGlyph
          d={message.signature}
          authorName={author.name}
          delay={entranceDelay + 0.35}
          play={shown}
        />
      ) : null}

      {/* Reactions — hidden on an optimistic card (no server id to react to
          yet); the bar appears when the POST confirms. */}
      {GUESTBOOK_FLAGS.reactions && !message.pending ? (
        <ReactionBar message={message} canReact={canReact} onReact={onReact} />
      ) : null}

      {/* Specular glare — pointer-tracked radial highlight over the card,
          driven per-frame by motion values (no React re-renders). */}
      {tiltOn ? (
        <motion.div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-[inherit]"
          style={glareStyle}
        />
      ) : null}
    </motion.li>
  );
}
