'use client';
import Image from 'next/image';
import bg from '../../public/background/home-hero.webp';
import laptop from '../../public/background/laptop.png';
import Navigation from '@/components/navigation';
import LiveMaintenanceHeader from '@/components/home/LiveMaintenanceHeader';
import HomeSceneWater from '@/components/home/HomeSceneWater';
import HomeSceneGlow from '@/components/home/HomeSceneGlow';
import HomeRoleLatent from '@/components/home/HomeRoleLatent';
import { useCallback, useEffect, useRef, useState } from 'react';

// Where the laptop's BASE sits inside its own image box, as a fraction of that
// box. Measured off laptop.png's alpha channel rather than guessed: the art
// runs edge to edge (no transparent padding, last solid row 545 of 548), and
// the silhouette below the widest row is the deck's ground footprint in
// perspective — widest row y=432 spanning x 68-783, narrowing to the front
// corner at (349, 545). Area-weighted, that footprint centres on (0.52, 0.85).
//
// Neither number is 0.5, and that is the point: the laptop is drawn turned, so
// its base is offset from the middle of its own bounding box. Centring the
// rings on the box — which is what `mt-16` on a centred absolute child did —
// centres them on the BOX, not on the laptop, and the error grows with the art.
const LAPTOP_BASE_X = 0.52;
const LAPTOP_BASE_Y = 0.85;

// ── How far the outermost ripple ring reaches BELOW the laptop's base ───────
// Not half its height. The rings are drawn on the ground plane
// (`perspective(600px) rotateX(80deg)`, below) and the ripple animates
// `scale(0)` -> `scale(1.2)`, so the near edge of the ring swings toward the
// viewer as it grows and the perspective divide MAGNIFIES it: a 600px ring
// reaches 152.8px below its centre, not the 52.1px that `300 * cos(80deg)`
// would suggest, and the relationship is not even linear in the ring's size —
// the divisor moves with it.
//
// Solved rather than sampled, because a rect read from the DOM catches whatever
// phase the 3s ripple happens to be in. Local point (0, y, 0) with
// y = (box / 2) * scale goes through rotateX to (y*cos, y*sin) in (screen-y,
// depth), and the perspective divide puts it at y*cos / (1 - y*sin / 600).
// Checked against the live DOM at five viewports and every ring size the cap
// ramp produces (263 to 600px): predicted within 1.6px of measured, worst case.
const RIPPLE_TILT = (80 * Math.PI) / 180;
const RIPPLE_PERSPECTIVE = 600;
const RIPPLE_MAX_SCALE = 1.2;

// Clear air kept between the outermost ring's lowest point and the foot of the
// hero, so the circle closes visibly rather than grazing the edge. Matches the
// orbit's own `EDGE_GUTTER` (navigation/index.jsx) — same idea, same number.
const RIPPLE_GUTTER = 16;

const rippleBottomExtent = (boxHeight) => {
  const y = (boxHeight / 2) * RIPPLE_MAX_SCALE;
  const divisor = 1 - (y * Math.sin(RIPPLE_TILT)) / RIPPLE_PERSPECTIVE;
  // At y*sin >= the perspective distance the point is level with the viewer's
  // eye and the projection diverges. Unreachable at every ring size this page
  // produces (600px ring -> 0.41), but a ring that ever grew past ~1200px would
  // otherwise return a negative or absurd number.
  return divisor < 0.1 ? Infinity : (y * Math.cos(RIPPLE_TILT)) / divisor;
};

// The same relation read the other way: the largest ring BOX whose lowest point
// lands `extent` below the base. Inverting it matters — it is not a division.
// Rearranged from the above with `c = RIPPLE_MAX_SCALE / 2`:
//   extent = c*box*cos / (1 - c*box*sin/P)  ->  box = extent / (c*(cos + extent*sin/P))
// The divisor grows with `extent`, which is the whole point: halving the room
// available does NOT halve the ring that fits in it, it takes about 40% off.
const rippleBoxForExtent = (extent) => {
  const c = RIPPLE_MAX_SCALE / 2;
  const denom =
    c * (Math.cos(RIPPLE_TILT) + (extent * Math.sin(RIPPLE_TILT)) / RIPPLE_PERSPECTIVE);
  return denom <= 0 ? 0 : extent / denom;
};

export default function Home() {
  const [hovered, setHovered] = useState(false);

  // The laptop's base, in px inside the stage — published as two custom
  // properties that the ripple rings and the contact shadow position from.
  //
  // Measured rather than expressed in CSS because the laptop's box moves for
  // reasons CSS cannot hand to a sibling: its width comes off a four-rung
  // ladder, its height off a `max-height` bound, and `safe center` on the stage
  // switches it between centred and top-aligned depending on whether it fits.
  // Percentages of the STAGE therefore do not track it, which is exactly the
  // defect here — the rings were pinned to the stage's centre plus a flat 64px.
  //
  // `offsetLeft/Top/Width/Height`, NOT `getBoundingClientRect`: the laptop
  // carries a permanent float animation (`translateY` + `scale(1.02)`), and a
  // rect would fold that in and make the rings breathe with it. The offset
  // properties report untransformed layout, so the rings stay put while the
  // laptop bobs above them — which is the whole point of a contact shadow.
  const laptopRef = useRef(null);
  const mainRef = useRef(null);
  const stageRef = useRef(null);
  const outerRingRef = useRef(null);
  const [base, setBase] = useState(null);
  // Uniform factor on the three ground rings — 1 wherever they already finish
  // inside the hero, less where they would otherwise cross its foot. See the
  // note in measureBase.
  const [ringFit, setRingFit] = useState(1);

  const measureBase = useCallback(() => {
    const el = laptopRef.current;
    if (!el || !el.offsetWidth) return;
    const x = el.offsetLeft + el.offsetWidth * LAPTOP_BASE_X;
    const y = el.offsetTop + el.offsetHeight * LAPTOP_BASE_Y;
    // The laptop's rendered size rides along with the base because the same
    // consumers need both: the contact shadow is a fixed RATIO of the laptop
    // (0.875 of its width — see `.laptop-contact` in globals.css), and the
    // orbit anchors 15% of the laptop's HEIGHT above the base (ORBIT_RAISE,
    // navigation/index.jsx). Neither ratio can be expressed in CSS alone,
    // because the rendered size is `min(width ladder, height cap)` and only
    // the layout engine knows which side won.
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    setBase((prev) =>
      prev && prev.x === x && prev.y === y && prev.w === w && prev.h === h
        ? prev
        : { x, y, w, h },
    );

    // ── The ground rings close inside the hero, at every viewport ──────────
    // The orbit was taught to stay on the page; the GROUND RINGS never were,
    // and they reach further down than anything else in the hero. Measured on
    // a 13" MacBook Pro (1440x790, Chrome full screen) the outermost ring ran
    // 80px past the foot of the page — a hard horizontal edge cut across a
    // circle — with the middle ring 14px past it, while the nav buttons cleared
    // it by 16. Nothing here could have caught it: the ring is decorative, so
    // it was outside the orbit's own fit arithmetic, and the vertical-fit cap
    // block that would have shrunk it only switches on at 740px of height,
    // below where this happens.
    //
    // THE RINGS SHRINK TO FIT. They are not allowed to leave the visible hero,
    // full stop — a ripple whose lower arc runs under the bottom edge reads as
    // a broken circle, and lengthening the PAGE does not fix that: it makes the
    // missing arc reachable by scrolling while the first view, the one anybody
    // actually looks at, is cut exactly as before. That was tried and it was
    // the wrong answer.
    //
    // How much they have to give up is far less than it first appears, and the
    // reason is worth stating because getting it wrong is what produced the
    // page-lengthening attempt: the ring's reach is NOT proportional to its
    // size. Dividing the available room by the 600px ring's own ratio
    // (152.8 / 600 = 0.255) says a 74px gap fits a 290px ring; solving
    // `rippleBottomExtent` for the box instead says 418px, because the
    // perspective divisor relaxes as the ring gets smaller. Treating that
    // curve as a straight line under-rates the achievable ring by ~30% and
    // makes shrinking look ruinous when it is barely noticeable.
    //
    // The factor multiplies the ring's BOX (`--ring-size` in globals.css), not
    // its painted result, and the difference is worth 22 points of ring: fitting
    // by box needs 60% at 1440x790, fitting by painted size needs 38% for the
    // same clearance, because shrinking the box relaxes the perspective divisor
    // and scaling the finished image does not. One factor for all three so they
    // keep their spacing — capping each against the same room would pull the
    // outer two onto one circle, and they ripple in phase, so three rings would
    // read as two.
    const main = mainRef.current;
    const stage = stageRef.current;
    const ring = outerRingRef.current;
    if (!main || !stage || !ring) return;

    // The base, in <main>'s coordinates. Walked with `offsetTop` for the same
    // reason the base itself is measured that way: a rect would fold in the
    // laptop's permanent float animation and make the ring breathe with it.
    let baseFromMainTop = y;
    for (let node = stage; node && node !== main; node = node.offsetParent) {
      baseFromMainTop += node.offsetTop;
    }

    // Measured against <main>, NOT the viewport. The two are the same thing at
    // every height that fits on one screen; below `--hero-min` the hero is
    // deliberately taller than the screen and scrolls, and there the ring
    // should fill the hero it was laid out for rather than collapse to fit a
    // fold the rest of the composition already ignores.
    const room = main.offsetHeight - baseFromMainTop - RIPPLE_GUTTER;

    // The ring's UNFITTED size, read from the ladder rather than from the
    // element's own box — `offsetHeight` is the box after this factor has been
    // applied, so measuring that would feed the output back into the input and
    // let the rings walk themselves down on every re-measure. `--ring-size` is
    // a pure CSS input and cannot.
    //
    // It must be the LADDER value specifically, not the smaller of the ladder
    // and the short-viewport `max-height` cap, even though the cap is what
    // renders when it binds. The factor multiplies the ladder — CSS computes
    // `--ring-size * --ring-fit` and only then clamps — so dividing by the
    // capped value hands back a factor that resolves to MORE than the room
    // allows. Measured with that mistake in: 1-6px of clearance instead of 16
    // at 900x700, 768x700, 1024x640 and 844x390, every one of them a viewport
    // where the cap block is active. Dividing by the ladder makes the rendered
    // box `min(allowed, cap)`, which is never more than allowed.
    const ladder = parseFloat(
      window.getComputedStyle(ring).getPropertyValue('--ring-size'),
    );
    if (!Number.isFinite(ladder) || ladder <= 0) return;

    const fit = Math.min(1, rippleBoxForExtent(Math.max(0, room)) / ladder);
    // Rounded so a sub-pixel re-measure cannot churn the DOM, floored so a
    // pathological box can never invert or vanish the rings. The floor is a
    // guard, not a tuning knob — swept across every viewport this page renders,
    // the binding value never comes near it.
    const next = Math.max(0.2, Math.round(fit * 1000) / 1000);
    setRingFit((prev) => (prev === next ? prev : next));
  }, []);

  useEffect(() => {
    const el = laptopRef.current;
    if (!el) return undefined;

    // The `document.fonts.ready` subscription below outlives this effect: the
    // observer and the resize listener are torn down in the cleanup, but a
    // promise cannot be unsubscribed, and on a client-side navigation it can
    // resolve after this route has unmounted and write base state into a dead
    // tree. Same flag, same reason as the orbit's (navigation/index.jsx); all
    // three signals route through it so they age the same way.
    let cancelled = false;
    const onMeasure = () => {
      if (!cancelled) measureBase();
    };

    onMeasure();

    // A ResizeObserver on the laptop catches every way its own box can change —
    // viewport resize, the `max-height` bound tightening — without this
    // component needing to know which of those happened.
    //
    // THE STAGE IS OBSERVED TOO, and it is not redundant. The ring fit depends
    // on where the base SITS, not just how big the laptop is, and those come
    // apart: at any height where the laptop is width-bound (anything above the
    // cap block's 740px, so most laptops) the headline re-flowing when the
    // webfont lands, or the live maintenance header changing height when its
    // data arrives, moves everything below it while the laptop's own box does
    // not change by a pixel. The observer never fired, so the fit kept a value
    // measured against the old position. Caught on a COLD LOAD — no resize
    // anywhere — where 1440x813 settled at 0.739 against the 0.686 a re-measure
    // gives, and 900x700 at 0.862 against 0.834: the ring still closed, but on
    // 6px of clearance instead of 16. The stage is `height: 100%` of the hero
    // row, so anything that changes the room above it changes its height and
    // this fires. No loop: the rings are absolutely positioned, so the fit
    // cannot change the box being observed.
    const ro =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(onMeasure)
        : null;
    ro?.observe(el);
    if (stageRef.current) ro?.observe(stageRef.current);
    window.addEventListener('resize', onMeasure);
    // Belt and braces for the webfont, matching what the orbit does for the
    // same reason (navigation/index.jsx): a fallback face has different metrics,
    // so the headline — and with it the base — moves once, after this effect has
    // already measured.
    document.fonts?.ready?.then(onMeasure).catch(() => {});

    return () => {
      cancelled = true;
      ro?.disconnect();
      window.removeEventListener('resize', onMeasure);
    };
  }, [measureBase]);

  return (
    // `home-shell` carries almost no styling of its own — it exists so the
    // portrait-phone block in globals.css can swap `min-h-screen` (100vh, which
    // on iOS is the toolbar-HIDDEN height) for 100svh. Nothing above that
    // breakpoint matches it.
    //
    // THREE UTILITIES CHANGED HERE, and all three are the same fix: the hero is
    // allowed to be TALLER than the viewport when it genuinely cannot fit, and
    // the page scrolls to the rest instead of the rest being destroyed.
    //
    //   `h-screen` is gone with no utility replacing it: the shell's height is
    //   `min-height: var(--hero-h)` in globals.css now, next to every other size
    //   derived from it, for the same reason the type ladders moved there — one
    //   number, one place. A fixed `height` is what made the fold a guillotine:
    //   the shell was exactly 100vh whatever its contents needed, so the
    //   vertical-fit block had to shrink the whole hero to fit or lose it. As a
    //   MINIMUM it still fills the screen at every viewport that fits, and grows
    //   past it when `.hero-row`'s `min-height` (the orbit's guaranteed room)
    //   asks for more.
    //
    //   `overflow-hidden` -> `overflow-clip`. Same clipping, but `hidden` makes
    //   this element a SCROLL CONTAINER and `clip` does not. That matters now
    //   that the box can be taller than the screen: a scroll container would
    //   swallow the overflow into a nested scroller of its own — the ring would
    //   be reachable only by scrolling INSIDE the hero, with no scrollbar to say
    //   so — where clip leaves the growth on the document, which is what
    //   actually scrolls. The clip itself is still needed on both axes, and
    //   deliberately: the decoration overhangs this box in every direction (the
    //   backdrop is object-cover'd to ~178vh wide and carries `scale(1.045)`,
    //   the ripple rings spread past the hero row) and none of it should be able
    //   to lengthen the page. Only in-flow content may do that — measured, the
    //   overscan alone added 20-25px of phantom scroll at EVERY height when this
    //   was `overflow-x-clip` and the vertical axis was left visible.
    //
    //   `w-screen` -> `w-full`. `100vw` INCLUDES the scrollbar gutter, and this
    //   page can now have one; the shell would be ~15px wider than the visible
    //   area and its centred hero would sit half that off-centre. `100%` of
    //   <body> is the real content width. Identical wherever no scrollbar
    //   exists, which is everywhere the page fits.
    //
    // `flex flex-col` is here so <main> can do both halves of that job — see
    // its own note below.
    <div className="home-shell relative flex w-full flex-col overflow-clip">
      {/* The causeway scene itself: instant paint, and the permanent fallback
          under reduced motion. `alt=""` marks it decorative so screen readers
          skip it instead of announcing "background, image".

          NOT 100vw: this image is object-cover'd, so on any viewport NARROWER
          than its 16:9 (portrait phones, both iPad orientations) it paints
          height-bound at ~178vh CSS px wide with the sides cropped. 100vw made
          the browser pick a srcset entry sized to the viewport and then stretch
          it into that wider paint box. max() describes the real painted width
          in both regimes; engines too old to parse math in `sizes` fall back to
          100vw — the old behaviour, never worse. Same fix the projects and
          qualifications backdrops carry.

          The portrait-phone entry is where this page DIVERGES from those two.
          Their backdrops are 100lvh boxes, so 178vh IS their painted width.
          This one is not: the portrait block at the end of globals.css turns
          the plate into a 65% band of a 100svh shell, so the paint box is
          65svh tall and its cover'd width is 65 × 16/9 = 115.6svh. 178vh
          describes the box this plate had BEFORE the band existed — measured,
          1701 declared against 1104 actually painted at 440×956, and 1699
          against 1001 on a phone whose small viewport is 866. The srcset is
          bought against the DECLARED number, so that gap is paid in bytes, and
          the rungs are far enough apart that it is a whole rung's worth. Cold-
          loaded and measured: a 1× 440×956 portrait viewport took w=1920
          (190 KB) for a band w=1200 (86 KB) covers, 430×932 took 1920 where
          1080 covers, 360×640 took 1200 where 750 does. Derived on the same
          rule (smallest rung ≥ sizes × DPR, verified against the live picks at
          1×, 2× and 3×): a 2× phone of that height — XR/SE class, small
          viewport ≤ 886 — took the top rung, which the optimiser serves capped
          at the 2560px source (307 KB), where 1001 × 2 fits w=2048 (206 KB).
          A 3× phone still lands on the top rung, but honestly now: 1001 × 3 =
          3003 device px, and the only rung above 2048 is the source itself, so
          that one is unchanged rather than improved.

          `svh`, not `vh`, because the band is a percentage of `.home-shell`,
          which that same block pins to 100svh — `vh` is the toolbar-hidden
          height and would over-declare by the toolbar again (~10%). Engines
          that don't parse svh inside `sizes` drop the entry and fall through to
          the desktop rule, which is the old behaviour once more. The max() is
          belt-and-braces: portrait means height ≥ width, so 1.156 × svh can
          never fall under 100vw. Neither number carries the 1.045 overscan,
          matching /projects, which has the same scale and ignores it too.

          No `blur-[0.2px]` and no `quality={100}` any more. Both were crutches
          for the old 1536x1024 murk plate: the blur hid its upscale, and the
          quality bump fought the resulting softness. The source is native
          2560x1440 now, so softening it away would defeat the point — and
          dropping the quality override lets Next ship a smaller LCP image. */}
      <Image
        priority
        sizes="(max-width: 639.98px) and (orientation: portrait) max(100vw, 115.6svh), max(100vw, 178vh)"
        src={bg}
        alt=""
        className="home-backdrop -z-50 object-cover object-center opacity-90"
      />

      {/* The lake, moving — the one thing still giving the photograph away, and
          the one thing flame flicker cannot fix. Picks a tier: a water-only
          ambient loop (the clip masked into this exact plate, so the causeway
          measures 0.00 frame-to-frame while the water runs at 5.6–6.2), or the
          procedural shear on Save-Data/low-power, or nothing under reduced
          motion. Sits directly on the plate (-z-[46]) because it REPLACES plate
          pixels rather than adding light, and carries the plate's own opacity
          for the same reason. */}
      <HomeSceneWater />

      {/* The same scene, living: the lanterns, their doubles in the water and
          the vanishing-point mist all breathe, and fireflies drift over the
          water. Procedural, not a video — zero bytes over the wire on the one
          route where LCP matters most. Sits BETWEEN the plate and the scrim at
          the SAME opacity, so both darken identically and the effect reads as
          "the picture is alive", never as an overlay. */}
      <HomeSceneGlow />

      {/* Art-directed scrim, not a flat wash: dark over the headline block,
          LIGHTEST across the middle so the vanishing-point mist can rim-light
          the laptop, closing again at the bottom (.home-scrim, globals.css). */}
      <div className="home-backdrop home-scrim -z-40" />

      {/* `grow`, not `h-full`. Both fill a shell that fits, but only one can
          also EXCEED it: `height: 100%` resolves against the shell's height and
          pins <main> to it, so `.hero-row`'s `min-height` would overflow a fixed
          box and, with the shell clipping, simply be cut off — the original bug
          one element further in. As a flex item with `flex-grow: 1` and the
          default `flex-basis: auto`, <main>'s own height IS its content, so the
          shell (height auto, `min-height: 100vh`) sizes to it and only then
          flexes it back out to fill any slack. Content it cannot fit therefore
          lengthens the shell rather than escaping it, and lengthening the shell
          is what gives the page something to scroll.
          `overflow-x-hidden` -> `overflow-clip` for the reason on the shell: the
          ripple rings overhang this box too (measured 54px past the fold at
          1440x700), and `hidden` would scroll them instead of clipping them. */}
      <main
        ref={mainRef}
        className="relative z-10 flex grow flex-col items-center overflow-clip"
      >
        {/* Live maintenance header (issue #24) — slim status bar above the hero.
            Top padding combines the safe-area inset (for notched/dynamic-island
            devices) with the breakpoint baseline so the responsive spacing
            still applies on devices without a safe area. */}
        <div className="z-50 w-full px-2 pt-[calc(env(safe-area-inset-top)+0.5rem)] max-[479px]:pt-[calc(env(safe-area-inset-top)+1.75rem)] sm:px-4 sm:pt-[calc(env(safe-area-inset-top)+0.75rem)] md:px-8 md:pt-[calc(env(safe-area-inset-top)+1rem)] lg:px-12">
          <LiveMaintenanceHeader />
        </div>

        {/* HEADLINE */}
        {/* GPU-isolated (issue #87): `transform-gpu` (translateZ(0)) gives the
            headline its own compositor layer and `[backface-visibility:hidden]`
            stops WebKit collapsing it back into the parent during the laptop's
            per-frame transform, so no sub-pixel jitter couples across. No
            `will-change` — the headline is static, so a warm layer is wasted. */}
        <div className="z-40 transform-gpu pb-2 pt-3 text-center [backface-visibility:hidden] sm:pt-5 md:pb-4 md:pt-6 lg:pb-6 lg:pt-8">
          {/* Keep the original outline-only look for the hero name. The
              shared `.text-glow-stroke-neon` class was later changed (page-
              titles unification, PR #104) to a SOLID #ff6d05 fill so the
              sub-page headers (ABOUT ME / CONTACT ME) read as filled glyphs —
              but the homepage name is meant to stay hollow (transparent fill,
              orange stroke + glow). This inline `color` restores that prior
              value (`#000e1700`, fully transparent) for this h1 only, without
              touching the shared class the sub-page titles now rely on. */}
          {/* `home-title` carries no styling of its own at any width the four
              utilities below already cover. It exists so the 640-767px ramp in
              globals.css has something to target that ISN'T
              `.text-glow-stroke-neon` — that class is shared with the sub-page
              headers (ABOUT ME / CONTACT ME, PR #104), and sizing it here would
              resize those too. Same reason `.home-shell` exists a few lines up. */}
          {/* No size utilities here any more. `text-[2.6rem] sm:text-[3rem]
              md:text-[4rem] lg:text-[5rem]` moved into the `--title-w` ladder
              in globals.css — same four values — because this size also has to
              be capped by viewport HEIGHT on a page that cannot scroll, and a
              font-size has no `max-*` property: the cap has to be `min()`, and
              `min()` needs the width-derived value as an operand. Leaving the
              utilities here as well would mean two sources for one number. */}
          <h1
            className="home-title text-glow-stroke-neon text-center font-[500] uppercase leading-none text-transparent"
            style={{ color: '#000e1700' }}
          >
            Muhammad
            <br /> Abdullah
          </h1>

          {/* The role line, printed on a security plate (issue #11). Still an
              ordinary <h2> holding an ordinary text node — HomeRoleLatent wraps
              it and puts an engraved ground BEHIND it: a field of
              one-device-pixel guilloche with a second, near-identical engraving
              over it at a slightly finer pitch and a fifth of a degree of
              rotation. The words are cut into that overlay as a half-pitch
              displacement, so they exist a second time as the moiré between the
              two — surfacing out of the fringe field as its phase drifts and as
              the pointer tilts the plate, exactly like tilting a banknote.

              The canvas never draws a pixel of THIS text. It is a sibling
              behind the heading, so the printed line stays solid and legible on
              its own and the latent reading is only ever a bonus.

              THE SIZE CLASSES BELOW ARE UNCHANGED, deliberately and by
              constraint: same four breakpoints, same 300 weight, same
              `leading-snug`. At that size a stem is ~1.4px, which rules out
              every surface treatment there is — and is exactly why the effect
              is line art: hairline moiré is scale-free, so it gets SHARPER as
              the type gets smaller. See the note on `.hero-role` in
              globals.css. Only the two magenta utilities are gone:
              `text-amethyst-neon` (the #fc83ff fill) and
              `text-glow-stroke-purple`, whose 4px tracking moved to
              `.hero-role` unchanged so the line still measures the same.

              What DID change is the space above: `mt-1` is gone from here and
              the line's top margin now lives in `.hero-role` as 1.3em, in the
              line's own em rather than in pixels. The plate overhangs 1.225em
              above this heading and a flat 4px never cleared it, so the
              engraving printed over the bottom of ABDULLAH — worst on a phone,
              where the name is at its smallest relative to this line. The
              reasoning and the measurements are with the rule in globals.css;
              size it there, not here, so it stays tied to the plate. */}
          {/* Size classes gone for the same reason as the h1 above — the four
              values (1 / 1.2 / 1.4 / 1.6rem) are now the `--role-w` ladder in
              globals.css, unchanged, so a viewport-height cap can be applied
              to them with `min()`. THE SIZES THEMSELVES ARE STILL THE ONES
              THIS FEATURE WAS BUILT AROUND — see the note above and the one on
              `.hero-role`; what moved is where they are declared, not what
              they are. The plate re-prints off its own ResizeObserver, so a
              height-driven change trips it exactly like a width-driven one. */}
          <HomeRoleLatent className="font-light uppercase leading-snug">
            Software Engineer
          </HomeRoleLatent>
        </div>

        {/* `hero-row` is only a hook for the `div.hero-row` block in
            globals.css, which replaces `flex-1`'s `min-height: auto` with an
            explicit `min-height: var(--nav-min-h)` at every height. Under
            `auto` the row refuses to shrink below the laptop's height and
            grows off the bottom of the screen — taking the orbit's centre
            with it, since the ring is measured from this row; shrunk to
            nothing it takes the orbit's guaranteed room with it instead, so
            the floor is the navigation's reservation rather than zero (see
            `--nav-min-h` in globals.css for the arithmetic). */}
        <div className="hero-row relative z-10 flex w-full flex-1 items-center justify-center">
          {/* Wrapper for laptop + rings. `hero-stage` makes it `height: 100%`
              of the hero row, which is what gives the laptop's percentage
              `max-height` a definite box to resolve against — the bound that
              stops it ever reaching the role line's plate. */}
          <div
            ref={stageRef}
            className="hero-stage relative flex items-center justify-center"
            // The ripple rings and the contact shadow read these instead of
            // being centred on this box. Until the first measurement lands they
            // fall back to the values `.hero-stage` declares in globals.css,
            // which reproduce the old centre-plus-64px placement, so the very
            // first paint is never worse than what this replaces.
            style={
              base
                ? {
                    '--lap-base-x': `${base.x}px`,
                    '--lap-base-y': `${base.y}px`,
                    // The laptop's rendered width, for the contact shadow's
                    // fixed 0.875 ratio (`.laptop-contact`, globals.css) —
                    // published rather than derived there because the rendered
                    // width is `min(width ladder, height cap)` and CSS cannot
                    // read which side won.
                    '--lap-w': `${base.w}px`,
                    // Rides along with the base because it is decided by the
                    // same measurement: how much room is left below the base.
                    '--ring-fit': ringFit,
                  }
                : undefined
            }
          >
            {/* Laptop */}
            <Image
              ref={laptopRef}
              priority
              src={laptop}
              alt="laptop"
              // laptop
              // No size or margin utilities left here. The old `mb-6 md:mb-24`
              // and `w-[70%] sm:w-[75%] md:w-[22rem] lg:w-[30rem]` became the
              // `--laptop-mb` and `--laptop-w` ladders in globals.css — the
              // margins at the same values; the widths since RETUNED there
              // (70% below 640, a 450->432px ramp across 640-767, 432->480
              // across 768-1023, 480 at lg, 480->512 from 1536 — see the
              // ladder for why). The widths had to move because this element
              // is sized `width: auto` + `max-width` + `max-height` now: that
              // is the one configuration in which CSS shrinks a replaced
              // element to fit BOTH limits and keeps its aspect ratio doing
              // it, and it is what structurally prevents the laptop from ever
              // climbing into the role line's engraved plate on a short
              // viewport.
              className={`laptop relative z-20 animate-float-laptop object-contain ${hovered ? 'active' : ''}`}
            />
            {/* Contact shadow — grounds the laptop on the causeway stone.
                Over the old empty-murk plate the eye never asked where the
                laptop met the ground; over a real photographic surface it does,
                and its absence read as "pasted on". Sits AFTER the laptop in
                the DOM so `.laptop:hover ~ .laptop-contact` can widen it on
                hover, and at z-10 (under the laptop's z-20) so paint order is
                unchanged. Decorative — hidden from assistive tech.

                The two portrait-phone overrides fix a RATIO, not a size. The
                laptop is sized in percentages (`w-[70%]`) and this shadow in
                fixed px, so the two diverge as the viewport narrows: measured
                live, the shadow is 0.91x the laptop's width at 1440 but only
                0.61x at 440 — the laptop ends up standing on a shadow
                two-thirds its width, which is most of why it reads as hovering
                rather than resting. In vw the ratio holds across 440, 390 and
                360 instead of stepping at one breakpoint. `max-sm` is the exact
                complement of `sm`, so no width can match both.

                No `sm:`/`md:`/`lg:` size utilities any more: from 640px up the
                shadow is 0.875 x the laptop's MEASURED width (`--lap-w`, the
                `.laptop-contact` rule in globals.css), because from 640 up the
                laptop's rendered size is `min(width ladder, height cap)` and a
                px-stepped shadow diverged from it exactly the way the phone
                one did — 1.05x the laptop at 1440x790, where the height cap
                had shrunk the art and the shadow held still. The base px pair
                below is only ever rendered at 480-639px landscape now. */}
            <div
              aria-hidden
              className="laptop-contact pointer-events-none absolute z-10 h-[34px] w-[180px] rounded-[50%] max-sm:portrait:h-[10vw] max-sm:portrait:w-[63vw]"
            />
            {/* glowing borderline under laptop */}
            {/* No size utilities on any of the three any more. Their rungs
                became the `--ring-size` ladder in globals.css — since RETUNED
                there to 150/220/320 below 640, ramps to one 340/460/600 rung
                for all of 768+, and 363/491/640 ramps from 1536 (see the
                ladder for why the md rung went) — for the same reason the
                laptop's and the headline's went: the size has to be multiplied
                by a fit factor so the outermost ring always closes inside the
                hero, and a utility cannot be multiplied. */}
            <div
              className="borderline absolute animate-ripple-neon rounded-full"
              style={{ transform: 'perspective(600px) rotateX(80deg)' }}
            />

            <div
              className="borderline2 absolute animate-ripple-neon rounded-full"
              style={{ transform: 'perspective(600px) rotateX(80deg)' }}
            />

            {/* The OUTERMOST ring, so the one the page has to be long enough
                for — measured (not assumed) via this ref, since its used height
                is whatever the `--hero-cap` ramp leaves it, 263 to 600px. */}
            <div
              ref={outerRingRef}
              className="borderline3 absolute animate-ripple-neon rounded-full"
              style={{ transform: 'perspective(600px) rotateX(80deg)' }}
            />
          </div>
          {/* navigation buttons. The two orbit props hand the ring the same
              measurement the ground effects position from — the laptop's base
              and rendered height, both stage-local px — so the orbit can
              anchor to the artwork instead of to the row's centre (ORBIT_RAISE
              in navigation/index.jsx). Primitives, not an object, so the
              ring's measure effect re-runs only when a value actually moved,
              never merely because this component rendered. */}
          <Navigation
            setHovered={setHovered}
            hovered={hovered}
            orbitBaseY={base ? base.y : null}
            orbitLapH={base ? base.h : null}
          />
        </div>
      </main>
    </div>
  );
}
