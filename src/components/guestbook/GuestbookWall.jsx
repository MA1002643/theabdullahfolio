'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useSession } from 'next-auth/react';
import { MessageSquare } from 'lucide-react';
import { useCountUp } from '@/hooks/useCountUp';
import { useGuestbookMessages } from '@/hooks/useGuestbookMessages';
import { useHardwareKeyboard } from '@/hooks/useHardwareKeyboard';
import { usePresence } from '@/hooks/usePresence';
import { useUiSound } from '@/hooks/useUiSound';
import { GUESTBOOK_FLAGS } from '@/lib/flags';
import { messageIdFromHash } from '@/lib/guestbook/deepLink';
import {
  NEW_MESSAGE_EVENT,
  arrivalAnnouncement,
} from '@/lib/guestbook/events';
import { viewerFromSession } from '@/lib/guestbook/identity';
import { PAGE_SIZE } from '@/lib/guestbook/paging';
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

// Render pagination (owner-directed): the wall mounts at most PAGE_SIZE cards
// at a time (paging.js — the same constant the API's poll page uses). Two
// costs stay constant however long the wall grows. The DOM: every card is a
// framer li with entrance choreography, a scroll-linked depth filter, tilt
// handlers and sometimes a self-drawing signature SVG. And, since the data
// layer went cursor-paged, the payload: the hook holds a newest-first PREFIX
// of the wall and extends it a leaf at a time as the visitor flips
// (useGuestbookMessages), while the wall's total comes from the server's own
// count — so the rail always shows every page, loaded or not.

const RETRY_BTN_CLASS =
  'rounded-full border border-[#ff6d05]/50 px-4 py-2 font-mono text-xs text-[#f9d174] transition-colors duration-300 hover:border-[#ff6d05] hover:bg-[#ff6d05]/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ff6d05]';

// Skeleton wall: three ghost cards in the wall's own card language, wearing
// the optimistic post's `.gb-pending` shimmer, so neither the first fetch nor
// a leaf still on its way (a rail jump past the loaded prefix) leaves a blank
// void between headline and footer. The whole block fades in after a short
// delay — a fast (local/cached) load resolves before it ever paints, so there
// is no flash of skeleton on the common path. aria-hidden with a separate
// sr-only status line: AT hears one clean sentence, not three empty cards.
function WallSkeleton({ label }) {
  return (
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
        {label}
      </p>
    </>
  );
}

export default function GuestbookWall() {
  const { data: session, status } = useSession();
  // The write gate, decided by the SAME rule the routes apply
  // (viewerFromSession, identity.js): a session can write only when it
  // carries an identity key. An Auth.js session minted before keys existed is
  // still `authenticated` but keyless — every post and reaction it makes
  // answers 401 — so gating on `status` alone showed it a fully enabled
  // composer that could never submit (code review). Such a session gets the
  // sign-in prompt in its re-auth voice instead; signing in again mints a
  // keyed token. `viewer` is null for the anonymous and the keyless alike.
  const viewer = status === 'authenticated' ? viewerFromSession(session) : null;
  const canWrite = viewer !== null;
  const reduceMotion = useReducedMotion();
  const {
    messages,
    count,
    hasMore,
    loading,
    loadingMore,
    loadError,
    submit,
    submitting,
    react,
    remove,
    reload,
    ensureLoaded,
    loadUntil,
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

  // aria-live announcement for confirmed new messages. Announce each id once
  // (the seen-set, so re-renders don't re-announce) and each BATCH as one
  // string: a poll can bring several marks together, and one live-region
  // update per message would be batched by React into a single DOM change —
  // assistive technology would hear only the last arrival. So the effect
  // collects every unseen arrival first (walking the newest-first list, then
  // reading oldest first so the newest is heard last), and writes the region
  // exactly once (arrivalAnnouncement, events.js).
  const [announcement, setAnnouncement] = useState('');
  const announcedRef = useRef(new Set());
  useEffect(() => {
    if (!messages) return;
    const arrivals = [];
    for (const msg of messages) {
      if (!newIds.has(msg.id) || announcedRef.current.has(msg.id)) continue;
      announcedRef.current.add(msg.id);
      arrivals.unshift(msg);
    }
    if (!arrivals.length) return;
    setAnnouncement(arrivalAnnouncement(arrivals));
    // Same moment, different audience: the headline listens for this and
    // replays its scramble-decode (GuestbookTitle) — once per batch; a
    // dispatch per arrival would only restart the same replay N times.
    window.dispatchEvent(new CustomEvent(NEW_MESSAGE_EVENT));
  }, [newIds, messages]);

  const listTopRef = useRef(null);
  // How much of the wall is in hand (pending cards included — they occupy
  // slots in the same slicing); `count` is the whole wall's size.
  const loadedCount = messages?.length ?? 0;

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
  // it (an admin delete emptying the last page). The page COUNT reads the
  // server's total while older leaves are still unloaded — the rail must
  // show the whole wall, not just the part in hand — and the loaded list
  // once the prefix has reached the oldest mark (then it IS the truth, and a
  // stale total can neither hide a loaded card nor promise an empty leaf).
  const [page, setPage] = useState(0);
  const [pageDir, setPageDir] = useState(1);
  const pageCount = Math.max(
    1,
    Math.ceil(
      (hasMore ? Math.max(count, loadedCount) : loadedCount) / PAGE_SIZE,
    ),
  );

  useEffect(() => {
    if (page > pageCount - 1) setPage(pageCount - 1);
  }, [page, pageCount]);

  // Keep the leaf under the reader loaded, plus the one after it so "next"
  // is always instant (the hook fetches bounded pages from its cursor until
  // that index is in hand — a rail jump far down the wall is a few requests,
  // never the whole wall). Keyed on the loaded LENGTH, not the list identity:
  // a reaction toggle doesn't queue a (no-op) check, while a delete that
  // shortens the current leaf does re-run it and tops the leaf back up.
  useEffect(() => {
    if (loading) return;
    ensureLoaded((page + 2) * PAGE_SIZE - 1);
  }, [page, loadedCount, loading, ensureLoaded]);

  // Deep-linkable marks: /guestbook#msg_… flips the wall to the target's page,
  // brings the card to reading height, and replays the ignite glow on it —
  // the URL addresses one message the way the copy-link button on each card
  // promises. The hash is read once, when the first page lands; if the mark
  // is not in the loaded prefix the hook walks older pages for it (loadUntil,
  // bounded) and this effect picks it up when it arrives. Resolved exactly
  // once (the ref): later polls must not re-trigger the jump, and a hash that
  // matches nothing — a deleted mark, a mangled link (including one that will
  // not even percent-decode, see deepLink.js), or a mark beyond the walk's
  // cap — is simply a no-op. The scroll waits out the page-flip choreography
  // (~0.45s exit+enter) so it targets a mounted card.
  const [linkedId, setLinkedId] = useState(null);
  const linkRef = useRef({ id: undefined, walking: false });
  useEffect(() => {
    if (!messages) return;
    const link = linkRef.current;
    if (link.id === undefined) {
      link.id = messageIdFromHash(window.location.hash) || null;
    }
    if (!link.id) return;
    const idx = messages.findIndex((m) => m.id === link.id);
    if (idx === -1) {
      if (!link.walking) {
        link.walking = true;
        loadUntil(link.id).then((found) => {
          if (!found) link.id = null;
        });
      }
      return;
    }
    const id = link.id;
    link.id = null;
    setPage(Math.floor(idx / PAGE_SIZE));
    setPageDir(1);
    setLinkedId(id);
    setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({
        behavior: reduceMotion ? 'auto' : 'smooth',
        block: 'center',
      });
    }, 650);
  }, [messages, reduceMotion, loadUntil]);

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
  // unpleasant on a recruiter-facing wall). Ownership is the server's
  // per-message, per-viewer `isOwn` — decided from the session against the
  // STORED author — not a client-side identity comparison: no message the
  // server serves carries an identity key (nor a username for Google
  // authors), so the client has nothing to compare, and never needed to.
  // What this client reads `session.user.key` for is LOCAL: the write gate
  // above (can this session post or react at all — the routes' own rule) and
  // the composer's per-account draft slot (draftKey.js); the composer is
  // keyed by that identity below so switching accounts remounts it with an
  // empty field. The client gate is display-only — the DELETE route
  // re-derives both ownership and admin from the session.
  const viewerIsAdmin = Boolean(session?.user?.isAdmin);
  const ownsMessage = (msg) => Boolean(msg.isOwn);
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

      {/* Compose slot: the composer for a WRITE-CAPABLE session; the sign-in
          CTA otherwise — in its re-auth voice for a signed-in but keyless
          legacy session, whose posts would all 401; nothing while the
          session is still resolving (avoids a CTA flash for returning
          signed-in visitors). */}
      {canWrite ? (
        <MessageInput
          // Keyed by identity: a different account is a different composer —
          // fresh field state, and its own draft slot read once at mount —
          // never one person's in-progress text autosaved under the next
          // person's slot (draftKey.js).
          key={viewer.key}
          user={session.user}
          onSubmit={handleSubmit}
          submitting={submitting}
        />
      ) : status === 'loading' ? null : (
        <SignInPrompt reauth={status === 'authenticated'} />
      )}

      <div ref={listTopRef} aria-hidden="true" />

      {loading ? (
        <WallSkeleton label="Loading the guestbook…" />
      ) : count === 0 && loadError ? (
        <div className="space-y-3 py-16 text-center">
          <p className="font-mono text-sm text-foreground/60">
            Couldn&rsquo;t load the guestbook
          </p>
          <button type="button" onClick={reload} className={RETRY_BTN_CLASS}>
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
                    canReact={canWrite}
                    onReact={react}
                    canDelete={ownsMessage(msg) || viewerIsAdmin}
                    isOwn={ownsMessage(msg)}
                    onDelete={handleDelete}
                  />
                ))}
              </AnimatePresence>
            </motion.ul>
          </AnimatePresence>
          {/* A leaf whose cards are still on their way (a rail jump past the
              loaded prefix) holds its space with the ghosts; one whose fetch
              failed offers the retry inline — everything above it stays. */}
          {visibleMessages.length === 0 && loadingMore ? (
            <WallSkeleton label="Loading more of the guestbook…" />
          ) : visibleMessages.length === 0 && loadError ? (
            <div className="space-y-3 py-16 text-center">
              <p className="font-mono text-sm text-foreground/60">
                Couldn&rsquo;t load this page
              </p>
              <button
                type="button"
                onClick={() => ensureLoaded((page + 1) * PAGE_SIZE - 1)}
                className={RETRY_BTN_CLASS}
              >
                Try again
              </button>
            </div>
          ) : null}
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
