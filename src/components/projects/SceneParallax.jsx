'use client';
import { useEffect } from 'react';
import { useLoaderRevealed } from '@/hooks/useLoaderRevealed';
import { onMediaChange } from '@/lib/mediaQuery';

// Camera drift for the /projects workshop scene.
//
// The backdrop is position:fixed and the page content scrolls over it, so the
// scene is the one thing on the page that never moves — which is exactly what
// makes a photographic background read as wallpaper. Giving it a few pixels of
// pointer- and scroll-linked drift makes the content feel like it is in front
// of a room rather than pasted onto a picture.
//
// ── WHY A CSS VARIABLE AND NOT REACT STATE ──────────────────────────────
// This updates every animation frame. Routing that through React would
// re-render three backdrop layers 60x a second for a transform change. Instead
// the component renders NOTHING and only writes two custom properties on
// <html>; CSS applies them in `.projects-backdrop`'s transform. The work per
// frame is two setProperty calls, and the compositor does the rest — no
// layout, no paint, no React.
//
// ── HONEST ABOUT WHAT THIS IS ───────────────────────────────────────────
// This is a single-plane camera drift, not true multi-plane parallax: the
// still is one flat image with no depth channel, so the canopy and the far
// corridor necessarily move together. Faking a split with a radial mask was
// considered and rejected — it reads as a wobbling cutout the moment you
// notice it. A slight, coherent camera move is the honest version, and at
// these amplitudes it is felt rather than seen.
//
// Gates: reduced motion (never), coarse pointer (never — there is no hover to
// drive it, and touch devices are the ones that least want a rAF loop), and
// the loader reveal (nothing competes with first paint). The loop also parks
// itself once the drift has settled, so a still pointer costs zero frames.
const AMP_X = 14; // px of horizontal drift at the viewport edge
const AMP_Y = 10; // px of vertical drift
const SCROLL_AMP = 22; // px of additional drift across a full page scroll
const EASE = 0.075; // per-frame approach; ~critically damped at 60fps
const SETTLE = 0.02; // px below which the loop parks itself

const SceneParallax = () => {
  const revealed = useLoaderRevealed();

  useEffect(() => {
    if (!revealed) return undefined;
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    const fine = window.matchMedia('(hover: hover) and (pointer: fine)');
    const root = document.documentElement;

    let raf = 0;
    let running = false;
    let tx = 0;
    let ty = 0;
    let cx = 0;
    let cy = 0;

    const clear = () => {
      root.style.removeProperty('--scene-dx');
      root.style.removeProperty('--scene-dy');
    };

    const frame = () => {
      cx += (tx - cx) * EASE;
      cy += (ty - cy) * EASE;
      root.style.setProperty('--scene-dx', `${cx.toFixed(2)}px`);
      root.style.setProperty('--scene-dy', `${cy.toFixed(2)}px`);
      if (Math.abs(tx - cx) < SETTLE && Math.abs(ty - cy) < SETTLE) {
        cx = tx;
        cy = ty;
        root.style.setProperty('--scene-dx', `${cx.toFixed(2)}px`);
        root.style.setProperty('--scene-dy', `${cy.toFixed(2)}px`);
        running = false; // park: a still pointer must not burn frames
        return;
      }
      raf = requestAnimationFrame(frame);
    };
    const kick = () => {
      if (running) return;
      running = true;
      raf = requestAnimationFrame(frame);
    };

    // Scroll contributes on every device; the pointer only where there is one.
    const scrollTerm = () => {
      const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      return (Math.min(window.scrollY, max) / max - 0.5) * SCROLL_AMP;
    };
    let pointerX = 0;
    let pointerY = 0;

    const recompute = () => {
      // Negative: the scene slides AGAINST the pointer, which is what reads as
      // depth. Matching the pointer reads as the image being dragged.
      tx = -pointerX * AMP_X;
      ty = -pointerY * AMP_Y + scrollTerm();
      kick();
    };

    const onPointer = (e) => {
      pointerX = (e.clientX / window.innerWidth) * 2 - 1;
      pointerY = (e.clientY / window.innerHeight) * 2 - 1;
      recompute();
    };
    const onScroll = () => recompute();

    let attached = false;
    const attach = () => {
      if (attached) return;
      attached = true;
      if (fine.matches) window.addEventListener('pointermove', onPointer, { passive: true });
      window.addEventListener('scroll', onScroll, { passive: true });
      recompute();
    };
    const detach = () => {
      if (!attached) return;
      attached = false;
      window.removeEventListener('pointermove', onPointer);
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(raf);
      running = false;
      clear();
    };

    const apply = () => (reduce.matches ? detach() : attach());
    apply();
    const offReduce = onMediaChange(reduce, apply);
    const offFine = onMediaChange(fine, () => {
      // Pointer capability can change (a mouse being plugged in); rebind.
      if (!attached) return;
      window.removeEventListener('pointermove', onPointer);
      if (fine.matches) window.addEventListener('pointermove', onPointer, { passive: true });
    });

    return () => {
      offReduce?.();
      offFine?.();
      detach();
    };
  }, [revealed]);

  return null;
};

export default SceneParallax;
