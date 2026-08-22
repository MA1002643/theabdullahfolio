'use client';

import { BtnList } from '@/app/data';
import NavButton from './NavButton';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { usePointerCapability } from '@/hooks/usePointerCapability';

// ─── Orbit geometry ────────────────────────────────────────────────────────
// The ring is ONE ellipse at every width now. Two constants describe it: how
// flat it is, and how far its outermost button is allowed to reach.

// b / a — the ellipse's flatness, and the only thing the eye reads as the
// ring's TILT. 0.204 is cos(78.2deg): a ring lying almost flat and seen from
// just above, which is the plane the ripple rings under the laptop are already
// drawn on (`perspective(600px) rotateX(80deg)`, app/page.js) — so the orbit
// and the ground rings now agree about where the floor is.
//
// It is the ratio the 480-639px band has always used (297 x 60.5), and it is
// now the ratio EVERYWHERE. Each band used to pick its own: 0.204 below 640,
// then 0.78 at 640, 0.66 at 767, 0.74 at 768, 0.56 at 900, 0.48 at 1024 — all
// measured live. That is why the ring appeared to stand up as the viewport
// grew, tilting three times on the way from a phone to a desktop.
const ORBIT_TILT = 0.204;

// Half the RENDERED width of one nav button, per Tailwind breakpoint:
// `w-14 sm:w-16 md:w-[4.5rem] lg:w-[5rem]` plus its 1px border on each side,
// measured live at 58 / 66 / 74 / 82px. The ring has to be sized around the
// button's outer edge rather than around the path its centre travels — the
// path fitting the viewport is exactly what still let the art hang off it.
//
// 640-767 is no longer one of those steps. The button RAMPS 64 -> 72px across
// that band (the dead-band block in globals.css: the `sm` sizes used to sit
// still for 128px and then jump a third at `md`), so the constant that used to
// stand for it has to ramp with it or the orbit is sized around a button width
// that is only correct at one end. Outer width is the box plus its 1px border
// a side, so half of it runs 33 -> 37 — which is exactly the pair of constants
// this band used to sit between, hit continuously instead of as a step.
// If the CSS ramp's endpoints move, this has to move with them.
const halfButtonWidth = (width) => {
  if (width < 640) return 29;
  if (width < 768) return 33 + (width - 640) / 32;
  return width < 1024 ? 37 : 41;
};

// Breathing room kept between that outer edge and the edge of the viewport.
const EDGE_GUTTER = 16;

// How far a button's hover label hangs BELOW that button's outer edge.
//
// Read off the label's own CSS rather than measured at runtime (NavButton.jsx):
// it is `absolute top-full -mt-1 py-1 text-sm`, so its box is 20px of
// line-height plus 4px of padding a side = 28px, it starts at the bottom of the
// inner span — 1px inside the anchor's border — and `-mt-1` pulls it back 4px.
// 28 - 4 - 1 = 23px below the button's outer edge. There is no `sm:`/`md:` step
// on any of those, so one constant is correct at every width.
//
// It exists because the label is the LOWEST thing the ring puts on the page and
// the ring was never sized around it: `EDGE_GUTTER` reserved 16px under the
// button, the label wants 23, so hovering the bottom-most button clipped it by
// 5-10px at 1440x700, 1024x800, 768x700, 1440x620 and both landscape phones.
// Paying for it out of the ring's size would cost `23 / ORBIT_TILT` = 113px of
// `a` wherever the height term binds — a 12% smaller ring at 1440x700 to fix a
// tooltip. So the label moves instead of the ring: see `labelFlipY` below.
const LABEL_DROP = 23;

// The widest the ring may ever be. 425 is the desktop semi-axis every width
// from ~950px up has always had; from 1536 it RAMPS to 453 by 1728, because the
// laptop itself now ramps 480 -> 512px over the same 192px of width (the xl
// rung in globals.css) and a ring that holds still around a growing centrepiece
// reads as the ring shrinking. 453/425 is 512/480 to three figures, so the
// button ring keeps exactly the proportion to the art it has at every other
// desktop width. A ramp, not a step, for the same reason the 640-767 band
// ramps: nothing in this hero is allowed to jump at a breakpoint any more.
// IF THE XL LAPTOP RAMP'S ENDPOINTS MOVE, THIS MOVES WITH THEM.
const maxSemiAxis = (width) =>
  width < 1536 ? 425 : Math.min(453, 425 + (28 * (width - 1536)) / 192);

// ...and the narrowest. Only the HEIGHT limit below can reach this: the width
// term is what keeps the ring on screen sideways and must never be overridden,
// so the floor is applied to the height term alone, before the two are
// compared. Without it a viewport short enough drives the limit to zero or
// past it, and eight buttons stack on the same point — worse than the clipping
// it would be avoiding, and unrecoverable rather than merely ugly.
const MIN_SEMI_AXIS = 132;

// Where the orbit's centre sits, VERTICALLY, against the laptop.
//
// It used to be "the hero row's centre, dropped up to 64px" — 64 being the
// `mt-16` the ripple rings carried before they were anchored to the laptop's
// measured base. That was only ever a proxy for the base, and the proxy came
// apart everywhere the laptop is not centred on its row: measured against the
// base the rings actually sit on, the old centre landed anywhere from 81px
// ABOVE it (1024x640) to 27px BELOW it (768x900). Below is the failure that
// was reported: with the centre past the base and the ellipse only 0.204 as
// tall as it is wide, every button sat in the laptop's bottom quarter and the
// ring read as orbiting UNDER the art, not around it.
//
// So the orbit now anchors to the same measurement the ground rings use —
// `--lap-base-y`, handed down from app/page.js as a prop — and sits ABOVE the
// base by 15% of the laptop's own height (the owner-specified raise). Being a
// fraction of the LAPTOP rather than of anything else, the pose is identical
// at every viewport: the far half of the lap crosses behind the laptop around
// its midriff, the near half passes in front below its base.
//
// The raise is a TARGET, not a guarantee: the drop derived from it is still
// clamped to what the row can afford (`maxDrop` in updateSize), so the ring
// never buys position with off-screen buttons. And until the first
// measurement lands there is no anchor at all — that one frame keeps the old
// row-centre-plus-64 pose via ORBIT_DROP_FALLBACK, so the pre-measurement
// paint is exactly what this replaces, never worse.
const ORBIT_RAISE = 0.15;
const ORBIT_DROP_FALLBACK = 64;

// How wide the ring may be before it runs off the BOTTOM.
//
// The #93 pass concluded "height no longer enters into it", on the strength of
// the lowest button clearing the foot of the viewport by 76-176px everywhere
// measured. That measurement set topped out at 1024x800; it contained no short
// viewport. At 667x375 the ring's lowest button sits 189px past the fold, and
// the ring is the binding element there — the laptop, by then capped by the
// vertical-fit block in globals.css, is nowhere near it. So height does enter
// into it, at the bottom of the range only, and the conclusion above stands
// unchanged everywhere it was actually taken.
//
// The tilt is NOT the lever. `ORBIT_TILT` is owner-specified and identical at
// every size, so a ring that has to occupy less vertical space has to get
// narrower and flatten in proportion — which is exactly what capping `a` does,
// since `b` is derived from it.
//
// Measured, not assumed: the ring's centre is read off the live wrapper rather
// than predicted from the header and headline heights. Those change with the
// viewport (and again when the webfont lands), and both are somebody else's
// markup — a hard-coded fraction of the viewport would be a copy of a number
// this component does not own. There is no feedback loop in reading it: the
// wrapper is `h-1/2 w-full` and the buttons inside are absolutely positioned,
// so `a` cannot move the box being measured.
// THE BOX, NOT THE VIEWPORT. `halfRow` is the orbit wrapper's own height, which
// is `h-1/2` of the hero row and centred on it — so it is exactly the distance
// from the ring's centre to the foot of the row, and (the row being the last
// thing in the document) to the foot of the PAGE.
//
// That used to be `window.innerHeight - centreY`, and the two are the same
// number for as long as the row's foot IS the viewport's foot — which was
// guaranteed while the shell was `h-screen`. It is not any more: below
// `--hero-min` the page is taller than the screen and scrolls. Measured against
// the viewport there, the room below the centre reads short — negative, even,
// once the centre falls past the fold — so the ring would clamp to
// `MIN_SEMI_AXIS` and stay pinned there no matter how much room the row had
// actually been given. The row is the box the ring lives in and the box the
// user can reach; it is what the ring should be sized to.
//
// Nothing above `--hero-min` moves by a pixel: the substitution is an identity
// wherever the page fits on one screen, and it was verified as one — ring
// centre, drop and semi-axis all come back unchanged at every height that
// already fitted.
const verticalSemiAxisLimit = (halfRow, drop, halfButton) => {
  if (halfRow == null) return Infinity;
  // The ring reaches equally far above and below its centre, so the tighter
  // side is the one that decides — below when the anchored centre sits under
  // the row's middle (positive drop), above when the anchor has raised it past
  // the middle (negative drop, possible now that the centre follows the
  // laptop's base rather than the row). The `min` picks the right side for
  // either sign. Above is what stops the ring climbing into the headline: it
  // is the distance to the TOP of the row, which is the headline's own bottom
  // edge plus `--hero-gap`, rather than the distance to the top of the screen
  // — a tighter and more honest bound.
  const halfSpace = Math.min(halfRow - drop, halfRow + drop) - EDGE_GUTTER;

  // halfSpace = b + halfButton = a * ORBIT_TILT + halfButton, solved for a.
  return Math.max(MIN_SEMI_AXIS, (halfSpace - halfButton) / ORBIT_TILT);
};

// ─── Orbit interaction (issue #105) ────────────────────────────────────────
// The ring is user-drivable: wheel/touchpad over the orbit (or the laptop),
// angular touch-drag on the ring band, a vertical drag or hover-scrub on the
// laptop, and ← / → from any focused button. All of it feeds the SAME
// `rotation` state the ambient auto-orbit writes — there is one angle, and
// every input is just another author of it.

// The ambient spin, restated per SECOND rather than per frame. 0.15°/frame
// was tuned on a 60Hz display, where it is exactly 9°/s — but a rAF callback
// runs at the display's own rate, so the same constant spun the ring twice as
// fast on a 120Hz ProMotion panel. Multiplying by measured frame time keeps
// the tuned speed on every display.
const AUTO_DEG_PER_SEC = 9;

// How long after the LAST user input the ambient spin stays paused. Long
// enough that the ring does not snatch itself back while the user is merely
// between wheel ticks; short enough that the hero never reads as broken-still.
const INPUT_COOLDOWN_MS = 1500;

// Wheel: normalized pixels → degrees, clamped per event. 0.12°/px lets a slow
// two-finger trackpad glide feel precise while a hard flick still crosses
// button slots; the clamp stops one high-velocity tick (or Firefox's
// line-mode deltas × 16) teleporting the ring.
const WHEEL_DEG_PER_PX = 0.12;
const WHEEL_MAX_STEP_DEG = 8;

// Laptop scrub: vertical pointer travel → degrees, used by BOTH the
// hover-scrub (hover-capable pointers) and a touch-drag that starts on the
// laptop. The laptop stands ~330px tall at desktop, so a full top-to-bottom
// sweep is ~115° — two and a half button slots, enough to feel like driving
// the ring rather than nudging it.
const SCRUB_DEG_PER_PX = 0.35;

// Per-move ceiling for pointer-driven deltas. An angular drag crossing near
// the ellipse's centre can produce a wild atan2 swing in one move event; the
// clamp turns that spike into a bounded step instead of a snap.
const DRAG_MAX_STEP_DEG = 12;

// Angular drags ignore samples closer to the centre than this (normalized
// radius): in there a pixel of pointer travel is tens of degrees of angle and
// the mapping stops being a grab. The laptop covers most of that zone anyway.
const DRAG_DEAD_RADIUS = 0.2;

// How fast the rendered angle chases its target, as an exponential rate per
// second (~15% of the remaining gap per 60Hz frame). Wheel ticks and keyboard
// notches move the TARGET and this chase is what the eye sees, so discrete
// inputs glide instead of stepping — and the ambient spin, which also
// advances the target, eases back up to speed after a pause instead of
// resuming with a jerk. Drags bypass it entirely: a grab must track the
// pointer 1:1 or it reads as lag.
const EASE_RATE = 10;

// Forgiveness around the ring band's outer edge for hit-testing, px. The
// band's hit area is the ellipse through the buttons' OUTER edges plus this.
const ORBIT_HIT_PAD = 12;

// ── Flick physics ──────────────────────────────────────────────────────────
// Release a drag while still moving and the ring keeps spinning on real
// momentum — an exponential friction decay, `v · e^(−dt·FRICTION)`, applied
// in the same render loop that runs everything else. The launch velocity is
// an EMA of the drag's own per-move deg/s, so it is the speed the hand was
// actually turning the ring at the moment it let go.
//
// FRICTION 2 gives a half-life of ~0.35s: a hard flick coasts for a couple
// of seconds and travels `v / FRICTION` degrees in total (a capped 540°/s
// flick = 270°, three-quarters of a lap). The cap keeps a wild gesture
// lively without turning the ring into a blur; the floor hands off a little
// above the ambient speed so the settle reads as the ring coming to rest,
// not as it blending imperceptibly into the drift. A release more than
// FLICK_STALE_MS after the last move is a hold, not a flick — the hand
// stopped, so the ring stays where it was put.
const FLICK_FRICTION = 2;
const FLICK_MAX_DEG_PER_SEC = 540;
const FLICK_MIN_DEG_PER_SEC = 12;
const FLICK_STALE_MS = 100;

// Haptic detent for touch drags: a barely-there tick each time the ring
// carries a button across a slot boundary, so the drag has texture on
// hardware that supports it (Android). `navigator.vibrate` simply does not
// exist on iOS Safari — the optional call makes that a silent no-op.
const HAPTIC_TICK_MS = 5;

const clampStep = (v, max) => Math.min(max, Math.max(-max, v));

const withinRect = (el, x, y) => {
  const r = el.getBoundingClientRect();
  return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
};

const Navigation = ({
  setHovered,
  hovered,
  orbitBaseY,
  orbitLapH,
  laptopRef,
  onUserInteract,
}) => {
  const angleIncrement = 360 / BtnList.length;

  const [rotation, setRotation] = useState(0);
  // The orbit's SEMI-AXES in px: the button at angle t sits at
  // (a*cos t, b*sin t) from the ring centre, and — the flex container centres
  // its abspos children — that IS the button's centre, not its corner.
  // `drop` rides along because it is decided by the same measurement: it is
  // the offset from the row's centre to the anchored centre (see ORBIT_RAISE).
  const [axes, setAxes] = useState({
    a: 425,
    b: 425 * ORBIT_TILT,
    drop: 0,
    // Until the wrapper has been measured, no button flips: `Infinity` means
    // "every label fits below", which is the pose the markup already had.
    labelFlipY: Infinity,
  });
  const [visibleButtons, setVisibleButtons] = useState([]);
  const [isColumnLayout, setIsColumnLayout] = useState(false);
  // The orbit's own wrapper. Read (never written) by `verticalSemiAxisLimit`
  // to find where the ring's centre actually sits in the viewport.
  const ringRef = useRef(null);
  const reduceMotion = useReducedMotion();
  // Hover-capable fine pointer (desktop mouse, iPad WITH a trackpad) vs a
  // touch-only surface (phone, iPad WITHOUT one). A live media query, so
  // attaching a Magic Keyboard mid-session enables the laptop hover-scrub on
  // the fly and detaching it disables it — no reload, no UA sniffing.
  const canHover = usePointerCapability();

  // ── Interaction plumbing ──────────────────────────────────────────────────
  // Everything the event handlers touch lives in refs: the wheel and pointer
  // listeners are NATIVE (wheel must be non-passive to preventDefault, which
  // React's synthetic root listeners are not), so they would otherwise close
  // over stale state. `rotationRef` mirrors the state the render reads;
  // `targetRotationRef` is what wheel/keyboard/auto-spin write and the rAF
  // loop chases (see EASE_RATE).
  const rotationRef = useRef(0);
  const targetRotationRef = useRef(0);
  // When the user last drove the ring — the ambient spin waits out
  // INPUT_COOLDOWN_MS from here. -Infinity: never, so the spin starts live.
  const lastInputAtRef = useRef(-Infinity);
  // Hard pause while the pointer rests over the laptop (the hover-scrub is
  // engaged even between movements) — a timestamp alone can't express "still
  // here, just not moving".
  const engagedRef = useRef(false);
  // Active drag: { id, mode: 'angular' | 'linear', ... } or null.
  const dragRef = useRef(null);
  // Hover-scrub state: the last pointer Y seen over the laptop, or null.
  const scrubYRef = useRef(null);
  // In-flight flick, deg/s (0 = none). Set by a moving release, integrated
  // and decayed by the render loop, killed by any newer input via markInput.
  const momentumRef = useRef(0);
  // Mirrors for the native handlers.
  const axesRef = useRef(axes);
  const hoveredRef = useRef(hovered);
  useEffect(() => {
    axesRef.current = axes;
  }, [axes]);
  useEffect(() => {
    hoveredRef.current = hovered;
  }, [hovered]);

  // Every input funnels through here: stamps the cooldown, tells the page a
  // discovery happened (the first-visit tip auto-dismisses on it, issue #105
  // — "they've discovered the affordance on their own"), and takes authority
  // from any flick still in flight — a new grab, wheel tick, scrub move or
  // keystroke always wins over leftover momentum, with no state machine:
  // every input path already runs through here. (A flick's own LAUNCH never
  // does — endDrag sets the momentum after the drag's last markInput.)
  const markInput = useCallback(() => {
    lastInputAtRef.current = performance.now();
    momentumRef.current = 0;
    onUserInteract?.();
  }, [onUserInteract]);

  // Wheel + keyboard: move the TARGET and let the render loop glide there.
  // Under reduced motion there is no render loop — by design, no rAF is ever
  // scheduled (issue #87) — so the same input applies instantly instead: the
  // affordance survives, only the easing (which is motion) is dropped.
  const glideBy = useCallback(
    (deltaDeg) => {
      markInput();
      if (reduceMotion) {
        rotationRef.current += deltaDeg;
        targetRotationRef.current = rotationRef.current;
        setRotation(rotationRef.current);
      } else {
        targetRotationRef.current += deltaDeg;
      }
    },
    [markInput, reduceMotion],
  );

  // Drag + scrub: 1:1 with the pointer, target dragged along so the loop has
  // nothing left to chase (and no stale wheel glide can fight the grab).
  const snapBy = useCallback(
    (deltaDeg) => {
      markInput();
      rotationRef.current += deltaDeg;
      targetRotationRef.current = rotationRef.current;
      setRotation(rotationRef.current);
    },
    [markInput],
  );

  // The ring band's live geometry, in viewport px: centre (the wrapper's
  // centre plus the anchored drop — the same origin every button's translate
  // is measured from) and the ellipse through the buttons' OUTER edges. Used
  // for hit-testing wheel/drag starts and for the angular drag's atan2.
  const orbitGeometry = useCallback(() => {
    const el = ringRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const { a, b, drop } = axesRef.current;
    const halfButton = halfButtonWidth(window.innerWidth);
    return {
      cx: rect.left + rect.width / 2,
      cy: rect.top + rect.height / 2 + drop,
      aEff: a + halfButton + ORBIT_HIT_PAD,
      bEff: b + halfButton + ORBIT_HIT_PAD,
    };
  }, []);

  // Size the orbit to the viewport.
  //
  // One expression, no bands. The horizontal semi-axis is whatever is left of
  // the half-viewport once the outermost button's own half-width and a gutter
  // are taken off it, so the ring CANNOT overflow the screen at any width —
  // the old per-band constants could and did, by up to 75px a side at 500px
  // wide, where a fixed a = 297 was being drawn on a 250px half-viewport.
  //
  // Because `a` and `halfButtonWidth` move in opposite directions by the same
  // amount, the ring's OUTER envelope is continuous whatever the button does:
  // the outermost button's outer edge sits exactly EDGE_GUTTER from the
  // viewport edge at every width, right up to the desktop cap. That held when
  // the button stepped 4px at 640/768/1024 and it still holds now that
  // 640-767 ramps instead of stepping — the identity is a subtraction, not a
  // property of the breakpoints.
  //
  // The VIEWPORT's height no longer enters into it. It only had to before
  // because the ring stood nearly upright on tablets (b up to 233), which is
  // the tilt this pass removes; at ORBIT_TILT the whole ring is 0.2 x its own
  // width tall, and the lowest button clears the foot of the viewport by
  // 76-176px everywhere measured — including 1024x800, where the old ellipse
  // ran 37px off-screen. The ROW's own box is a different matter: once the
  // page could scroll, `a` gained a third limit measured off the wrapper's
  // height (`verticalSemiAxisLimit`, applied below) — the tilt is owner-fixed,
  // so a ring that must be shorter can only get there by being narrower. That
  // cap is height-derived ON PURPOSE; do not remove it on the strength of this
  // paragraph's first sentence.
  const updateSize = useCallback(() => {
    const width = window.innerWidth;
    const halfButton = halfButtonWidth(width);

    // What the viewport's WIDTH alone allows. Decided first because the drop
    // below is only ever spent out of what is left over after it — the ring's
    // size is never traded for its position.
    const aFromWidth = Math.min(
      maxSemiAxis(width),
      width / 2 - halfButton - EDGE_GUTTER,
    );

    const rect = ringRef.current?.getBoundingClientRect();
    // The wrapper is `h-1/2` of the hero row and centred on it, so its height IS
    // the distance from the ring's centre to the foot of the row. See
    // `verticalSemiAxisLimit` for why that, and not the viewport, is the bound.
    const halfRow = rect?.height ? rect.height : null;

    // The most the centre may move from the row's centre — either way — with
    // the ring at its full width still clearing the row's edge on the moved
    // side. The anchored drop below is clamped to ±this, so position is never
    // bought with off-screen buttons.
    const maxDrop =
      halfRow == null
        ? 0
        : Math.max(
            0,
            halfRow - (ORBIT_TILT * aFromWidth + halfButton + EDGE_GUTTER),
          );

    // Where the anchor asks the centre to BE: the laptop's measured base,
    // raised by ORBIT_RAISE of the laptop's height — converted into an offset
    // from the wrapper's own centre, which is the origin every button's
    // translate() is measured from. The stage is the box `orbitBaseY` is local
    // to; it is the wrapper's sibling inside the hero row, and neither box is
    // ever transformed, so two rects subtract cleanly. Until app/page.js has
    // measured (props null) or if the stage is not found, fall back to the old
    // row-centre-plus-64 pose so the first paint is what this replaces.
    let drop = halfRow == null ? 0 : Math.min(ORBIT_DROP_FALLBACK, maxDrop);
    if (halfRow != null && orbitBaseY != null && orbitLapH != null) {
      const stage = ringRef.current?.parentElement?.querySelector(
        ':scope > div.hero-stage',
      );
      if (stage) {
        const anchorY =
          stage.getBoundingClientRect().top +
          orbitBaseY -
          ORBIT_RAISE * orbitLapH;
        const wrapperCentreY = rect.top + halfRow / 2;
        drop = Math.max(
          -maxDrop,
          Math.min(maxDrop, anchorY - wrapperCentreY),
        );
      }
    }

    const a = Math.min(
      aFromWidth,
      verticalSemiAxisLimit(halfRow, drop, halfButton),
    );
    const b = a * ORBIT_TILT;

    // The rendered `y` past which a button's hover label would fall off the foot
    // of the page. Buttons below it flip their label above the circle instead of
    // under it (NavButton's `labelAbove`), which costs the ring nothing — the
    // alternative, reserving LABEL_DROP under every ring at every height, is
    // paid for in ring size at sizes where the label fits perfectly well.
    //
    // Recomputed here rather than per frame because it depends only on the box:
    // `y` is the button's offset from the wrapper's centre, so its label's foot
    // sits `y + halfButton + LABEL_DROP` below that centre and the room there is
    // `halfRow`. It also cannot flicker mid-hover — hovering pauses the rotation,
    // so `y` is frozen for exactly as long as a label is on screen.
    const labelFlipY =
      halfRow == null ? Infinity : halfRow - halfButton - LABEL_DROP;

    // Below 480 the ring is replaced by two fixed columns (see the render);
    // the axes above go unused there but stay correct for the crossing.
    setIsColumnLayout(width < 480);
    setAxes((prev) =>
      prev.a === a &&
      prev.b === b &&
      prev.drop === drop &&
      prev.labelFlipY === labelFlipY
        ? prev
        : { a, b, drop, labelFlipY },
    );
    // The two anchor props are primitives, so this callback — and through it
    // the effect below — re-runs exactly when a measurement in app/page.js
    // actually moved the base, and never merely because the parent rendered.
  }, [orbitBaseY, orbitLapH]);

  useEffect(() => {
    let cancelled = false;
    const onViewportChange = () => {
      if (!cancelled) updateSize();
    };

    onViewportChange();
    window.addEventListener('resize', onViewportChange);
    // The headline is set in a webfont, and a fallback face has different
    // metrics — so the hero row, and with it the ring's centre, moves once
    // when the real face lands, after this effect has already measured.
    document.fonts?.ready?.then(onViewportChange).catch(() => {});
    // The row can also change height with no window resize at all — the live
    // maintenance header grows when its data lands, the headline re-flows —
    // and the wrapper, being `h-1/2` of the row, moves with it. Watching the
    // wrapper's own box catches every one of those; watching `window.resize`
    // alone missed all of them. No loop: nothing this measurement sets can
    // change the wrapper's size — the buttons inside it are absolutely
    // positioned.
    const ro =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(onViewportChange)
        : null;
    if (ringRef.current) ro?.observe(ringRef.current);

    return () => {
      cancelled = true;
      ro?.disconnect();
      window.removeEventListener('resize', onViewportChange);
    };
    // `isColumnLayout` is a dependency for two reasons sharing one mechanism.
    // The wrapper this effect measures and observes only exists in the orbital
    // layout, and on the crossing UP out of the two-column layout the render
    // that creates it is the one the flag flip triggers — so the `resize` pass
    // that flipped it measured a null ref and fell back to the width term
    // alone. Re-running on the flip measures the box now that it is there, and
    // re-points the ResizeObserver at the CURRENT wrapper rather than the
    // detached one from before the crossing. Costs nothing when it changes
    // nothing — both setters bail on an equal value, so there is no loop.
  }, [updateSize, isColumnLayout]);

  // The render loop — ambient spin AND the chase toward user input's target.
  //
  // Skipped ENTIRELY under prefers-reduced-motion (issue #87): the ring holds
  // its resting angle and no rAF frame is ever scheduled, so there is no
  // movement and no per-frame work — user input still rotates the ring, but
  // instantly, through `glideBy`/`snapBy`'s reduced branch rather than
  // through a frame loop. This gate has to live in JS — the rotation is React
  // state written to an inline transform, so the CSS `prefers-reduced-motion`
  // block that stills the laptop and the ripple rings (globals.css) cannot
  // reach it.
  //
  // Reconciliation is "pause-while-interacting" (issue #105's recommended
  // strategy): the ambient advance is gated on nothing being engaged — no
  // button hovered/focused, no pointer resting on the laptop, no active drag
  // — AND the last input being longer than INPUT_COOLDOWN_MS ago. Because the
  // ambient spin advances the TARGET and the rendered angle chases it at
  // EASE_RATE, both the stop and the resume are eased for free: engaging
  // mid-spin lets the ring coast its last ~1° to a halt, and the resume ramps
  // from stillness back up to speed instead of snapping.
  useEffect(() => {
    if (reduceMotion) return undefined;

    let frame;
    let last = performance.now();

    const animate = (now) => {
      // Clamped so a background tab's suspended rAF cannot bank hours of
      // "elapsed" spin into one giant step on resume.
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;

      const engaged =
        hoveredRef.current || engagedRef.current || dragRef.current != null;

      // A flick in flight owns the ring: integrate it, decay it on friction,
      // and hand back when it has all but stopped — stamping the cooldown so
      // the ambient drift eases in after a beat of stillness, which is what
      // makes the settle read as the ring coming to REST rather than the
      // spin morphing into the drift. Engaging (hovering a button, resting
      // on the laptop, grabbing) stops the wheel dead: the visitor is
      // aiming, and a target that keeps moving under a poised cursor is
      // physics winning over usability.
      if (momentumRef.current !== 0) {
        if (engaged) {
          momentumRef.current = 0;
          lastInputAtRef.current = now;
        } else {
          rotationRef.current += momentumRef.current * dt;
          targetRotationRef.current = rotationRef.current;
          momentumRef.current *= Math.exp(-dt * FLICK_FRICTION);
          if (Math.abs(momentumRef.current) < FLICK_MIN_DEG_PER_SEC) {
            momentumRef.current = 0;
            lastInputAtRef.current = now;
          }
          setRotation(rotationRef.current);
        }
      }

      const settled =
        !engaged &&
        momentumRef.current === 0 &&
        now - lastInputAtRef.current > INPUT_COOLDOWN_MS;
      if (settled) targetRotationRef.current += AUTO_DEG_PER_SEC * dt;

      const diff = targetRotationRef.current - rotationRef.current;
      if (diff !== 0) {
        rotationRef.current +=
          Math.abs(diff) < 0.01 ? diff : diff * (1 - Math.exp(-dt * EASE_RATE));
        // Keep the pair near zero so a session left running for hours cannot
        // walk the angle into float territory where degrees lose precision.
        // Both move together, so the on-screen pose is untouched (cos/sin are
        // 360-periodic) and the remaining chase distance is preserved.
        if (Math.abs(rotationRef.current) > 720) {
          const wrap = Math.trunc(rotationRef.current / 360) * 360;
          rotationRef.current -= wrap;
          targetRotationRef.current -= wrap;
        }
        setRotation(rotationRef.current);
      }

      frame = requestAnimationFrame(animate);
    };

    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [reduceMotion]);

  // ── User input → rotation (issue #105) ────────────────────────────────────
  // One native listener set on `.hero-row` — the common ancestor of the ring
  // wrapper AND the laptop (they are siblings, so a listener on the wrapper
  // alone would never hear a wheel spun over the art). Native, not JSX:
  // `wheel`/`touchmove` must be registered non-passive to preventDefault, and
  // React's root-delegated listeners are passive for both.
  useEffect(() => {
    if (isColumnLayout) return undefined;
    const ringEl = ringRef.current;
    const rowEl = ringEl?.closest('.hero-row');
    if (!rowEl) return undefined;
    const lapEl = laptopRef?.current ?? null;

    const insideBand = (x, y, g) => {
      const nx = (x - g.cx) / g.aEff;
      const ny = (y - g.cy) / g.bEff;
      return nx * nx + ny * ny <= 1;
    };
    const overLaptop = (x, y) => (lapEl ? withinRect(lapEl, x, y) : false);
    // The pointer's PARAMETRIC angle on the ellipse — atan2 of the
    // normalized coordinates, so it matches the `t` in (a·cos t, b·sin t)
    // that places every button. Rotation and this angle share an origin and
    // orientation, so a grab at angle θ dragged to θ' owes the ring exactly
    // (θ' − θ): the grabbed point stays under the finger.
    const paramAngleDeg = (x, y, g) =>
      (Math.atan2((y - g.cy) / g.bEff, (x - g.cx) / g.aEff) * 180) / Math.PI;

    const onWheel = (e) => {
      // Trackpad pinch-to-zoom arrives as a wheel event with ctrlKey=true
      // (and ctrl+wheel is the keyboard zoom shortcut) — that gesture belongs
      // to the browser's page zoom, never to the ring.
      if (e.ctrlKey) return;
      const g = orbitGeometry();
      if (!g) return;
      // Only inside the ring band or over the laptop — outside, the page
      // scrolls exactly as before (the acceptance criterion is scoped
      // preventDefault, not a scroll-dead hero).
      if (!insideBand(e.clientX, e.clientY, g) && !overLaptop(e.clientX, e.clientY))
        return;
      e.preventDefault();
      // Dominant axis: a trackpad's two-finger HORIZONTAL swipe is the most
      // literal "spin the ring" gesture there is, and it arrives as deltaX.
      let d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (e.deltaMode === 1) d *= 16; // lines → px (Firefox mouse wheel)
      else if (e.deltaMode === 2) d *= window.innerHeight; // pages → px
      glideBy(clampStep(d * WHEEL_DEG_PER_PX, WHEEL_MAX_STEP_DEG));
    };

    const onPointerDown = (e) => {
      // A press on a nav button is a CLICK-in-progress, never a drag start —
      // the button's own link (and the Ember Passage behind it) owns it.
      if (e.target.closest('a')) return;
      if (e.button != null && e.button !== 0) return;
      const g = orbitGeometry();
      if (!g) return;
      const onLap = overLaptop(e.clientX, e.clientY);
      if (!onLap && !insideBand(e.clientX, e.clientY, g)) return;
      // Two drag dialects, chosen by where the grab lands: the ring band is
      // angular (the grabbed point follows the finger around the ellipse);
      // the laptop is a vertical scrubber — the same mapping its hover-scrub
      // uses, so a touch-only iPad gets the identical instrument by dragging
      // that a trackpad iPad gets by hovering. Angular math near the centre
      // is untouchable anyway (see DRAG_DEAD_RADIUS).
      // Beyond the geometry, every drag carries its own flick state: `vel`
      // is an EMA of the applied deg/s (what launches the momentum on a
      // moving release), `lastMoveT` dates the newest sample (a stale one
      // means the hand stopped — no flick), and `slot` is the 45° detent the
      // ring last occupied, for the touch haptic tick.
      const common = {
        id: e.pointerId,
        touch: e.pointerType === 'touch',
        vel: 0,
        lastMoveT: e.timeStamp,
        slot: Math.round(rotationRef.current / angleIncrement),
      };
      dragRef.current = onLap
        ? { ...common, mode: 'linear', lastY: e.clientY }
        : {
            ...common,
            mode: 'angular',
            lastAngle: paramAngleDeg(e.clientX, e.clientY, g),
            g,
          };
      markInput();
      // Capture so a drag that wanders off the row keeps steering the ring
      // until release. preventDefault kills the two mouse-drag defaults that
      // fight a grab: text selection and native image drag.
      try {
        rowEl.setPointerCapture(e.pointerId);
      } catch {
        /* capture is best-effort — the drag still works without it */
      }
      e.preventDefault();
    };

    // One applied drag delta: rotate, sample the flick velocity, and tick
    // the touch detent. Kept out of the per-mode branches because all three
    // concerns are identical whichever dialect produced the delta.
    const applyDragDelta = (drag, deltaDeg, timeStamp) => {
      if (deltaDeg !== 0) snapBy(deltaDeg);
      // EMA at 0.7 toward the newest sample: enough memory to smooth event
      // jitter, recent enough that the launch speed is the hand's speed at
      // RELEASE, not an average of the whole gesture.
      const dtMs = timeStamp - drag.lastMoveT;
      if (dtMs > 1) {
        drag.vel = 0.7 * ((deltaDeg * 1000) / dtMs) + 0.3 * drag.vel;
        drag.lastMoveT = timeStamp;
      }
      // Haptic detent — touch only (a mouse hand feels the wheel through
      // the motion itself), one tick per 45° slot boundary crossed.
      if (drag.touch) {
        const slot = Math.round(rotationRef.current / angleIncrement);
        if (slot !== drag.slot) {
          drag.slot = slot;
          try {
            navigator.vibrate?.(HAPTIC_TICK_MS);
          } catch {
            /* vibration is a bonus, never a requirement */
          }
        }
      }
    };

    const onPointerMove = (e) => {
      const drag = dragRef.current;
      if (drag && drag.id === e.pointerId) {
        if (drag.mode === 'linear') {
          const dy = e.clientY - drag.lastY;
          drag.lastY = e.clientY;
          applyDragDelta(
            drag,
            clampStep(dy * SCRUB_DEG_PER_PX, DRAG_MAX_STEP_DEG),
            e.timeStamp,
          );
        } else {
          // Geometry cached from the grab: the wrapper cannot move mid-drag
          // (page scroll is prevented for the gesture's duration below).
          const g = drag.g;
          const nx = (e.clientX - g.cx) / g.aEff;
          const ny = (e.clientY - g.cy) / g.bEff;
          if (nx * nx + ny * ny < DRAG_DEAD_RADIUS * DRAG_DEAD_RADIUS) return;
          const angle = (Math.atan2(ny, nx) * 180) / Math.PI;
          let d = angle - drag.lastAngle;
          if (d > 180) d -= 360;
          else if (d < -180) d += 360;
          drag.lastAngle = angle;
          applyDragDelta(drag, clampStep(d, DRAG_MAX_STEP_DEG), e.timeStamp);
        }
        return;
      }

      // The laptop hover-scrub: with no button held, vertical pointer travel
      // over the art drives the ring — down spins it the way the wheel does,
      // up spins it back. Hover-capable pointers only (`canHover`): a phone
      // or bare iPad never hovers, so there the gesture simply does not
      // exist, and attaching a trackpad flips it on live via the media query.
      if (!canHover || !lapEl || e.pointerType === 'touch' || e.buttons !== 0)
        return;
      if (e.target.closest('a')) {
        // Aiming at a button that overlaps the art: freeze the scrub (the
        // user is clicking, not steering) but keep its anchor current so
        // leaving the button cannot replay the skipped travel as a jump.
        if (scrubYRef.current != null) scrubYRef.current = e.clientY;
        return;
      }
      if (overLaptop(e.clientX, e.clientY)) {
        if (scrubYRef.current == null) {
          // Engage: anchor the scrub and hard-pause the ambient spin for as
          // long as the pointer rests here — a resting hover is engagement,
          // which a last-input timestamp alone cannot say.
          scrubYRef.current = e.clientY;
          engagedRef.current = true;
          markInput();
        } else {
          const dy = e.clientY - scrubYRef.current;
          scrubYRef.current = e.clientY;
          if (dy !== 0)
            snapBy(clampStep(dy * SCRUB_DEG_PER_PX, DRAG_MAX_STEP_DEG));
        }
      } else if (scrubYRef.current != null) {
        scrubYRef.current = null;
        engagedRef.current = false;
        lastInputAtRef.current = performance.now(); // cooldown, then resume
      }
    };

    const endDrag = (e) => {
      const drag = dragRef.current;
      if (!drag || drag.id !== e.pointerId) return;
      dragRef.current = null;
      lastInputAtRef.current = performance.now();
      // A MOVING release becomes a flick: the ring keeps the hand's speed
      // and coasts on friction (see FLICK_* above). Only on a real release —
      // a pointercancel is the browser taking the pointer away, not a throw
      // — only while the hand was still moving at the moment of release, and
      // never under reduced motion, where a free-spinning ring is exactly
      // the kind of self-propelled movement the preference asks to not have.
      if (
        e.type === 'pointerup' &&
        !reduceMotion &&
        e.timeStamp - drag.lastMoveT < FLICK_STALE_MS
      ) {
        momentumRef.current = clampStep(drag.vel, FLICK_MAX_DEG_PER_SEC);
      }
      try {
        rowEl.releasePointerCapture(e.pointerId);
      } catch {
        /* already released */
      }
    };

    const onRowLeave = () => {
      // The pointer left the hero entirely — no further moves will fire, so
      // retire the scrub here or `engagedRef` would pause the spin forever.
      if (scrubYRef.current != null) {
        scrubYRef.current = null;
        engagedRef.current = false;
        lastInputAtRef.current = performance.now();
      }
    };

    // Touch scrolling and a touch drag race for the same gesture: without
    // this, the browser can commit to scrolling mid-drag and cancel the
    // pointer stream. Prevented ONLY while a drag is live — a swipe that
    // starts outside the ring band still pans the page untouched.
    const onTouchMove = (e) => {
      if (dragRef.current) e.preventDefault();
    };

    rowEl.addEventListener('wheel', onWheel, { passive: false });
    rowEl.addEventListener('touchmove', onTouchMove, { passive: false });
    rowEl.addEventListener('pointerdown', onPointerDown);
    rowEl.addEventListener('pointermove', onPointerMove);
    rowEl.addEventListener('pointerup', endDrag);
    rowEl.addEventListener('pointercancel', endDrag);
    rowEl.addEventListener('pointerleave', onRowLeave);
    return () => {
      rowEl.removeEventListener('wheel', onWheel);
      rowEl.removeEventListener('touchmove', onTouchMove);
      rowEl.removeEventListener('pointerdown', onPointerDown);
      rowEl.removeEventListener('pointermove', onPointerMove);
      rowEl.removeEventListener('pointerup', endDrag);
      rowEl.removeEventListener('pointercancel', endDrag);
      rowEl.removeEventListener('pointerleave', onRowLeave);
      // Interaction state must not outlive its listeners (layout crossing,
      // unmount): a drag cut mid-gesture would otherwise pin the spin gate,
      // and a flick launched by a dying handler set would coast ownerless.
      dragRef.current = null;
      scrubYRef.current = null;
      engagedRef.current = false;
      momentumRef.current = 0;
    };
  }, [
    isColumnLayout,
    canHover,
    reduceMotion,
    angleIncrement,
    laptopRef,
    orbitGeometry,
    glideBy,
    snapBy,
    markInput,
  ]);

  // Keyboard: ← / → from any focused button turns the ring one whole button
  // slot — `angleIncrement`, so each press is exactly "next button arrives
  // where this one was". Focus rides the moved button (it is the same DOM
  // element; only its translate changes), the focused label stays up via the
  // existing focus→hovered pause, and Enter still activates the link.
  // Attached to the wrapper, so it hears every button's keydown by bubbling
  // and exists only in the orbital layout. preventDefault stops the arrows
  // ALSO panning a scrollable page under the ring.
  const onRingKeyDown = (e) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      glideBy(angleIncrement);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      glideBy(-angleIncrement);
    }
  };

  // Stagger button reveal
  useEffect(() => {
    const width = window.innerWidth;
    if (width < 480) {
      // xs-mobile: reveal left + right button simultaneously, one pair at a time
      for (let pair = 0; pair < 4; pair++) {
        setTimeout(() => {
          setVisibleButtons((prev) => [
            ...prev,
            BtnList[pair].label,      // left column (0–3)
            BtnList[pair + 4].label,  // right column (4–7)
          ]);
        }, 400 + pair * 550);
      }
    } else {
      BtnList.forEach((btn, i) => {
        setTimeout(() => {
          setVisibleButtons((prev) => [...prev, btn.label]);
        }, i * 300);
      });
    }
  }, []);

  // xs-mobile: fixed two-column layout
  if (isColumnLayout) {
    const leftBtns = BtnList.slice(0, 4);
    const rightBtns = BtnList.slice(4, 8);
    return (
      <>
        {/* Left column: About, Projects, Qualifications, Contact.
            `absolute` (not `fixed`) so the column centers vertically on
            the laptop's parent flex line rather than on the viewport —
            keeps the icons aligned with the laptop regardless of where
            the header/headline push the laptop on different screens. */}
        <div
          className="absolute left-2.5 top-[calc(50%_-_2vh)] -translate-y-1/2 z-50 flex flex-col space-y-4"
          // A tap on any column button is the discovery the first-visit tip
          // describes at this width ("tap a side button"), so it counts as
          // the interaction that dismisses it — capture phase, so the signal
          // fires even though the tap then navigates away.
          onPointerDownCapture={onUserInteract}
        >
          {/* Always render all 4 buttons so the column reserves its full
              height from t=0. The reveal is done via the `visible` prop,
              which only animates opacity/scale (transforms don't affect
              layout), so earlier pairs don't get pushed around as later
              pairs appear. */}
          {leftBtns.map((btn, idx) => (
            <NavButton
              key={btn.label}
              x={0}
              y={0}
              {...btn}
              setHovered={setHovered}
              hovered={hovered}
              isMobileColumn
              index={idx}
              visible={visibleButtons.includes(btn.label)}
            />
          ))}
        </div>
        {/* Right column: GitHub, My Past, LinkedIn, Resume.
            Mirrors the left column (also `absolute` so it tracks the
            laptop's vertical center, not the viewport's). */}
        <div
          className="absolute right-2.5 top-[calc(50%_-_2vh)] -translate-y-1/2 z-50 flex flex-col space-y-4"
          // Same discovery signal as the left column.
          onPointerDownCapture={onUserInteract}
        >
          {/* Same always-render pattern as the left column. */}
          {rightBtns.map((btn, idx) => (
            <NavButton
              key={btn.label}
              x={0}
              y={0}
              {...btn}
              setHovered={setHovered}
              hovered={hovered}
              isMobileColumn
              // Use the pair index (0-3), not the absolute button index
              // (4-7), so each right-side button gets the same framer-motion
              // delay as its left-side partner — they appear truly together
              // instead of the right one trailing by ~320ms.
              index={idx}
              visible={visibleButtons.includes(btn.label)}
            />
          ))}
        </div>
      </>
    );
  }

  // Orbital layout for 480px and above
  return (
    // NO z-index on this wrapper, deliberately. `position` + a `z-index` makes
    // an element its own stacking context, and a stacking context flattens
    // everything inside it to ONE depth against the rest of the page: with
    // `z-30` here the whole ring painted over the laptop (`z-20`, app/page.js)
    // no matter what each button asked for, and with the `z-0` before that it
    // painted under the laptop the whole way round. Neither is an orbit —
    // an orbit needs the ring to be ABLE to pass on both sides of the art.
    //
    // Left at `z-index: auto` the wrapper is transparent to stacking, so each
    // button's own z-index competes directly with the laptop's inside the hero
    // row (`relative z-10`), which is the real stacking context here. That row
    // is a SIBLING of the live maintenance header (`z-50`) under <main>, so the
    // header still paints over the ring whatever the buttons ask for.
    <div
      ref={ringRef}
      onKeyDown={onRingKeyDown}
      className="absolute flex h-1/2 w-full items-center justify-center mx-auto"
    >
      <div className="relative flex w-max items-center justify-center mx-auto">
        {BtnList.map((btn, index) => {
          const angleDeg = index * angleIncrement + rotation;
          const angleRad = (angleDeg * Math.PI) / 180;

          const x = axes.a * Math.cos(angleRad);
          // The orbit's own y, before the ring is dropped toward the ground
          // plane. Kept separate from the rendered y BECAUSE THE DEPTH TEST
          // BELOW READS IT: `yOrbit` is symmetric about 0, so its sign is
          // exactly "far half / near half". Adding the drop first would bias
          // that sign and, at drop > b, park every button on the near side —
          // the ring would stop passing behind the laptop at all.
          const yOrbit = axes.b * Math.sin(angleRad);
          const y = yOrbit + axes.drop;

          if (!visibleButtons.includes(btn.label)) return null;

          // Which side of the laptop this button is currently on. Screen y
          // grows downward, so the top of the ellipse (y < 0) is the half of
          // the ring that runs AWAY from the viewer, behind the laptop, and
          // the bottom half is the near side that passes in front of it.
          //
          // 10 and 40 straddle the laptop's z-20. They are also both above the
          // ripple rings (z-index: auto) and the contact shadow (z-10, earlier
          // in the DOM), so the ring never falls behind the ground effects —
          // only behind the laptop itself, and only for the half of each lap
          // it spends back there. At the ellipse's left/right turnaround the
          // same rule sorts the two buttons meeting there against each other:
          // the one arriving on the near side passes over the one leaving on
          // the far side, which is what the depth cue is doing anyway.
          const zIndex = yOrbit < 0 ? 10 : 40;

          return (
            <NavButton
              setHovered={setHovered}
              hovered={hovered}
              key={btn.label}
              x={x}
              y={y}
              zIndex={zIndex}
              index={index}
              // The rendered `y`, not `yOrbit`: the label hangs off the button
              // where it is actually drawn, so the drop counts here even though
              // the depth test above deliberately ignores it.
              labelAbove={y > axes.labelFlipY}
              {...btn}
            />
          );
        })}
      </div>
    </div>
  );
};

export default Navigation;
