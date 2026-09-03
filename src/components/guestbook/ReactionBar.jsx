'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { REACTIONS } from '@/lib/guestbook/reactions';
import { useUiSound } from '@/hooks/useUiSound';

// 🔥 🚀 ❤️ per message (issue #40 Phase 4). Counts roll up on a spring —
// the outgoing number slides away as the incoming one lands — and setting a
// reaction fires a small hand-rolled canvas ember burst from the button.
// Optimistic end-to-end: the parent hook patches counts before the POST and
// restores them if the server disagrees; one-reaction-per-user is the
// server's law, this bar only reflects it (active state on your current
// choice, clicking it again clears).

const COUNT_SPRING = { type: 'spring', stiffness: 300, damping: 20 };

// Hand-rolled burst: ~14 ember particles from the click point, 600ms, gravity
// + fade, on a throwaway canvas over the button. Not canvas-confetti — that
// library ships shapes/workers this 40-line effect doesn't need.
function burst(canvas) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const size = 96;
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  const colors = ['#eab53e', '#ff6d05', '#fcf699', '#b16612'];
  const parts = Array.from({ length: 14 }, () => {
    const angle = Math.random() * Math.PI * 2;
    const speed = 40 + Math.random() * 90;
    return {
      x: size / 2,
      y: size / 2,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 40,
      r: 1 + Math.random() * 1.8,
      color: colors[Math.floor(Math.random() * colors.length)],
    };
  });
  const t0 = performance.now();
  let raf;
  const frame = (now) => {
    const t = (now - t0) / 1000;
    if (t > 0.6) {
      ctx.clearRect(0, 0, size, size);
      return;
    }
    ctx.clearRect(0, 0, size, size);
    ctx.globalAlpha = 1 - t / 0.6;
    for (const p of parts) {
      const x = p.x + p.vx * t;
      const y = p.y + p.vy * t + 160 * t * t; // gravity
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(x, y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  return () => cancelAnimationFrame(raf);
}

function RollingCount({ value }) {
  return (
    <span className="relative inline-flex h-4 min-w-[1ch] overflow-hidden font-mono text-xs tabular-nums">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={value}
          initial={{ y: 10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -10, opacity: 0 }}
          transition={COUNT_SPRING}
          className="inline-block"
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

export default function ReactionBar({ message, canReact, onReact }) {
  const reduceMotion = useReducedMotion();
  const play = useUiSound();
  const canvasRefs = useRef({});
  const [pendingKey, setPendingKey] = useState(null);

  // Cancel any in-flight burst animation on unmount.
  const cancelRef = useRef(null);
  useEffect(() => () => cancelRef.current?.(), []);

  const counts = message.reactions || {};

  const handleClick = async (key) => {
    if (pendingKey) return;
    const clearing = message.viewerReaction === key;
    if (!clearing && !reduceMotion) {
      const canvas = canvasRefs.current[key];
      if (canvas) cancelRef.current = burst(canvas);
    }
    if (!clearing) play('reaction');
    setPendingKey(key);
    await onReact(message.id, key, clearing);
    setPendingKey(null);
  };

  return (
    <div className="mt-3 flex items-center gap-2">
      {REACTIONS.map(({ key, emoji, label }) => {
        const active = message.viewerReaction === key;
        return (
          <button
            key={key}
            type="button"
            disabled={!canReact || Boolean(pendingKey)}
            onClick={() => handleClick(key)}
            aria-pressed={active}
            aria-label={`${label} — ${counts[key] || 0}`}
            title={canReact ? label : 'Sign in to react'}
            className={`relative inline-flex min-h-8 items-center gap-1.5 rounded-full border px-2.5 py-1 transition-colors duration-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ff6d05] disabled:cursor-default ${
              active
                ? 'border-[#ff6d05] bg-[#ff6d05]/15 text-[#f9d174]'
                : 'border-[#ff6d05]/20 text-foreground/60 hover:border-[#ff6d05]/60 hover:text-[#f9d174]'
            } ${!canReact ? 'opacity-60' : ''}`}
          >
            <span aria-hidden="true" className="text-sm leading-none">
              {emoji}
            </span>
            <RollingCount value={counts[key] || 0} />
            {/* Burst canvas — centred over the button, inert, cleared after
                each 600ms flight. */}
            <canvas
              ref={(el) => {
                canvasRefs.current[key] = el;
              }}
              aria-hidden="true"
              className="pointer-events-none absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2"
            />
          </button>
        );
      })}
    </div>
  );
}
