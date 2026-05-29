'use client';

import { forwardRef, useCallback, useEffect, useRef } from 'react';

// FireInput — single-line <input> wrapper that paints the fire-amber
// gradient on typed text without breaking the input's native horizontal
// auto-scroll.
//
// Why this component exists: applying `background-clip: text` + the
// transparent fill needed to reveal the clipped gradient directly on a
// scrolling <input> disables WebKit/Blink's auto-scroll-to-cursor and
// manual horizontal scroll. The textarea works because its vertical
// scroll axis can ride along with the gradient via
// `background-attachment: local`; the horizontal axis doesn't have the
// same hook on single-line inputs.
//
// Workaround used here: the real <input> keeps its native behavior
// (text just has `color: transparent` so the user sees nothing in the
// input itself, plus `caret-color: #ff6d05` for a visible cursor), and
// a sibling overlay <div> mirrors the input's value and scrollLeft. The
// overlay is a regular block element where `background-clip: text`
// works without input-specific quirks, so the gradient shows there.
//
// Props are forwarded transparently to the underlying <input>, so this
// component drops in for `<input {...register('name', {...})} />`
// usage without changing the form's validation wiring.
const FireInput = forwardRef(function FireInput(
  { className = '', ...rest },
  forwardedRef,
) {
  const inputRef = useRef(null);
  const overlayRef = useRef(null);

  // Tee the inner input ref between our own ref (for sync) and any ref
  // the parent passed in (e.g. the callback ref react-hook-form returns
  // from `register()`). This is what lets `<FireInput {...register(...)}>`
  // continue to work — the ref from the spread is forwarded straight
  // through to the real <input> element.
  const setRef = useCallback(
    (node) => {
      inputRef.current = node;
      if (typeof forwardedRef === 'function') forwardedRef(node);
      else if (forwardedRef) forwardedRef.current = node;
    },
    [forwardedRef],
  );

  // Push the current input value into the overlay and align it
  // horizontally with the input's scroll position.
  //
  // The extra `input.scrollLeft = input.scrollWidth` step is the fix
  // for the auto-scroll-to-cursor bug: `color: transparent` on the
  // real <input> disables WebKit/Blink's native scroll-to-follow-
  // cursor behavior (the browser treats transparent text as "no
  // visible content worth scrolling for"), so without this nudge the
  // input's scrollLeft stays at 0 as the user types past the visible
  // width — the cursor goes off-screen and the visible window stays
  // pinned to the start. Setting scrollLeft to scrollWidth pins the
  // cursor at the right edge of the visible window whenever the
  // selection is at the end of the value (the typing case). The
  // browser clamps to `scrollWidth - clientWidth` so this is safe
  // even when text fits in the visible area. Arrow-key cursor
  // movement *backward* through a long value won't auto-scroll left
  // to keep the cursor visible — known limitation; would need a
  // canvas measureText pass to compute the cursor's pixel position.
  //
  // Using textContent (not innerHTML) is deliberate — input value is
  // untrusted user text and must not be parsed as markup.
  const sync = useCallback(() => {
    const input = inputRef.current;
    const overlay = overlayRef.current;
    if (!input || !overlay) return;
    if (input.selectionEnd === input.value.length) {
      input.scrollLeft = input.scrollWidth;
    }
    overlay.textContent = input.value;
    overlay.style.transform = `translateX(${-input.scrollLeft}px)`;
  }, []);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    // Initial sync handles defaultValue / autofill at mount.
    sync();
    // `input` event covers all typed-value changes (keystrokes, IME
    // composition end, paste, cut). `scroll` event fires whenever the
    // input scrolls — both as a side effect of typing past the visible
    // width and on user-initiated horizontal scroll. Together these
    // cover every interactive case; programmatic .value sets (e.g. a
    // future reset()) would need an additional MutationObserver, but
    // the current form doesn't reset on submit so this is enough.
    const onInput = () => sync();
    const onScroll = () => sync();
    input.addEventListener('input', onInput);
    input.addEventListener('scroll', onScroll);
    return () => {
      input.removeEventListener('input', onInput);
      input.removeEventListener('scroll', onScroll);
    };
  }, [sync]);

  return (
    <div className="fire-input-wrap">
      <input
        ref={setRef}
        className={`fire-input-real ${className}`}
        {...rest}
      />
      {/* Overlay is decorative — the real <input> above it owns all
          interaction, focus, validation, and AT semantics. */}
      <div className="fire-input-overlay" aria-hidden="true">
        <div ref={overlayRef} className="fire-input-overlay-text" />
      </div>
    </div>
  );
});

export default FireInput;
