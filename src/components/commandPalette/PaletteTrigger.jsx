'use client';

import { useEffect, useState } from 'react';
import { Search, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { usePathname } from '@/i18n/navigation';
import { usePointerCapability } from '@/hooks/usePointerCapability';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { cn } from '@/lib/utils';
import { paletteShortcutLabel } from './shortcut';

// The palette's visible way in (issue #41 §3.6), styled as the Now Playing
// widget's sibling (src/components/spotify/NowPlaying.jsx): the same
// `custom-bg-abt` chrome (gold border, slate-and-gold interior, soft ember
// glow that brightens on hover), the same pill, the same round "record" with
// a warm ring and a small badge pip at its foot, and the same two-line label —
// a gold title over a muted sub-line. Now Playing holds the reading-START
// corner; this holds the reading-END one, so the pair frames the page.
//
// ⌘K is invisible and, on a phone, impossible: before this, a touch visitor
// could not open the palette at all. Below `sm` the label collapses into the
// record alone (a 46px round chip), so it never collides with Now Playing's
// 246px pill on a narrow screen. The label stays in the accessible name there
// (sr-only, not removed), and where it is visible its words come first and
// contiguous (WCAG 2.5.3, enforced by axe in every locale).
//
// Behaviour mirrors Now Playing too: it fades out while the sub-pages' footer
// is on screen (the footer owns that corner's controls), and lifts above
// FloatingSoundToggle on the homepage for touch visitors. Intent (pointer
// over, focus, touch) warms the panel chunk so the first open is instant.
// No framer animation: colour and opacity transitions in CSS only, off under
// reduced motion.
// The hint line wears the contact intro's fire-amber ramp (`.text-fire-amber`,
// @/lib/fireRamp): gold at the top of the glyphs, ember at the foot. The
// gradient is clipped to THIS span, not a parent, so it is safe while the
// button fades (the GPU clip-text bug), and it carries no drop-shadow: at
// 10px a halo only blurs the letters.
const FIRE_AMBER = {
  backgroundImage: 'linear-gradient(180deg, #ffd27d 0%, #ffbb55 40%, #ffaa2a 70%, #ff6d05 100%)',
  WebkitBackgroundClip: 'text',
  backgroundClip: 'text',
  color: 'transparent',
  WebkitTextFillColor: 'transparent',
};
const WARM_TRACK = 'rgb(255 205 91 / 0.18)';

export default function PaletteTrigger({ onOpen, onIntent, expanded }) {
  const t = useTranslations('Palette');
  const pathname = usePathname();
  const canHover = usePointerCapability();
  const reduce = useReducedMotion();
  // Resolved after mount: the server cannot know the reader's keyboard and
  // would print "Ctrl+K" into HTML that a Mac then hydrates as "⌘K".
  const [platformShortcut, setPlatformShortcut] = useState(null);
  useEffect(() => setPlatformShortcut(paletteShortcutLabel()), []);

  // Footer awareness — Now Playing's exact rule, re-run per route.
  const [footerHidden, setFooterHidden] = useState(false);
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return undefined;
    const footer = document.querySelector('footer');
    if (!footer) {
      setFooterHidden(false);
      return undefined;
    }
    const io = new IntersectionObserver(([entry]) => setFooterHidden(entry.isIntersecting), {
      rootMargin: '0px 0px -8% 0px',
    });
    io.observe(footer);
    return () => io.disconnect();
  }, [pathname]);

  const stacked = !canHover && pathname === '/';

  // Not server-rendered at all: the button does nothing without JavaScript,
  // and its keyboard hint is only knowable on the client.
  if (platformShortcut === null) return null;

  const hint = canHover ? t('triggerHint', { shortcut: platformShortcut }) : t('triggerHintTouch');

  return (
    <button
      type="button"
      onClick={(e) => onOpen(e.currentTarget)}
      onPointerOver={onIntent}
      onFocus={onIntent}
      onTouchStart={onIntent}
      aria-haspopup="dialog"
      aria-expanded={expanded}
      tabIndex={footerHidden ? -1 : 0}
      style={{
        '--floating-bottom-gap': stacked ? '4.75rem' : '1.25rem',
        insetInlineEnd: 'calc(env(safe-area-inset-right, 0px) + 1.25rem)',
        pointerEvents: footerHidden ? 'none' : 'auto',
      }}
      className={cn(
        'custom-bg-abt floating-bottom-anchor group fixed z-50 flex items-center gap-3 rounded-full text-start',
        'p-1 sm:py-2 sm:pe-4 sm:ps-2',
        reduce ? '' : 'transition-[opacity,transform] duration-500 ease-out',
        footerHidden ? 'translate-y-3 opacity-0' : 'opacity-100',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff6d05] focus-visible:ring-offset-2 focus-visible:ring-offset-night-950',
      )}
    >
      {/* The "record": a warm-ringed disc carrying the search glyph, with an
          ember AI pip at its foot where Now Playing has its Spotify badge. */}
      <span className="relative flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full bg-white/[0.04]"
        style={{ boxShadow: `inset 0 0 0 2px ${WARM_TRACK}` }}
        aria-hidden="true"
      >
        <Search className="h-4 w-4 text-[#ff6d05]" strokeWidth={1.75} />
        <span
          className="absolute -bottom-0.5 -end-0.5 flex h-[15px] w-[15px] items-center justify-center rounded-full"
          style={{ background: 'rgb(2 6 23 / 0.92)' }}
        >
          <Sparkles className="h-[10px] w-[10px] text-[#ff6d05]" strokeWidth={2} />
        </span>
      </span>
      <span className="sr-only sm:not-sr-only sm:flex sm:min-w-0 sm:flex-col">
        <span className="text-xs font-semibold text-[#ff6d05]">{t('triggerTitle')}</span>{' '}
        <span className="mt-0.5 truncate text-[10px]" style={FIRE_AMBER}>
          {hint}
        </span>
      </span>
    </button>
  );
}
