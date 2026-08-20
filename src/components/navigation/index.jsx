'use client';

import { BtnList } from '@/app/data';
import NavButton from './NavButton';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';

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

const Navigation = ({ setHovered, hovered, orbitBaseY, orbitLapH }) => {
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

  // Infinite rotation loop — the orbital ring's perpetual spin.
  //
  // Skipped ENTIRELY under prefers-reduced-motion (issue #87): the ring holds
  // its resting angle and no rAF frame is ever scheduled, so there is no
  // movement and no per-frame work. This gate has to live in JS — the rotation
  // is React state written to an inline transform, so the CSS
  // `prefers-reduced-motion` block that stills the laptop and the ripple rings
  // (globals.css) cannot reach it.
  useEffect(() => {
    if (reduceMotion) return undefined;

    let frame;

    const animate = () => {
      if (!hovered) {
        setRotation((prev) => (prev + 0.15) % 360);
      }
      frame = requestAnimationFrame(animate);
    };

    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [hovered, reduceMotion]);

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
        <div className="absolute left-2.5 top-[calc(50%_-_2vh)] -translate-y-1/2 z-50 flex flex-col space-y-4">
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
        <div className="absolute right-2.5 top-[calc(50%_-_2vh)] -translate-y-1/2 z-50 flex flex-col space-y-4">
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
