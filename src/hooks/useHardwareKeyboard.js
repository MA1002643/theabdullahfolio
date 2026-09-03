'use client';

import { useEffect, useState } from 'react';

// Is a physical keyboard plausibly attached? There is no direct web API for
// this, so two signals are combined (either one is enough):
//
//   1. `(hover: hover) and (pointer: fine)` — a hover-capable fine pointer
//      (desktop mouse, or an iPad WITH a trackpad / Magic Keyboard) means a
//      desk-class rig where a keyboard is a given. Same query as
//      usePointerCapability, and just as reactive: attaching / detaching an
//      iPad trackpad flips it live, no reload.
//   2. An observed hardware keypress: any keydown while focus is NOT in an
//      editable element. On-screen keyboards only ever type into a focused
//      input/textarea/contenteditable, so Tab, arrows or ⌘K pressed in open
//      page space prove physical keys — this catches the keyboard-only iPad
//      (Smart Keyboard Folio, no trackpad) that signal 1 misses. Latches for
//      the rest of the visit.
//
// SSR and first client render return `false`, so markup gated on this hook
// is absent on the server and identical on both sides of hydration; the
// mount effect then reveals it where a keyboard is detected.
const POINTER_QUERY = '(hover: hover) and (pointer: fine)';

const editableFocused = () => {
  const el = document.activeElement;
  if (!el) return false;
  return (
    el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable
  );
};

export function useHardwareKeyboard() {
  const [likely, setLikely] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const mq = window.matchMedia(POINTER_QUERY);
    let sawHardwareKey = false;

    const update = () => setLikely(sawHardwareKey || mq.matches);
    update();

    const onKeyDown = (e) => {
      // 'Unidentified' is what some mobile IMEs report — never proof of
      // physical keys, and neither is typing into a focused field.
      if (e.key === 'Unidentified' || editableFocused()) return;
      sawHardwareKey = true;
      update();
      window.removeEventListener('keydown', onKeyDown);
    };

    window.addEventListener('keydown', onKeyDown);
    // `change` is the modern API; Safari < 14 (older iPads) only has addListener.
    if (mq.addEventListener) mq.addEventListener('change', update);
    else mq.addListener(update);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      if (mq.removeEventListener) mq.removeEventListener('change', update);
      else mq.removeListener(update);
    };
  }, []);

  return likely;
}
