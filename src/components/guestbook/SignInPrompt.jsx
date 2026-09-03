'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { signIn } from 'next-auth/react';
import { PenLine, Send } from 'lucide-react';
import { FaGithub, FaGoogle } from 'react-icons/fa';
import { useMagneticPull } from '@/hooks/useMagneticPull';
import { GUESTBOOK_FLAGS } from '@/lib/flags';
import { MESSAGE_MAX } from '@/lib/guestbook/validate';

// CTA card for unauthenticated visitors. The wall itself stays readable —
// signing in only gates writing. OAuth is the whole identity story (issue
// #40): it kills anonymous spam and supplies name + avatar for free. Two
// providers by owner request — GitHub for the developer crowd, Google for
// everyone else. FaGoogle comes from react-icons (already a dependency;
// lucide dropped brand glyphs), rendered in the same mono-gold as the
// GitHub mark so neither button breaks the ember palette.

const BUTTON_CLASS =
  'inline-flex items-center gap-2 rounded-full border border-[#ff6d05]/50 bg-black/60 px-6 py-3 font-mono text-sm tracking-wider text-[#f9d174] transition-all duration-300 hover:border-[#ff6d05] hover:bg-[#ff6d05]/10 hover:shadow-[0_0_20px_rgba(255,109,5,0.25)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ff6d05]';

export default function SignInPrompt() {
  const reduceMotion = useReducedMotion();
  // Magnetic lean on the CTAs (issue #40 Phase 4) — inert on touch and under
  // reduced motion by the hook's own gate; the flag decides the wiring. One
  // hook instance per button so each leans independently.
  const magnetGithub = useMagneticPull();
  const magnetGoogle = useMagneticPull();
  const on = (magnet) => GUESTBOOK_FLAGS.magnetic && Boolean(magnet.style);

  return (
    <motion.div
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 15 }}
      animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className="relative overflow-hidden rounded-xl custom-bg-abt"
    >
      {/* GHOST COMPOSER (owner call — the flat card read like a wall): an
          inert, dimmed preview of the ACTUAL form that signing in unlocks —
          avatar slot, input line, live-derived counter, send, the ✦ AI
          refine affordance, the signature fold, and the drafts promise —
          mirroring MessageInput's real geometry AND its full feature set, so
          the glass pane above genuinely shows what is behind the gate (a
          recruiter who never signs in still learns what the composer can
          do). Decorative only: aria-hidden, pointer-inert, nothing
          focusable. */}
      <div
        aria-hidden="true"
        className="pointer-events-none select-none p-3 opacity-70 sm:p-4"
      >
        <div className="flex items-center gap-3">
          <span className="h-8 w-8 shrink-0 rounded-full border border-[#ff6d05]/30 bg-black/40" />
          <span className="min-w-0 flex-1 truncate text-left font-mono text-sm text-foreground/60">
            Leave a message…
          </span>
          <span className="shrink-0 font-mono text-xs tabular-nums text-foreground/60">
            0/{MESSAGE_MAX}
          </span>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg">
            <Send aria-hidden="true" className="h-4 w-4 text-[#f9d174]" />
          </span>
        </div>

        {/* The refine affordance, where the real composer grows it. */}
        <p className="mt-2 inline-flex items-center gap-1.5 text-left font-mono text-xs text-[#ff6d05]/75">
          <span className="refine-spark">✦</span> Refine with AI
        </p>

        {/* The signature fold, with its real header line this time. */}
        <div className="mt-3 border-t border-dashed border-[#f9d174]/15 pt-3">
          <p className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-[#ffd27d]/80">
            <PenLine className="h-3.5 w-3.5" />
            Add a signature (optional)
          </p>
          <div className="mt-3 h-16 rounded-lg border border-dashed border-[#f9d174]/25 bg-gradient-to-b from-[#ff6d05]/5 to-black/20" />
          <p className="mt-2 text-center font-mono text-[10px] tracking-wide text-[#f9d174]/50">
            Drafts save themselves as you type
          </p>
        </div>
      </div>

      {/* THE GLASS: a frosted pane over the ghost — the form stays legible
          through the blur, so the card says "this is waiting for you"
          instead of presenting a black wall. Pink invites (the site's
          invitational voice — the LEAVE YOUR MARK subtitle), gold acts. */}
      <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-black/30 p-6 text-center backdrop-blur-[3px]">
        <p className="text-sm text-[#fc83ff]/90">Sign in to leave a message</p>
        <div className="flex flex-wrap items-center justify-center gap-3">
        <motion.button
          type="button"
          onClick={() => signIn('github')}
          style={on(magnetGithub) ? magnetGithub.style : undefined}
          {...(on(magnetGithub) ? magnetGithub.handlers : {})}
          className={BUTTON_CLASS}
        >
          <FaGithub aria-hidden="true" className="h-4 w-4" />
          SIGN IN WITH GITHUB
        </motion.button>
        <motion.button
          type="button"
          onClick={() => signIn('google')}
          style={on(magnetGoogle) ? magnetGoogle.style : undefined}
          {...(on(magnetGoogle) ? magnetGoogle.handlers : {})}
          className={BUTTON_CLASS}
        >
          <FaGoogle aria-hidden="true" className="h-4 w-4" />
          SIGN IN WITH GOOGLE
        </motion.button>
        </div>
      </div>
    </motion.div>
  );
}
