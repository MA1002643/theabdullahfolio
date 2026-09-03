'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useSession } from 'next-auth/react';
import { MessageSquare } from 'lucide-react';
import { useCountUp } from '@/hooks/useCountUp';
import { useGuestbookMessages } from '@/hooks/useGuestbookMessages';
import { useHardwareKeyboard } from '@/hooks/useHardwareKeyboard';
import { usePresence } from '@/hooks/usePresence';
import { useUiSound } from '@/hooks/useUiSound';
import { GUESTBOOK_FLAGS } from '@/lib/flags';
import { NEW_MESSAGE_EVENT } from '@/lib/guestbook/events';
import MessageCard from './MessageCard';
import MessageInput from './MessageInput';
import PresencePill from './PresencePill';
import SignInPrompt from './SignInPrompt';
import WallPagination from './WallPagination';

// The guestbook wall: meta strip (presence · count · ⌘K) → compose row (or
// sign-in CTA) → the message list.
// State lives in useGuestbookMessages; session state decides
// which top slot renders. The list is a real <ul>/<li> tree and new arrivals
// are announced through a visually-hidden aria-live region, so screen-reader
// visitors hear "X wrote: …" the same moment sighted ones see the card land.

// Re-render cadence for the relative timestamps — once a minute keeps
// "just now" honest for the cost of one state tick.
const TIME_TICK_MS = 60 * 1000;

// Render pagination (owner-directed): the wall mounts at most this many
// cards at a time. The bottleneck at guestbook scale is never the payload —
// 150 messages is ~45KB of JSON, and growth is rate-limited to one message
// per user per five minutes — it is the DOM: every card is a framer li with
// entrance choreography, a scroll-linked depth filter, tilt handlers and
// sometimes a self-drawing signature SVG. Eight cards keeps that constant
// regardless of how long the wall grows, while the data layer (fetch-all,
// poll-merge, optimistic submit) stays exactly as it was.
const PAGE_SIZE = 8;

export default function GuestbookWall() {
  const { data: session, status } = useSession();
  const reduceMotion = useReducedMotion();
  const {
    messages,
    loading,
    loadError,
    submit,
    submitting,
    react,
    remove,
    reload,
    newIds,
    clearNewIds,
    // Live refresh rides the presence flag — "presence + polling" is one
    // feature in the issue, and they share the same 15s/hidden-tab manners.
  } = useGuestbookMessages({
    pollMs: GUESTBOOK_FLAGS.presence ? 30 * 1000 : 0,
  });
  const presenceCount = usePresence(GUESTBOOK_FLAGS.presence);
  const keyboardLikely = useHardwareKeyboard();
  const play = useUiSound();

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), TIME_TICK_MS);
    return () => clearInterval(id);
  }, []);

  // aria-live announcement for confirmed new messages. Announce once per id —
  // the effect walks newIds against a seen-set so re-renders don't re-announce.
  const [announcement, setAnnouncement] = useState('');
  const announcedRef = useRef(new Set());
  useEffect(() => {
    if (!messages) return;
    for (const id of newIds) {
      if (announcedRef.current.has(id)) continue;
      announcedRef.current.add(id);
      const msg = messages.find((m) => m.id === id);
      if (msg) {
        setAnnouncement(`New message from ${msg.author.name}: ${msg.message}`);
        // Same moment, different audience: the headline listens for this and
        // replays its scramble-decode (GuestbookTitle).
        window.dispatchEvent(new CustomEvent(NEW_MESSAGE_EVENT));
      }
    }
  }, [newIds, messages]);

  const listTopRef = useRef(null);
  const count = messages?.length ?? 0;

  // In-view state for the meta strip, driving the pills' count-up replay
  // (owner-directed: the numbers climb again on every scroll back into
  // view, in step with the strip's whileInView rise). CALLBACK ref + own
  // IntersectionObserver, NOT framer's useInView-on-a-ref — the strip
  // mounts late (after the first fetch), and an observer attached from a
  // mount effect would find a null ref and never fire (the same
  // late-mount trap the signature pad's sizing hit). threshold matches
  // the rise's viewport amount so figure and rise arrive together.
  const [stripEl, setStripEl] = useState(null);
  const [stripInView, setStripInView] = useState(false);
  useEffect(() => {
    if (!stripEl) return undefined;
    const io = new IntersectionObserver(
      ([entry]) => setStripInView(entry.isIntersecting),
      { threshold: 0.35 },
    );
    io.observe(stripEl);
    return () => io.disconnect();
  }, [stripEl]);

  // The pill's figure rolls in with the site's elite count-up (the stat
  // cards' sprint-then-settle; quick roll on later posts/deletes), re-armed
  // by the strip's in-view state. The PLURAL follows the real count, not
  // the rolling digit, so the label never reads "1 marks" once the tween
  // lands.
  const shownCount = useCountUp(count, { active: stripInView });

  // Pagination state. `pageDir` remembers the travel direction of the last
  // flip so the leaf slide and the odometer roll both read the right way;
  // the clamp effect walks the page back in range if the wall shrinks under
  // it (an admin delete emptying the last page).
  const [page, setPage] = useState(0);
  const [pageDir, setPageDir] = useState(1);
  const pageCount = Math.max(1, Math.ceil(count / PAGE_SIZE));

  useEffect(() => {
    if (page > pageCount - 1) setPage(pageCount - 1);
  }, [page, pageCount]);

  // Deep-linkable marks: /guestbook#msg_… flips the wall to the target's page,
  // brings the card to reading height, and replays the ignite glow on it —
  // the URL addresses one message the way the copy-link button on each card
  // promises. Runs once against the FIRST loaded list (the ref guard): later
  // polls must not re-trigger the jump, and a hash that matches nothing (a
  // deleted mark, a mangled link) is simply a no-op. The scroll waits out the
  // page-flip choreography (~0.45s exit+enter) so it targets a mounted card.
  const [linkedId, setLinkedId] = useState(null);
  const hashHandledRef = useRef(false);
  useEffect(() => {
    if (hashHandledRef.current || !messages || messages.length === 0) return undefined;
    hashHandledRef.current = true;
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (!id) return undefined;
    const idx = messages.findIndex((m) => m.id === id);
    if (idx === -1) return undefined;
    setPage(Math.floor(idx / PAGE_SIZE));
    setPageDir(1);
    setLinkedId(id);
    const timer = setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({
        behavior: reduceMotion ? 'auto' : 'smooth',
        block: 'center',
      });
    }, 650);
    return () => clearTimeout(timer);
  }, [messages, reduceMotion]);

  const goToPage = (next) => {
    const clamped = Math.max(0, Math.min(next, pageCount - 1));
    if (clamped === page) return;
    setPageDir(clamped > page ? 1 : -1);
    setPage(clamped);
    // A flip retires the "new arrival" markers — the ignite glow belongs to
    // the moment a message lands, not to every later remount of its card.
    // The deep-linked card's marker retires with them for the same reason.
    clearNewIds();
    setLinkedId(null);
    // The new leaf starts above — bring the wall's top back to the reader.
    listTopRef.current?.scrollIntoView({
      behavior: reduceMotion ? 'auto' : 'smooth',
      block: 'start',
    });
  };

  const visibleMessages = messages
    ? messages.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE)
    : [];

  // Page-flip choreography (mode="wait"): the old leaf slips out along the
  // travel direction, then the incoming page's cards run the wall's own
  // staggered entrance — the flip IS the existing choreography, replayed.
  // Variant FUNCTIONS + AnimatePresence `custom` so an exiting leaf always
  // reads the current direction, not the one it mounted with.
  const pageVariants = {
    enter: (d) => (reduceMotion ? { opacity: 1 } : { opacity: 0, x: 18 * d }),
    center: {
      opacity: 1,
      x: 0,
      transition: { duration: 0.25, ease: 'easeOut' },
    },
    exit: (d) =>
      reduceMotion
        ? { opacity: 0, transition: { duration: 0.1 } }
        : {
            opacity: 0,
            x: -18 * d,
            transition: { duration: 0.18, ease: 'easeIn' },
          },
  };

  const handleSubmit = async (text, signature) => {
    // The optimistic card lands at index 0 of the FIRST page — flip there
    // immediately so the visitor watches their own pending shimmer, wherever
    // they were composing from.
    goToPage(0);
    const ok = await submit(text, session?.user, signature);
    play(ok ? 'send' : 'error');
    if (ok) {
      // The new card lands at the top of the list, just under the input —
      // nudge it into view in case the visitor had scrolled down the wall.
      listTopRef.current?.scrollIntoView({
        behavior: reduceMotion ? 'auto' : 'smooth',
        block: 'nearest',
      });
    }
    return ok;
  };

  // Delete gate (the bin button): your own card always, and EVERY card for
  // the wall's admin (`session.user.isAdmin`, stamped server-side in auth.js
  // from GUESTBOOK_ADMIN — the owner's moderation path for anything
  // unpleasant on a recruiter-facing wall). The client gate is display-only —
  // the DELETE route re-derives both ownership and admin from the session
  // server-side. Case-insensitive to match the route (GitHub logins are).
  const viewerName = (session?.user?.username || '').toLowerCase();
  const viewerIsAdmin = Boolean(session?.user?.isAdmin);
  const ownsMessage = (msg) =>
    Boolean(viewerName) &&
    (msg.author?.username || '').toLowerCase() === viewerName;
  const handleDelete = async (id) => {
    const msg = (messages || []).find((m) => m.id === id);
    const ok = await remove(id, { own: msg ? ownsMessage(msg) : true });
    play(ok ? 'send' : 'error');
  };

  return (
    // min-h keeps a short wall (especially the empty state) from pulling the
    // footer into the first viewport: the footer's masthead assembles late
    // (fonts, live repo data) and shifting IN VIEW is what turned a 0 CLS on
    // tall pages into 0.399 here. Reserving the space moves that assembly
    // below the fold — and gives the empty state room to breathe besides.
    <section className="z-10 mx-auto mt-6 min-h-[55vh] w-full max-w-2xl space-y-6 pb-10 sm:mt-10">
      {/* Meta strip (owner-directed, from the guestbook concept comp): the
          old count line + presence pill replaced by a unified pill row —
          live presence, the mark count, and a ⌘K hint — carrying the site's
          full accent triad one pill each (pink presence, gold count, ember
          ⌘K; owner call — the neutral first cut read too grey against the
          rest of the site), mono microcopy on the same glassy dark shell
          throughout. The ⌘K pill is gated on the palette flag (never
          advertise a feature that's flipped off) AND on useHardwareKeyboard
          — a phone or bare iPad never sees it, while an iPad grows it live
          the moment a trackpad attaches or a physical key is pressed.
          Capability, not viewport width: a narrow desktop window keeps its
          hint, a full-width tablet doesn't get one. Still hidden until the
          first fetch lands so the count never flashes "0" over a populated
          wall. The rise REPLAYS on every return into view (whileInView, not
          a mount-once animate — the headline's replayOnView manners; the
          drop back to hidden runs once the strip is mostly off-screen).
          whileInView over useInView-on-a-ref deliberately: the strip mounts
          late (after the fetch), and a ref observed from the component's
          mount effect would still be null then. Reduced motion pins it
          visible with no transform. */}
      {!loading ? (
        <motion.div
          ref={setStripEl}
          initial={reduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ amount: 0.35 }}
          transition={{
            delay: reduceMotion ? 0 : 0.3,
            duration: 0.5,
            ease: 'easeOut',
          }}
          className="flex flex-wrap items-center justify-center gap-2 sm:gap-3"
        >
          {GUESTBOOK_FLAGS.presence ? (
            <PresencePill count={presenceCount} active={stripInView} />
          ) : null}
          {/* Eyebrow amber #ffaa2a (owner call): the same ink the Career
              Snapshot's "Personal Projects" label carries, on text and
              border both. */}
          <p className="rounded-full border border-[#ffaa2a]/30 bg-black/40 px-3 py-1 font-mono text-xs text-[#ffaa2a]">
            <span className="font-semibold tabular-nums">{shownCount}</span>{' '}
            {count === 1 ? 'mark' : 'marks'} left
          </p>
          {GUESTBOOK_FLAGS.commandPalette && keyboardLikely ? (
            <p className="rounded-full border border-[#ff6d05]/30 bg-black/40 px-3 py-1 font-mono text-xs text-[#ff6d05]">
              ⌘K · commands
            </p>
          ) : null}
        </motion.div>
      ) : null}

      {/* Compose slot: input when signed in, CTA when signed out, nothing
          while the session is still resolving (avoids a CTA flash for
          returning signed-in visitors). */}
      {status === 'authenticated' ? (
        <MessageInput
          user={session.user}
          onSubmit={handleSubmit}
          submitting={submitting}
        />
      ) : status === 'unauthenticated' ? (
        <SignInPrompt />
      ) : null}

      <div ref={listTopRef} aria-hidden="true" />

      {loading ? (
        // Skeleton wall: three ghost cards in the wall's own card language,
        // wearing the optimistic post's `.gb-pending` shimmer, so the first
        // fetch never leaves a blank void between headline and footer. The
        // whole block fades in after a short delay — a fast (local/cached)
        // load resolves before it ever paints, so there is no flash of
        // skeleton on the common path. aria-hidden with a separate sr-only
        // status line: AT hears one clean sentence, not three empty cards.
        <>
          <motion.ul
            aria-hidden="true"
            data-testid="gb-skeleton"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.35, ease: 'easeOut' }}
            className="space-y-4 sm:space-y-5"
          >
            {[0, 1, 2].map((i) => (
              <li
                key={i}
                className="gb-pending rounded-xl custom-bg-abt p-4 sm:p-5"
              >
                <div className="flex items-center gap-3">
                  <span className="h-8 w-8 shrink-0 rounded-full border border-[#ff6d05]/20 bg-black/40" />
                  <span className="h-3 w-28 rounded bg-[#f9d174]/10" />
                  <span className="ml-auto h-2.5 w-14 rounded bg-[#f9d174]/10" />
                </div>
                <div className="mt-4 space-y-2 pl-1">
                  <span className="block h-3 w-11/12 rounded bg-[#ff6d05]/10" />
                  {/* Middle card runs a line longer — identical ghosts read
                      as a pattern, staggered ones read as content. */}
                  {i === 1 ? (
                    <span className="block h-3 w-3/5 rounded bg-[#ff6d05]/10" />
                  ) : null}
                </div>
              </li>
            ))}
          </motion.ul>
          <p role="status" className="sr-only">
            Loading the guestbook…
          </p>
        </>
      ) : count === 0 && loadError ? (
        <div className="space-y-3 py-16 text-center">
          <p className="font-mono text-sm text-foreground/60">
            Couldn&rsquo;t load the guestbook
          </p>
          <button
            type="button"
            onClick={reload}
            className="rounded-full border border-[#ff6d05]/50 px-4 py-2 font-mono text-xs text-[#f9d174] transition-colors duration-300 hover:border-[#ff6d05] hover:bg-[#ff6d05]/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ff6d05]"
          >
            Try again
          </button>
        </div>
      ) : count === 0 ? (
        // Empty state in the page's own accent triad (owner call — the grey
        // first cut read flat against a colourful site): the icon sits in an
        // ember-ringed disc with a soft halo (the Try-again button's tint
        // family, kept restrained), the lead line takes the chrome gold, and
        // the invitation is pink ON PURPOSE — it quotes the headline's pink
        // "LEAVE YOUR MARK" subtitle, so the echo is typographic and chromatic.
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="space-y-4 py-16 text-center"
        >
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-[#ff6d05]/25 bg-[#ff6d05]/10 shadow-[0_0_24px_-8px_rgba(255,109,5,0.45)]">
            <MessageSquare
              aria-hidden="true"
              className="h-7 w-7 text-[#ff6d05]"
            />
          </div>
          <p className="font-mono text-sm text-[#f9d174]">No messages yet</p>
          <p className="text-xs text-[#fc83ff]/90">
            Be the first to leave your mark
          </p>
        </motion.div>
      ) : (
        <>
          {/* Outer AnimatePresence (mode="wait", keyed by page) owns the
              leaf flip; the inner one still owns per-card exits WITHIN a
              page (an optimistic rollback, an admin delete). initial={false}
              so first mount doesn't play a phantom flip — the cards' own
              cascade is the arrival. */}
          <AnimatePresence mode="wait" custom={pageDir} initial={false}>
            <motion.ul
              key={page}
              custom={pageDir}
              variants={pageVariants}
              initial="enter"
              animate="center"
              exit="exit"
              className="space-y-4 sm:space-y-5"
            >
              <AnimatePresence>
                {visibleMessages.map((msg, i) => (
                  <MessageCard
                    key={msg.id}
                    message={msg}
                    index={i}
                    staggered
                    isNew={newIds.has(msg.id) || msg.id === linkedId}
                    now={now}
                    canReact={status === 'authenticated'}
                    onReact={react}
                    canDelete={ownsMessage(msg) || viewerIsAdmin}
                    isOwn={ownsMessage(msg)}
                    onDelete={handleDelete}
                  />
                ))}
              </AnimatePresence>
            </motion.ul>
          </AnimatePresence>
          <WallPagination
            page={page}
            pageCount={pageCount}
            dir={pageDir}
            onPage={goToPage}
          />
        </>
      )}

      {/* Screen-reader announcements for new arrivals; visually hidden. */}
      <div aria-live="polite" className="sr-only">
        {announcement}
      </div>
    </section>
  );
}
