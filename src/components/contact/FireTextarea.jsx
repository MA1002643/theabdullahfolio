'use client';

import { forwardRef, useCallback, useEffect, useRef } from 'react';

// FireTextarea — multi-line <textarea> wrapper that paints the fire-amber
// gradient on typed text without the rendering bugs of clipping the gradient
// directly onto the scrolling textarea. The vertical-axis sibling of FireInput.
//
// Why this exists (same root cause as FireInput): applying `background-clip:
// text` + the transparent fill needed to reveal the clipped gradient DIRECTLY
// on a scrolling <textarea> makes the gradient drift against the glyphs as the
// field scrolls (a "color shift" while scrolling) and blanks the text out
// entirely on iOS Safari once the content is large — clipped text on a scroll
// container is a long-standing WebKit/Blink failure mode.
//
// Workaround (mirrors FireInput): the real <textarea> keeps transparent text +
// a visible caret so it scrolls, resizes and validates natively, while a
// sibling overlay <div> mirrors the value and scrollTop and paints the
// gradient. The overlay is a regular, NON-scrolling block element, where
// `background-clip: text` renders reliably everywhere — including iOS and
// Firefox (so the textarea now gets the gradient in Firefox too, where the
// old direct-clip path fell back to a flat colour).
//
// The overlay must wrap identically to the textarea or the (invisible) caret
// drifts from the visible gradient text. Matching font / padding / border /
// line-height / width is handled in CSS (.fire-textarea-*), and the textarea's
// native scrollbar is hidden there so it never steals content width and shifts
// where lines break (the field stays scrollable via wheel / touch / keyboard /
// drag, and resize-y still works).
//
// Props are forwarded transparently to the underlying <textarea>, so this drops
// in for `<textarea {...register('message', {...})} />` usage without changing
// the form's validation wiring.
const FireTextarea = forwardRef(function FireTextarea(
  { className = '', ...rest },
  forwardedRef,
) {
  const textareaRef = useRef(null);
  const overlayRef = useRef(null);

  // Tee the inner textarea ref between our own ref (for sync) and any ref the
  // parent passed in (e.g. the callback ref react-hook-form returns from
  // `register()`). This is what lets `<FireTextarea {...register(...)}>`
  // continue to work — the ref from the spread is forwarded straight through to
  // the real <textarea> element.
  const setRef = useCallback(
    (node) => {
      textareaRef.current = node;
      if (typeof forwardedRef === 'function') forwardedRef(node);
      else if (forwardedRef) forwardedRef.current = node;
    },
    [forwardedRef],
  );

  // Push the current value into the overlay and align it vertically with the
  // textarea's scroll position.
  //
  // The `scrollTop = scrollHeight` step is the vertical twin of FireInput's
  // horizontal fix: `color: transparent` on the real textarea disables
  // WebKit/Blink's native scroll-to-follow-cursor (the browser treats
  // transparent text as "no visible content worth scrolling for"), so without
  // a nudge the view stays pinned to the top as the user types past the visible
  // height and the caret disappears below the fold. When the caret is at the
  // end of the value (the typing case) we pin the view to the bottom so the
  // just-typed line stays visible; the browser clamps scrollTop to
  // `scrollHeight - clientHeight`, so this is a no-op until content overflows.
  // Editing in the MIDDLE of a long value won't auto-scroll to keep the caret
  // visible — known limitation, same as FireInput; would need a per-glyph
  // measurement pass to compute the caret's pixel position.
  //
  // Using textContent (not innerHTML) is deliberate — the value is untrusted
  // user text and must not be parsed as markup.
  const sync = useCallback(() => {
    const ta = textareaRef.current;
    const overlay = overlayRef.current;
    if (!ta || !overlay) return;
    if (ta.selectionEnd === ta.value.length) {
      ta.scrollTop = ta.scrollHeight;
    }
    overlay.textContent = ta.value;
    overlay.style.transform = `translateY(${-ta.scrollTop}px)`;
  }, []);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    // Initial sync handles defaultValue / autofill at mount.
    sync();
    // `input` covers every typed-value change (keystrokes, IME composition end,
    // paste, cut). `scroll` fires whenever the textarea scrolls — as a side
    // effect of typing past the visible height and on user-initiated scroll
    // (wheel, drag, keyboard). A ResizeObserver re-syncs when the box is
    // resized (the resize-y grip, or a responsive width change that re-wraps
    // the text) — neither of which fires input or scroll.
    const onInput = () => sync();
    const onScroll = () => sync();
    ta.addEventListener('input', onInput);
    ta.addEventListener('scroll', onScroll);
    let ro;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => sync());
      ro.observe(ta);
    }
    return () => {
      ta.removeEventListener('input', onInput);
      ta.removeEventListener('scroll', onScroll);
      ro?.disconnect();
    };
  }, [sync]);

  return (
    <div className="fire-textarea-wrap">
      <textarea
        ref={setRef}
        className={`fire-textarea-real ${className}`}
        {...rest}
      />
      {/* Overlay is decorative — the real <textarea> above it owns all
          interaction, focus, validation, and AT semantics. */}
      <div className="fire-textarea-overlay" aria-hidden="true">
        <div ref={overlayRef} className="fire-textarea-overlay-text" />
      </div>
    </div>
  );
});

export default FireTextarea;
