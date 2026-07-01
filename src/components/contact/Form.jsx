'use client';
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from 'framer-motion';

import FireInput from './FireInput';
import FireTextarea from './FireTextarea';
import SliceLabel from './SliceLabel';
import MessageRefine from './MessageRefine';
import { useMagneticPull } from '../../hooks/useMagneticPull';
import { useFormDraft } from '../../hooks/useFormDraft';
import { useOfflineQueue } from '../../hooks/useOfflineQueue';
import { DRAFT_FIELDS, newIdempotencyKey, postContactMessage, setNativeValue } from '../../lib/contact';

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.45,
      delayChildren: 0.3,
    },
  },
};

const item = {
  hidden: { opacity: 0, scale: 0.85 },
  show: {
    opacity: 1,
    scale: [0.85, 1.06, 0.97, 1.02, 1],
    transition: {
      opacity: { duration: 0.4, ease: 'easeOut' },
      scale: {
        times: [0, 0.35, 0.55, 0.75, 1],
        duration: 0.6,
        ease: 'easeInOut',
      },
    },
  },
};

// The submit CTA reveals only after the four fields have staggered in
// (container: delayChildren 0.3 + 3×staggerChildren 0.45 → the last field
// begins at ~1.65s and settles ~2.25s), so the button appears once the whole
// form is present instead of sitting there throughout the entrance.
const CTA_REVEAL_DELAY = 2.1;

// ── "SENDING…" molten label ─────────────────────────────────────────────────
// A grey, un-lit "SENDING..." that a turbulent wavefront of molten orange
// sweeps through left→right, driven by the real send `fill` progress (0→1) —
// the colour can only finish filling once the request actually resolves.
//
// Rendered as one inline <svg> so the masking + Perlin-noise displacement that
// give the advancing front its living, ragged edge run natively (feTurbulence /
// feDisplacementMap are rock-solid cross-browser, unlike CSS mask-image url()
// refs — the same fragility FireInput/FireTextarea warn about). Three copies of
// the word stack in one SVG coordinate space so they overlay perfectly:
//   1. dim grey base — the un-lit text, always visible,
//   2. molten-orange body — revealed up to the turbulent sweep front, and
//   3. a white-hot leading edge — a narrow bright window riding the front that
//      flickers as it advances, like the hot tip of spreading lava.
//
// Crucially, the displacement filter warps the *mask's* gradient, NOT the text,
// so the glyphs stay crisply registered over the grey base while only the
// wavefront boundary boils. The SVG text inherits the button's font /
// letter-spacing, and a one-time getBBox() (in useLayoutEffect, before first
// paint) sizes the viewBox 1:1 in px so the molten word matches the size it
// would have as plain text.
const SENDING_DIM = 'rgba(228, 228, 228, 0.32)';
// The dots are rendered SEPARATELY from the word (not "SENDING...") so each can
// bounce on its own: in SVG text, shifting one glyph's offset cascades to every
// glyph after it, so an in-string dot can't lift without dragging its siblings.
const SENDING_WORD = 'SENDING';

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

// Bounce timing for the trailing dots — lift at 30%, settle by 60%, mirroring
// the old .sending-dot wave (0.7s loop, 0.12s per-dot stagger, ~0.34em lift).
const DOT_KEYTIMES = '0;0.3;0.6;1';
const DOT_KEYSPLINES = '0.3 0 0.3 1;0.3 0 0.3 1;0.3 0 0.3 1';

function SendingLabel({ fill, reduced }) {
  // useId keeps the filter/mask/gradient ids unique per instance; strip the
  // colons React emits so they're safe inside url(#...) references.
  const uid = useId().replace(/:/g, '');
  const id = {
    molten: `mlt-${uid}`,
    body: `bdy-${uid}`,
    tip: `tip-${uid}`,
    sweep: `swp-${uid}`,
    edge: `edg-${uid}`,
    fillGrad: `fll-${uid}`,
  };

  const baseRef = useRef(null);
  const [box, setBox] = useState(null);
  // Per-dot x position + bounce height, laid out just past the word's right
  // edge (kept out of the word so each dot lifts and ignites independently).
  const [dots, setDots] = useState(null);

  // Measure the rendered word once, before paint, so the viewBox frames it 1:1
  // and the dots can be positioned relative to its right edge.
  useLayoutEffect(() => {
    const el = baseRef.current;
    if (!el) return;
    const b = el.getBBox();
    setBox({ x: b.x, y: b.y, w: b.width, h: b.height });
    const fs = parseFloat(getComputedStyle(el).fontSize) || b.height;
    const wordRight = b.x + b.width;
    const gap = fs * 0.05; // breathing room between the word and the first dot
    const step = fs * 0.3; // '.' advance + a little tracking
    setDots({
      xs: [0, 1, 2].map((i) => wordRight + gap + i * step),
      lift: fs * 0.34,
      right: wordRight + gap + 3 * step,
    });
  }, []);

  // The sweep front travels from just before the word (−0.1) to just past it
  // (1.1), so the text is fully un-lit at fill 0 and fully molten at fill 1.
  const front = useTransform(fill, (v) => v * 1.2 - 0.1);
  // Body reveal: opaque (lit) behind the front, transparent ahead of it.
  const bodyBack = useTransform(front, (v) => clamp01(v - 0.08));
  const bodyFront = useTransform(front, (v) => clamp01(v + 0.02));
  // Hot edge: a narrow white window centred on the front.
  const edgeBack = useTransform(front, (v) => clamp01(v - 0.06));
  const edgeMid = useTransform(front, clamp01);
  const edgeFront = useTransform(front, (v) => clamp01(v + 0.05));
  // The hot tip blooms in as the sweep starts and cools away as it completes.
  const tipOpacity = useTransform(fill, [0, 0.06, 0.9, 1], [0, 1, 1, 0]);
  // Each dot ignites orange as the front clears the word — staggered so the
  // colour "arrives" at the three dots in turn, left → right, near completion.
  const dot0 = useTransform(fill, [0.8, 0.9], [0, 1]);
  const dot1 = useTransform(fill, [0.88, 0.96], [0, 1]);
  const dot2 = useTransform(fill, [0.95, 1], [0, 1]);
  const dotLit = [dot0, dot1, dot2];

  const ready = Boolean(box && dots);
  const pad = box ? box.h * 0.6 : 0;
  const lift = dots ? dots.lift : 0;
  const scale = box ? box.h * 0.26 : 0; // displacement amplitude, in px
  // Top padding (pad + lift) reserves room for the bounced dots. The SAME
  // (pad + lift) is mirrored on the bottom so the word sits at the SVG box's
  // true vertical centre — otherwise the extra top room pushes it low and the
  // "SENDING…" label reads off-centre once the overlay is centred in the button.
  const region = ready
    ? {
        x: box.x - pad,
        y: box.y - pad - lift,
        w: dots.right + pad - (box.x - pad),
        h: box.h + (pad + lift) * 2,
      }
    : null;

  return (
    <svg
      aria-hidden="true"
      width={region ? region.w : 0}
      height={region ? region.h : 0}
      viewBox={
        region ? `${region.x} ${region.y} ${region.w} ${region.h}` : undefined
      }
      style={{
        display: 'block',
        overflow: 'visible',
        visibility: ready ? 'visible' : 'hidden',
      }}
    >
      {ready && (
        <defs>
          {!reduced && (
            <filter
              id={id.molten}
              x="-25%"
              y="-80%"
              width="150%"
              height="260%"
              colorInterpolationFilters="sRGB"
            >
              {/* Perlin noise that slowly breathes, so the front writhes. */}
              <feTurbulence
                type="fractalNoise"
                baseFrequency="0.02 0.08"
                numOctaves="2"
                seed="4"
                stitchTiles="stitch"
                result="noise"
              >
                <animate
                  attributeName="baseFrequency"
                  dur="1.6s"
                  values="0.02 0.08;0.03 0.06;0.02 0.08"
                  keyTimes="0;0.5;1"
                  calcMode="spline"
                  keySplines=".45 0 .55 1;.45 0 .55 1"
                  repeatCount="indefinite"
                />
              </feTurbulence>
              <feDisplacementMap
                in="SourceGraphic"
                in2="noise"
                scale={scale}
                xChannelSelector="R"
                yChannelSelector="G"
              />
            </filter>
          )}

          {/* Vertical molten shading for the lit body — hotter at the top. */}
          <linearGradient id={id.fillGrad} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ff8a33" />
            <stop offset="0.5" stopColor="#ff6d05" />
            <stop offset="1" stopColor="#f25a00" />
          </linearGradient>

          {/* Sweep reveal — white (lit) sliding into transparent (un-lit). */}
          <linearGradient
            id={id.sweep}
            gradientUnits="userSpaceOnUse"
            x1={box.x}
            y1="0"
            x2={box.x + box.w}
            y2="0"
          >
            <motion.stop offset={bodyBack} stopColor="#fff" stopOpacity="1" />
            <motion.stop offset={bodyFront} stopColor="#fff" stopOpacity="0" />
          </linearGradient>
          <mask
            id={id.body}
            maskUnits="userSpaceOnUse"
            x={region.x}
            y={region.y}
            width={region.w}
            height={region.h}
          >
            <rect
              x={region.x}
              y={region.y}
              width={region.w}
              height={region.h}
              fill={`url(#${id.sweep})`}
              filter={reduced ? undefined : `url(#${id.molten})`}
            />
          </mask>

          {/* Narrow bright window that rides the front (the white-hot edge). */}
          <linearGradient
            id={id.edge}
            gradientUnits="userSpaceOnUse"
            x1={box.x}
            y1="0"
            x2={box.x + box.w}
            y2="0"
          >
            <motion.stop offset={edgeBack} stopColor="#000" />
            <motion.stop offset={edgeMid} stopColor="#fff" />
            <motion.stop offset={edgeFront} stopColor="#000" />
          </linearGradient>
          <mask
            id={id.tip}
            maskUnits="userSpaceOnUse"
            x={region.x}
            y={region.y}
            width={region.w}
            height={region.h}
          >
            <rect
              x={region.x}
              y={region.y}
              width={region.w}
              height={region.h}
              fill={`url(#${id.edge})`}
              filter={reduced ? undefined : `url(#${id.molten})`}
            />
          </mask>
        </defs>
      )}

      {/* 1 — dim, un-lit base word (also the element we measure). */}
      <text ref={baseRef} x="0" y="0" fill={SENDING_DIM}>
        {SENDING_WORD}
      </text>

      {/* 2 — molten body, revealed up to the turbulent sweep front. */}
      {ready && (
        <text
          x="0"
          y="0"
          fill={`url(#${id.fillGrad})`}
          mask={`url(#${id.body})`}
        >
          {SENDING_WORD}
        </text>
      )}

      {/* 3 — white-hot leading edge, flickering as it advances. */}
      {ready && !reduced && (
        <motion.g style={{ opacity: tipOpacity }}>
          <text x="0" y="0" fill="#ffe7c0" mask={`url(#${id.tip})`}>
            {SENDING_WORD}
            <animate
              attributeName="fill-opacity"
              dur="0.45s"
              values="1;0.55;1"
              repeatCount="indefinite"
            />
          </text>
        </motion.g>
      )}

      {/* 4 — the trailing dots. Two synced layers per dot: a dim base that
          bounces in a staggered left→right wave, and an orange copy on top
          whose opacity ignites as the fill front reaches that dot. */}
      {ready &&
        dots.xs.map((x, i) => (
          <text key={`dot-dim-${i}`} x={x} y="0" fill={SENDING_DIM}>
            .
            {!reduced && (
              <animate
                attributeName="y"
                dur="0.7s"
                begin={`${i * 0.12}s`}
                values={`0;${-dots.lift};0;0`}
                keyTimes={DOT_KEYTIMES}
                calcMode="spline"
                keySplines={DOT_KEYSPLINES}
                repeatCount="indefinite"
              />
            )}
          </text>
        ))}
      {ready &&
        dots.xs.map((x, i) => (
          <motion.text
            key={`dot-lit-${i}`}
            x={x}
            y="0"
            fill="#ff6d05"
            style={{ opacity: dotLit[i] }}
          >
            .
            {!reduced && (
              <animate
                attributeName="y"
                dur="0.7s"
                begin={`${i * 0.12}s`}
                values={`0;${-dots.lift};0;0`}
                keyTimes={DOT_KEYTIMES}
                calcMode="spline"
                keySplines={DOT_KEYSPLINES}
                repeatCount="indefinite"
              />
            )}
          </motion.text>
        ))}
    </svg>
  );
}

// Shared positioning for the in-button state overlays (SENDING… and ✓ SENT):
// absolutely centred over the button's locked footprint, out of layout flow so
// their oversized paint never resizes the pill, and pointer-transparent so the
// button underneath keeps owning interaction.
const STATE_OVERLAY = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  overflow: 'visible',
  pointerEvents: 'none',
};

// "✓ SENT" — the in-button morph target once a send resolves. Replaces the old
// green checkmark disc: the check STROKES itself in (pathLength 0→1) instead of
// popping, "SENT" slides in just behind it, and both render in the SAME ember
// accent as the rest of the CTA — so success stays on-palette and on-story, one
// continuous object rather than a swap to a different shape/colour. Reduced
// motion renders the finished mark with no drawing or slide.
function SentLabel({ reduced }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.45em',
        color: '#ff6d05',
        whiteSpace: 'nowrap',
      }}
    >
      <svg
        width="1.05em"
        height="1.05em"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
        style={{ overflow: 'visible' }}
      >
        <motion.path
          d="M4 12.5 L9.5 18 L20 6.5"
          stroke="#ff6d05"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={reduced ? { pathLength: 1 } : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.45, ease: [0.65, 0, 0.35, 1], delay: 0.08 }}
        />
      </svg>
      <motion.span
        initial={reduced ? { opacity: 1 } : { opacity: 0, x: -5 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.32, ease: 'easeOut', delay: 0.28 }}
      >
        SENT
      </motion.span>
    </span>
  );
}

// "✦ HELD" — the in-button morph target when a send is parked offline. Sibling
// to SentLabel, deliberately distinct from it: where SENT strokes a checkmark
// (delivered), HELD draws a clock face (awaiting). Same ember palette so it
// stays on-story — the message is safe, just not gone yet. Reduced motion
// renders the finished mark with no drawing or slide.
function HeldLabel({ reduced }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.45em',
        color: '#ff6d05',
        whiteSpace: 'nowrap',
      }}
    >
      <svg
        width="1.05em"
        height="1.05em"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
        style={{ overflow: 'visible' }}
      >
        <motion.circle
          cx="12"
          cy="12"
          r="8.5"
          stroke="#ff6d05"
          strokeWidth="2.2"
          initial={reduced ? { pathLength: 1 } : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.5, ease: [0.65, 0, 0.35, 1] }}
        />
        <motion.path
          d="M12 12 L12 7.5 M12 12 L15 13.5"
          stroke="#ff6d05"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={reduced ? { opacity: 1 } : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.4 }}
        />
      </svg>
      <motion.span
        initial={reduced ? { opacity: 1 } : { opacity: 0, x: -5 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.32, ease: 'easeOut', delay: 0.3 }}
      >
        HELD
      </motion.span>
    </span>
  );
}

// Decorative outline overlay that draws the field's border and lets a native
// <legend> cut a notch for the floating label (see .float-outline in
// globals.css). aria-hidden — the real <label htmlFor> still owns the a11y
// label; the legend text only reserves the gap's width.
function NotchedOutline({ label }) {
  return (
    <fieldset className="float-outline" aria-hidden="true">
      <legend className="float-notch">
        <span>{label}</span>
      </legend>
    </fieldset>
  );
}

function FormContent({ onReset, queue }) {
  const reduced = useReducedMotion();
  const fill = useMotionValue(0);
  const [launch, setLaunch] = useState('idle');
  const timersRef = useRef([]);
  // The <form> element, so the draft layer and the AI accept can write values
  // into the right field by name (textarea[name="message"]) without threading a
  // ref through every Fire wrapper.
  const formRef = useRef(null);
  // Cursor-reactive magnetic lean on the submit CTA (no-op on touch / reduced
  // motion). Only wired while the button is idle; released the moment it sends.
  const magnetic = useMagneticPull();
  // Hover state drives the SliceLabel sweep; gated to idle so the slice never
  // animates while the button is busy/sent.
  const [hovered, setHovered] = useState(false);
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm();

  // Current message text, for the AI "refine" affordance (gates visibility and
  // is the payload it polishes). `watch` re-renders on keystrokes, which is fine
  // for a form this small and never restarts the framer animations.
  const message = watch('message');

  // Autosave + restore the four fields, so a half-written message survives a
  // refresh or an accidental navigation.
  const draft = useFormDraft({ watch, formRef, fields: DRAFT_FIELDS });

  // Apply an accepted AI rewrite into the message field. setNativeValue updates
  // react-hook-form AND the FireTextarea gradient overlay in one event.
  const applyRefined = (text) => {
    const node = formRef.current?.querySelector('textarea[name="message"]');
    if (node) setNativeValue(node, text);
  };

  useEffect(() => {
    return () => timersRef.current.forEach(clearTimeout);
  }, []);

  const schedule = (cb, ms) => {
    timersRef.current.push(setTimeout(cb, ms));
  };

  // While the request is in flight the four fields run the "ember charge-up"
  // ripple (see .field-charge in globals.css) so the form feels alive during
  // the send instead of sitting frozen behind the busy button.
  const sending = launch === 'sending';
  const queued = launch === 'queued';
  // Once the message has left the field — delivered ('check') or safely held
  // offline ('queued') — the typed content combusts away (see .field-clearing):
  // flaring then dissolving, so it visibly clears instead of snapping blank only
  // when the form later remounts.
  const clearing = launch === 'check' || queued;

  // Park a message for later delivery and clear the form, shared by the two
  // "couldn't reach the server" paths (offline at submit, or the send dropped).
  const holdForLater = (params) => {
    queue.enqueue(params);
    draft.clearStored();
    fill.set(0);
    setLaunch('queued');
    schedule(onReset, 2600);
  };

  const onSubmit = async (data) => {
    if (launch !== 'idle') return;

    const params = {
      subject: data.subject,
      name: data.name,
      email: data.email,
      message: data.message,
      // Minted once here so the live send and any offline retry of this exact
      // message share one key — the server dedupes on it to avoid a double-send.
      idempotencyKey: newIdempotencyKey(),
    };

    // Already offline → don't spin the send animation against a wall; hold the
    // message immediately and let the queue deliver it on reconnect.
    if (!queue.online) {
      toast('Saved — it will send when you reconnect.', { icon: '✦' });
      holdForLater(params);
      return;
    }

    setLaunch('sending');
    // Spring the magnetic lean back to centre as the button goes busy — the
    // disabled button won't emit a pointerleave to do it for us.
    magnetic.release();
    fill.set(0);
    // Creep the fill toward 0.9 while the request is in flight — easeOut so it
    // decelerates and never completes on its own. The bar can only reach 100%
    // once the form is actually ready to submit.
    const creep = animate(fill, 0.9, { duration: 3.5, ease: 'easeOut' });
    const result = await postContactMessage(params);
    creep.stop();

    if (result.ok) {
      // Complete the fill exactly as it submits, with a brief beat so the full
      // colour is visible before the success tick lands.
      await animate(fill, 1, { duration: 0.35, ease: 'easeOut' }).finished;
      toast.success('Message sent successfully!', { icon: '✅' });
      draft.clearStored();
      // Remount the entire form component to get a fresh useForm() instance.
      // This avoids the known issue where reset() inside handleSubmit's
      // callback gets its state overridden by handleSubmit's finally block.
      setLaunch('check');
      schedule(onReset, 2600);
    } else if (result.network) {
      // The send didn't complete — either we're offline, or it failed transiently
      // while online (dropped connection, a 5xx, or an in-flight idempotent retry).
      // Either way the queue holds it; only WHEN it drains differs — on reconnect
      // vs. the online auto-drain's backoff — so the copy reflects that.
      toast(
        queue.online
          ? 'Saved — retrying shortly…'
          : 'Saved — it will send when you reconnect.',
        { icon: '✦' },
      );
      holdForLater(params);
    } else if (!result.aborted) {
      const messages = result.errors?.length
        ? result.errors
        : ['Failed to send message'];
      messages.forEach((msg) => toast.error(msg, { icon: '⚠️' }));
      fill.set(0);
      setLaunch('idle');
    } else {
      fill.set(0);
      setLaunch('idle');
    }
  };

  return (
    <>
      <motion.form
        ref={formRef}
        variants={container}
        initial="hidden"
        animate="show"
        onSubmit={handleSubmit(onSubmit)}
        className="flex h-full w-full max-w-xl flex-col items-center justify-center space-y-4 px-12 py-6"
      >
        {/* Restored-draft banner: shown when an unsent message was repopulated
            from a previous visit. The visitor can keep it (dismiss the banner)
            or clear the form entirely. */}
        <AnimatePresence>
          {draft.restored && (
            <motion.div
              key="draft-restored"
              className="draft-restored w-full"
              role="status"
              initial={reduced ? { opacity: 0 } : { opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduced ? { opacity: 0 } : { opacity: 0, y: -8 }}
              transition={{ duration: 0.32, ease: 'easeOut' }}
            >
              <span className="draft-restored__text">
                <span aria-hidden="true" className="refine-spark">
                  ✦
                </span>
                Restored your unsent message
              </span>
              <span className="draft-restored__actions">
                <button
                  type="button"
                  className="refine-btn refine-btn--ghost"
                  onClick={draft.dismissRestored}
                >
                  Keep
                </button>
                <button
                  type="button"
                  className="refine-btn refine-btn--ghost"
                  onClick={draft.clearDraft}
                >
                  Clear
                </button>
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* <motion.div variants={item} className="w-full">
          <h2 className="text-[2em] text-amethyst-neon">Message Me</h2>
        </motion.div> */}

        <motion.div variants={item} className="w-full">
          <div
            className={`float-field${sending ? ' field-charge' : ''}${clearing ? ' field-clearing' : ''}`}
            style={{ '--charge-delay': '0ms' }}
          >
            <FireInput
              id="name"
              name="name"
              type="text"
              autoComplete="name"
              placeholder=" "
              aria-invalid={Boolean(errors.name)}
              aria-describedby={errors.name ? 'name-error' : undefined}
              {...register('name', {
                required: 'Full Name is required!',
                minLength: {
                  value: 3,
                  message: 'Name should be at least 3 characters long.',
                },
                maxLength: {
                  value: 100,
                  message: 'Name should be at most 100 characters long.',
                },
              })}
              className="custom-bg-2 w-full rounded-md p-2 shadow-lg hover:shadow-[0_6px_16px_rgba(0,0,0,0.5),0_0_8px_rgba(192,132,252,0.5),0_0_22px_rgba(124,58,237,0.42),inset_0_0_10px_rgba(192,132,252,0.1)] focus:shadow-[0_6px_16px_rgba(0,0,0,0.5),0_0_10px_rgba(216,180,254,0.65),0_0_24px_rgba(168,85,247,0.5),inset_0_0_12px_rgba(192,132,252,0.14)] focus:outline-none"
            />
            <NotchedOutline label="Full Name" />
            <label htmlFor="name" className="float-label">
              Full Name
            </label>
          </div>
        </motion.div>
        {errors.name && (
          <span
            id="name-error"
            role="alert"
            className="inline-block self-start"
            style={{ color: '#ff6d05', marginTop: '2px' }}
          >
            {errors.name.message}
          </span>
        )}
        <motion.div variants={item} className="w-full">
          <div
            className={`float-field${sending ? ' field-charge' : ''}${clearing ? ' field-clearing' : ''}`}
            style={{ '--charge-delay': '120ms' }}
          >
            <FireInput
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder=" "
              aria-invalid={Boolean(errors.email)}
              aria-describedby={errors.email ? 'email-error' : undefined}
              {...register('email', { required: 'Email is required!' })}
              className="custom-bg-2 w-full rounded-md p-2 shadow-lg hover:shadow-[0_6px_16px_rgba(0,0,0,0.5),0_0_8px_rgba(192,132,252,0.5),0_0_22px_rgba(124,58,237,0.42),inset_0_0_10px_rgba(192,132,252,0.1)] focus:shadow-[0_6px_16px_rgba(0,0,0,0.5),0_0_10px_rgba(216,180,254,0.65),0_0_24px_rgba(168,85,247,0.5),inset_0_0_12px_rgba(192,132,252,0.14)] focus:outline-none"
            />
            <NotchedOutline label="Email" />
            <label htmlFor="email" className="float-label">
              Email
            </label>
          </div>
        </motion.div>
        {errors.email && (
          <span
            id="email-error"
            role="alert"
            className="inline-block self-start"
            style={{ color: '#ff6d05', marginTop: '2px' }}
          >
            {errors.email.message}
          </span>
        )}
        <motion.div variants={item} className="w-full">
          <div
            className={`float-field${sending ? ' field-charge' : ''}${clearing ? ' field-clearing' : ''}`}
            style={{ '--charge-delay': '240ms' }}
          >
            <FireInput
              id="subject"
              name="subject"
              type="text"
              placeholder=" "
              aria-invalid={Boolean(errors.subject)}
              aria-describedby={errors.subject ? 'subject-error' : undefined}
              {...register('subject', {
                required: 'Subject is required!',
                maxLength: {
                  // Keep in sync with maxRawSubjectLength in api/send-mail/route.js
                  value: 175,
                  message: 'Subject should be at most 175 characters long.',
                },
              })}
              className="custom-bg-2 w-full rounded-md p-2 shadow-lg hover:shadow-[0_6px_16px_rgba(0,0,0,0.5),0_0_8px_rgba(192,132,252,0.5),0_0_22px_rgba(124,58,237,0.42),inset_0_0_10px_rgba(192,132,252,0.1)] focus:shadow-[0_6px_16px_rgba(0,0,0,0.5),0_0_10px_rgba(216,180,254,0.65),0_0_24px_rgba(168,85,247,0.5),inset_0_0_12px_rgba(192,132,252,0.14)] focus:outline-none"
            />
            <NotchedOutline label="Subject" />
            <label htmlFor="subject" className="float-label">
              Subject
            </label>
          </div>
        </motion.div>
        {errors.subject && (
          <span
            id="subject-error"
            role="alert"
            className="inline-block self-start"
            style={{ color: '#ff6d05', marginTop: '2px' }}
          >
            {errors.subject.message}
          </span>
        )}
        <motion.div variants={item} className="w-full">
          <div
            className={`float-field float-field--area${sending ? ' field-charge' : ''}${clearing ? ' field-clearing' : ''}`}
            style={{ '--charge-delay': '360ms' }}
          >
            <FireTextarea
              id="message"
              name="message"
              rows={5}
              placeholder=" "
              aria-invalid={Boolean(errors.message)}
              aria-describedby={errors.message ? 'message-error' : undefined}
              {...register('message', {
                required: 'Message is required!',
                maxLength: {
                  value: 500,
                  message: 'Message should be less than 500 characters',
                },
                minLength: {
                  value: 50,
                  message: 'Message should be more than 50 characters',
                },
              })}
              className="custom-bg-2 w-full resize-y rounded-md p-2 shadow-lg hover:shadow-[0_6px_16px_rgba(0,0,0,0.5),0_0_8px_rgba(192,132,252,0.5),0_0_22px_rgba(124,58,237,0.42),inset_0_0_10px_rgba(192,132,252,0.1)] focus:shadow-[0_6px_16px_rgba(0,0,0,0.5),0_0_10px_rgba(216,180,254,0.65),0_0_24px_rgba(168,85,247,0.5),inset_0_0_12px_rgba(192,132,252,0.14)] focus:outline-none"
            />
            <NotchedOutline label="Message" />
            <label htmlFor="message" className="float-label">
              Message
            </label>
          </div>
        </motion.div>
        {errors.message && (
          <span
            id="message-error"
            role="alert"
            className="inline-block self-start"
            style={{ color: '#ff6d05', marginTop: '-0.25rem' }}
          >
            {errors.message.message}
          </span>
        )}

        {/* AI "polish my missive": streams a cleaner rewrite the visitor can
            accept into the message field. Hidden until there's real content;
            disabled while the form is busy/held/sent. */}
        <MessageRefine
          message={message}
          onAccept={applyRefined}
          disabled={launch !== 'idle'}
        />

        {/* <motion.input
          variants={item}
          value="Cast your message!"
          className="cursor-pointer py-2.5 px-3 rounded-md border border-ember-neon bg-yellow-400/10 backdrop-blur-md  text-[#ff6d05] hover:shadow-[inset_0_4px_12px_rgba(251,191,36,0.25)]"
          type="submit"
        /> */}

        {/* Staged reveal: the CTA fades in only after the fields have
            staggered in (delay), so it isn't sitting on screen during the
            form's entrance. Stays in the DOM / a11y tree throughout; reduced
            motion gets a plain fade with no slide. */}
        <motion.div
          initial={reduced ? { opacity: 0 } : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut', delay: CTA_REVEAL_DELAY }}
        >
          {/* One continuous pill across idle → sending → sent (no shape/colour
              swap). Its content morphs in place; its size is locked by the
              always-mounted "SEND MESSAGE!" halves below. */}
          <motion.button
            id="submit-btn"
            name="submit"
            type="submit"
            aria-label="Send message"
            disabled={launch !== 'idle'}
            aria-busy={launch === 'sending'}
            // Flat #ff6d05 (matches the "4+" years-card digit) — the same vivid
            // orange the site uses for primary highlights, no text-shadow glow.
            // Magnetic lean is a per-frame translate (motion values) merged over
            // the button's own colour; pointer handlers are wired only while
            // idle. Both are inert on touch / reduced motion.
            style={{ color: '#ff6d05', textShadow: 'none', ...magnetic.style }}
            {...(launch === 'idle' ? magnetic.handlers : undefined)}
            // Framer hover events (pointer-based, never fire on touch) toggle
            // the slice sweep. Distinct from the magnetic pointer handlers; both
            // coexist on the button.
            onHoverStart={() => setHovered(true)}
            onHoverEnd={() => setHovered(false)}
            // transition scoped to box-shadow + opacity (NOT `all`): the
            // transform is driven per-frame by Framer (magnetic x/y + scale
            // spring), and a CSS transition on transform would lag the magnetic
            // follow into a rubber-band swim.
            className={`btn-slice custom-bg-abt inline-flex items-center justify-center rounded-full px-6 py-2 font-semibold tracking-wide shadow-sm transition-[box-shadow,opacity] duration-300 ${
              launch === 'idle'
                ? 'cursor-pointer hover:shadow-[0_0_8px_rgba(255,109,5,0.65),0_0_20px_rgba(255,109,5,0.4)]'
                : launch === 'sending'
                  ? 'cursor-not-allowed opacity-60'
                  : 'cursor-default'
            }`}
            // Scale springs (not tweens) so hover/press feel like a physical
            // object catching and giving. Hover/tap only while idle; the
            // magnetic lean carries the sense of motion the old +1.08/-2px did.
            whileHover={launch === 'idle' ? { scale: 1.04 } : undefined}
            whileTap={launch === 'idle' ? { scale: 0.96 } : undefined}
            transition={{ type: 'spring', stiffness: 400, damping: 22, mass: 0.6 }}
            initial={{ scale: 1 }}
          >
            {/* Footprint anchor: the slice label stays mounted through every
                state (just hidden once we leave idle) so the button's size NEVER
                changes — the SENDING…/SENT overlays sit on top of this fixed box
                instead of resizing it. SliceLabel owns the per-letter cut + the
                synced sweeping line (see SliceLabel.jsx); it only animates while
                hovered AND idle. */}
            <span style={launch === 'idle' ? undefined : { visibility: 'hidden' }}>
              <SliceLabel
                text="SEND MESSAGE!"
                hovered={hovered && launch === 'idle'}
              />
            </span>

            {/* One quiet ember ring-pulse from the pill border on success — a
                single ripple that expands and fades once, replacing the old
                double-halo glow. */}
            {clearing && !reduced && (
              <motion.span
                aria-hidden="true"
                className="absolute inset-0 rounded-full"
                style={{
                  border: '1px solid rgba(255,109,5,0.55)',
                  pointerEvents: 'none',
                }}
                initial={{ opacity: 0.55, scale: 1 }}
                animate={{ opacity: 0, scale: 1.22 }}
                transition={{ duration: 0.7, ease: 'easeOut' }}
              />
            )}

            {/* In-button content morph: SENDING… cross-fades to ✓ SENT, both
                centred over the locked footprint. One object, one palette. */}
            <AnimatePresence>
              {sending && (
                <motion.span
                  key="sending"
                  aria-hidden="true"
                  style={STATE_OVERLAY}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.25 }}
                >
                  <SendingLabel fill={fill} reduced={reduced} />
                </motion.span>
              )}
              {launch === 'check' && (
                <motion.span
                  key="sent"
                  aria-hidden="true"
                  style={STATE_OVERLAY}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  <SentLabel reduced={reduced} />
                </motion.span>
              )}
              {queued && (
                <motion.span
                  key="held"
                  aria-hidden="true"
                  style={STATE_OVERLAY}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  <HeldLabel reduced={reduced} />
                </motion.span>
              )}
            </AnimatePresence>
          </motion.button>
        </motion.div>

        {/* Connection-aware status: reassures the visitor their message is safely
            held while offline and will send itself on reconnect. Hidden in the
            normal online case. */}
        {(queued || !queue.online || queue.pending > 0) && (
          <p className="contact-conn-status" role="status" aria-live="polite">
            {queued || queue.pending > 0
              ? 'Held — your message will send itself the moment you’re back online.'
              : 'You’re offline — your message will be held and sent automatically when you reconnect.'}
          </p>
        )}
      </motion.form>
    </>
  );
}

// Wrapper that remounts FormContent via key after a successful send (a fresh
// useForm() instance — no stale state). The offline queue lives HERE, above the
// remount, so its online/offline listeners and pending-message state survive
// each send and keep retrying held messages across remounts.
export default function Form() {
  const [formKey, setFormKey] = useState(0);
  const queue = useOfflineQueue();
  return (
    <FormContent
      key={formKey}
      onReset={() => setFormKey((k) => k + 1)}
      queue={queue}
    />
  );
}
