'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { Send } from 'lucide-react';
import { toast } from 'sonner';
import FireInput from '@/components/contact/FireInput';
import MessageRefine from '@/components/contact/MessageRefine';
import { useCardTilt } from '@/hooks/useCardTilt';
import { useFieldDraft } from '@/hooks/useFieldDraft';
import { useMagneticPull } from '@/hooks/useMagneticPull';
import { useUiSound } from '@/hooks/useUiSound';
import { remove, setNativeValue } from '@/lib/contact';
import { GUESTBOOK_FLAGS } from '@/lib/flags';
import { draftKeyFor, LEGACY_DRAFT_KEY } from '@/lib/guestbook/draftKey';
import { MESSAGE_MAX } from '@/lib/guestbook/limits';
import SignatureField from './SignatureField';

// Compose card for a signed-in visitor, laid out after the guestbook concept
// comp: avatar (identity confirmation) · the message input · a live counter ·
// the send button on one row, with the optional ink-signature slot folded
// under a dashed divider (issue #40 Phase 3, relayout per the owner's
// composer comp). The submit itself is the parent's optimistic flow — this
// component clears the field the moment the message is handed off and
// restores the draft if the server rejects it, so a failed post never eats
// what was typed. The composer stays EDITABLE while the request is in flight
// (that is the point of the optimistic clear), so the settle step only
// touches what the visitor has not touched since (code review): a failed
// send restores its text only into a still-empty field — otherwise the new
// draft stays and a toast offers the earlier text back — and a successful
// send folds the signature away only if it is still the one that was sent.
//
// The input is the contact form's FireInput, so the composer types in the
// site's one input voice: fire-amber gradient glyphs, flat #ff6d05
// placeholder and caret. FireInput's gradient overlay mirrors the DOM value
// via real `input` events, so the programmatic clear/restore below goes
// through setNativeValue (the contact form's own pattern for writing a value
// AND updating the overlay in one dispatch) rather than bare setState.
//
// The composer also carries the contact message field's intelligence layer,
// re-cut for a one-line public mark:
//   - AI refine — the same MessageRefine panel, pointed at /api/refine-message
//     in 'guestbook' mode (casual voice, ≤MESSAGE_MAX chars, no links).
//   - Draft autosave/restore — useFieldDraft mirrors the field into
//     localStorage and repopulates it on a later visit, with the contact
//     form's own "Restored your unsent message" banner. The slot is PER
//     ACCOUNT (draftKey.js: keyed by the session's identity key), so two
//     people signing into the same browser never restore each other's
//     unsent text; a session without a key saves nothing.
//   - Offline hold — sending while offline keeps the text in the field (and
//     therefore the draft) with an explanatory toast, instead of burning the
//     optimistic post against a dead connection. Deliberately NOT the contact
//     form's auto-send queue: a guestbook post is an authenticated, 1-per-5-min
//     rate-limited action, so a background resend could fire against an
//     expired session or a fresh limit — holding the words is the honest hold.

// Counter turns ember when the message is close to the cap.
const COUNTER_WARN_AT = MESSAGE_MAX - 20;

// Show the ✦ refine affordance from this many typed characters. Mirrors the
// server's guestbook-mode floor the way the contact form's 24 mirrors its 20:
// a hair above it, so the affordance never offers a request the API would 400.
const REFINE_MIN_LEN = 12;

export default function MessageInput({ user, onSubmit, submitting }) {
  const play = useUiSound();
  const [text, setText] = useState('');
  const [signature, setSignature] = useState(null);
  // Bumped after a confirmed send so SignatureField folds itself away.
  const [resetSignal, setResetSignal] = useState(0);
  const inputRef = useRef(null);
  const trimmed = text.trim();
  const canSend = trimmed.length >= 2 && !submitting;
  // What the field and the pad hold RIGHT NOW, readable after an await: the
  // submit flow below compares against these to tell "still as I left it"
  // from "the visitor has moved on" before it restores or resets anything.
  const textRef = useRef(text);
  textRef.current = text;
  const signatureRef = useRef(signature);
  signatureRef.current = signature;

  // Specular glare ONLY on the compose card — deliberately NOT the tilt the
  // wall cards carry. The signature pad maps pointer coords through
  // getBoundingClientRect(), which reflects CSS transforms: with the card
  // rotating in 3D under the cursor, the pad's flat bitmap and the projected
  // rect disagree and ink lands away from the pointer (the bug this fixes).
  // useCardTilt exposes the rotation and the glare separately, so the glare
  // keeps tracking the cursor while the card itself stays flat.
  const { style: tiltStyle, glareStyle, handlers: tiltHandlers } = useCardTilt();
  const glareOn = GUESTBOOK_FLAGS.tilt && Boolean(tiltStyle);

  // Magnetic pull on the send button (issue #40 Phase 4) — the existing CTA
  // hook, gated by its flag. Disabled buttons stop emitting pointer events,
  // so the magnet is released explicitly whenever the button drops into its
  // disabled state (the hook documents exactly this case).
  const magnet = useMagneticPull();
  const magnetOn = GUESTBOOK_FLAGS.magnetic && Boolean(magnet.style);
  const releaseRef = useRef(magnet.release);
  releaseRef.current = magnet.release;
  useEffect(() => {
    if (!canSend) releaseRef.current();
  }, [canSend]);

  // Write the field through the DOM (real `input` event → our onChange →
  // state) so FireInput's gradient overlay stays in lock-step with
  // programmatic clears and restores. Falls back to plain state where no
  // node exists (the helper itself no-ops without a DOM).
  const writeField = (value) => {
    if (inputRef.current) setNativeValue(inputRef.current, value);
    else setText(value);
  };

  // Autosave + restore the message, so a half-written mark survives a refresh
  // or an accidental navigation. Storage mirrors the field, so the optimistic
  // clear below also clears the draft and a failed post's restore re-saves it.
  // The slot is this ACCOUNT's (draftKey.js) — null, and so no persistence,
  // for a session without an identity key. GuestbookWall keys this component
  // by that identity, so the slot never changes under a mounted composer.
  const reduced = useReducedMotion();
  const draftLayer = useFieldDraft({
    storageKey: draftKeyFor(user),
    value: text,
    writeField,
  });

  // The pre-scoping slot was shared by every account on the browser. It is
  // never read again — whatever it holds is some earlier account's private
  // text, and restoring it here would attribute it to whoever is signed in
  // now — so the first composer to mount removes it.
  useEffect(() => {
    remove(LEGACY_DRAFT_KEY);
  }, []);

  // Apply an accepted AI rewrite into the field. The rewrite contract says
  // single-line and ≤MESSAGE_MAX, but the field's own rules are enforced here
  // regardless: collapse any whitespace run (the input rejects newlines) and
  // hard-cap the length, exactly as the onChange path does.
  const applyRefined = (value) => {
    writeField(value.replace(/\s+/g, ' ').trim().slice(0, MESSAGE_MAX));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSend) return;
    // Offline → don't spend the optimistic card on a post that cannot land;
    // the text stays in the field, which keeps it in the autosaved draft too.
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      toast('You’re offline — your message is kept here until you’re back.', {
        icon: '✦',
      });
      return;
    }
    const sent = { text, signature };
    writeField('');
    const ok = await onSubmit(trimmed, signature);
    // The field and the pad stayed live while that awaited, so settle ONLY
    // what is still as the send left it (code review — a failed request used
    // to overwrite a new draft with the old message, and a success used to
    // wipe a signature drawn in the meantime).
    if (ok) {
      // Fold the pad away only if the signature is still the one that went
      // out; a newly drawn one is the next message's, and stays.
      if (signatureRef.current === sent.signature) {
        setSignature(null);
        setResetSignal((n) => n + 1);
      }
      return;
    }
    if (textRef.current === '') {
      // Nothing typed since the clear: the failed message comes straight back.
      writeField(sent.text);
      return;
    }
    // A new draft is in the field. It must not be overwritten — but the failed
    // words must not vanish either, so offer them back; taking the offer is
    // the visitor's explicit choice to replace what they have typed since.
    toast('Your earlier message wasn’t sent', {
      icon: '✦',
      description: sent.text,
      action: { label: 'Restore it', onClick: () => writeField(sent.text) },
    });
  };

  return (
    <motion.form
      onSubmit={handleSubmit}
      {...(glareOn ? tiltHandlers : {})}
      className="relative rounded-xl custom-bg-abt p-3 transition-shadow duration-300 focus-within:shadow-[0_0_2px_#ff8400,0_0_20px_rgba(255,109,5,0.35)] sm:p-4"
    >
      {/* Restored-draft banner: shown when an unsent message was repopulated
          from a previous visit — the contact form's own banner, same classes,
          same Keep/Clear pair. */}
      <AnimatePresence>
        {draftLayer.restored && (
          <motion.div
            key="draft-restored"
            className="draft-restored mb-3 w-full"
            role="status"
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: -8 }}
            transition={{ duration: 0.32, ease: 'easeOut' }}
          >
            <span className="draft-restored__text">
              <span aria-hidden="true" className="refine-spark">
                ✦
              </span>
              Restored your unsent message
            </span>
            <span className="draft-restored__actions">
              <button
                type="button"
                className="refine-btn refine-btn--ghost"
                onClick={draftLayer.dismissRestored}
              >
                Keep
              </button>
              <button
                type="button"
                className="refine-btn refine-btn--ghost"
                onClick={draftLayer.clearDraft}
              >
                Clear
              </button>
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex items-center gap-3">
        {user?.image ? (
          // Plain <img> for the same reason as MessageCard: a 32px GitHub
          // avatar the CDN already optimises — next/image would need
          // remotePatterns.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.image}
            alt=""
            width={32}
            height={32}
            decoding="async"
            className="h-8 w-8 shrink-0 rounded-full border border-[#ff6d05]/30"
          />
        ) : (
          // Imageless session (provider returned no picture): the same
          // initial-letter disc the cards fall back to, so the composer
          // always confirms WHO is writing.
          <span
            aria-hidden="true"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#ff6d05]/30 bg-black/40 font-mono text-xs text-[#f9d174]"
          >
            {(user?.name || user?.username || '?').charAt(0).toUpperCase()}
          </span>
        )}

        <label htmlFor="guestbook-message" className="sr-only">
          Your message
        </label>
        {/* font-mono/text-sm live on this wrapper, not the input: FireInput's
            gradient overlay inherits its font from here, so the amber glyphs
            and the (transparent) real text measure identically. The p-2 +
            transparent border match the overlay's hard-coded content box. */}
        <div className="min-w-0 flex-1 font-mono text-sm">
          <FireInput
            ref={inputRef}
            id="guestbook-message"
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, MESSAGE_MAX))}
            onFocus={() => play('focus')}
            placeholder="Leave a message…"
            autoComplete="off"
            maxLength={MESSAGE_MAX}
            className="w-full rounded-md border border-transparent bg-transparent p-2 outline-none"
          />
        </div>

        {/* The feature cards' numeral ember #ff6d05 (owner call, third
            pass) — the same ink the pagination odometer and the "Projects
            shipped" digit carry, so numbers speak in one colour. The
            near-cap warning survives the single hue as a neon
            intensification: the glyphs gain an ember glow instead of
            changing colour. */}
        <span
          aria-hidden="true"
          className={`shrink-0 font-mono text-xs tabular-nums text-[#ff6d05] transition-[text-shadow] duration-300 ${
            text.length > COUNTER_WARN_AT
              ? '[text-shadow:0_0_10px_rgba(255,109,5,0.8)]'
              : ''
          }`}
        >
          {text.length}/{MESSAGE_MAX}
        </span>

        {/* h-12/w-12 = a 48px tap target on touch screens (checklist §15).
            Bordered square per the concept comp; hover is the site's ember
            glow (the contact CTA's shadow pair), scoped to :enabled so a
            disabled button never lights up. The transition names its
            properties — never bare `transition`, which would smear the
            magnetic pull's per-frame transform (issue #47 lesson). */}
        <motion.button
          type="submit"
          disabled={!canSend}
          aria-label="Send message"
          style={magnetOn ? magnet.style : undefined}
          {...(magnetOn ? magnet.handlers : {})}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-[#ff6d05]/30 transition-[border-color,box-shadow] duration-300 enabled:hover:border-[#ff6d05]/70 enabled:hover:shadow-[0_0_8px_rgba(255,109,5,0.65),0_0_20px_rgba(255,109,5,0.4)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ff6d05] disabled:opacity-30 sm:h-10 sm:w-10"
        >
          {/* Ember, not gold (owner call, second pass): send is the page's
              primary ACTION, and actions speak in #ff6d05 — the same vivid
              orange the contact form's SEND MESSAGE! CTA carries. */}
          <Send aria-hidden="true" className="h-4 w-4 text-[#ff6d05]" />
        </motion.button>
      </div>

      {/* AI "polish my mark": streams a cleaner one-line rewrite the visitor
          can accept into the field — the contact form's MessageRefine, in
          guestbook mode. Hidden until there's real content; while a post is
          in flight the panel aborts any stream and resets (the submit has
          already captured the text) — this composer stays mounted after a
          send, so a merely-hidden refine would otherwise finish and resurface
          under the cleared field. */}
      <div className="mt-2">
        <MessageRefine
          message={text}
          onAccept={applyRefined}
          disabled={submitting}
          mode="guestbook"
          minLength={REFINE_MIN_LEN}
        />
      </div>

      <div className="mt-3">
        <SignatureField
          onSignatureChange={setSignature}
          resetSignal={resetSignal}
        />
      </div>

      {/* Specular glare — pointer-tracked radial highlight over the card,
          driven per-frame by motion values (no React re-renders). Pointer-
          transparent so the input and buttons beneath keep all interaction. */}
      {glareOn ? (
        <motion.div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-[inherit]"
          style={glareStyle}
        />
      ) : null}
    </motion.form>
  );
}
