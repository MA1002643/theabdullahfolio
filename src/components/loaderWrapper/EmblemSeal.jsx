'use client';

import { motion } from 'framer-motion';
import { useEmblemPointer } from '@/hooks/useEmblemPointer';
import { MONO_D } from '@/components/emblem/monogram';
import { IGNITE_MS } from './constants';

// The interactive intro emblem — Muhammad Abdullah's flame seal — rendered as
// live SVG rather than a flat image so it can *build itself* on screen.
//
// Build order (the inscription), each layer landing within BUILD_DURATION_MS:
//   1. two guide circles stroke themselves on (pathLength 0→1) — the compass
//      tracing the outer + inner rings
//   2. the detailed double gold bands fade in beneath those guides (texture)
//   3. the name engraves around the arcs (MUHAMMAD top, ABDULLAH bottom)
//   4. the side diamonds set into place
//   5. the MA flame monogram draws as a cool gold outline (line-art)
//
// Then, on `phase === 'igniting'`, the climax: a white mask rect floods upward
// from the monogram's base, revealing the molten flameMono fill from the bottom
// up (fuel catching), while a contained ember bloom swells from the core. The
// outline fades out as the fill overtakes it. The parent turns that bloom into
// the radial wipe that uncovers the homepage.
//
// All ids are `emblem-` prefixed so the gradients/mask can't collide with any
// other inline SVG on the page.

// --- exact path data from the supplied emblem artwork ------------------------

const TOP_ARC_D =
  'M154.5 409.1 L157.6 398.9 L161.0 388.8 L164.7 378.8 L168.6 368.9 L172.9 359.1 L177.4 349.4 L182.2 339.9 L187.3 330.5 L192.6 321.3 L198.2 312.2 L204.1 303.3 L210.2 294.5 L216.5 286.0 L223.1 277.6 L230.0 269.4 L237.0 261.4 L244.3 253.6 L251.9 246.1 L259.6 238.7 L267.5 231.6 L275.7 224.7 L284.0 218.0 L292.5 211.6 L301.2 205.5 L310.1 199.5 L319.2 193.9 L328.4 188.5 L337.7 183.3 L347.2 178.5 L356.9 173.9 L366.6 169.6 L376.5 165.6 L386.5 161.8 L396.6 158.4 L406.8 155.2 L417.0 152.3 L427.4 149.7 L437.8 147.5 L448.3 145.5 L458.8 143.8 L469.4 142.4 L480.0 141.4 L490.7 140.6 L501.3 140.2 L512.0 140.0 L522.7 140.2 L533.3 140.6 L544.0 141.4 L554.6 142.4 L565.2 143.8 L575.7 145.5 L586.2 147.5 L596.6 149.7 L607.0 152.3 L617.2 155.2 L627.4 158.4 L637.5 161.8 L647.5 165.6 L657.4 169.6 L667.1 173.9 L676.8 178.5 L686.3 183.3 L695.6 188.5 L704.8 193.9 L713.9 199.5 L722.8 205.5 L731.5 211.6 L740.0 218.0 L748.3 224.7 L756.5 231.6 L764.4 238.7 L772.1 246.1 L779.7 253.6 L787.0 261.4 L794.0 269.4 L800.9 277.6 L807.5 286.0 L813.8 294.5 L819.9 303.3 L825.8 312.2 L831.4 321.3 L836.7 330.5 L841.8 339.9 L846.6 349.4 L851.1 359.1 L855.4 368.9 L859.3 378.8 L863.0 388.8 L866.4 398.9 L869.5 409.1';

const BOT_ARC_D =
  'M154.5 614.9 L157.6 625.1 L161.0 635.2 L164.7 645.2 L168.6 655.1 L172.9 664.9 L177.4 674.6 L182.2 684.1 L187.3 693.5 L192.6 702.7 L198.2 711.8 L204.1 720.7 L210.2 729.5 L216.5 738.0 L223.1 746.4 L230.0 754.6 L237.0 762.6 L244.3 770.4 L251.9 777.9 L259.6 785.3 L267.5 792.4 L275.7 799.3 L284.0 806.0 L292.5 812.4 L301.2 818.5 L310.1 824.5 L319.2 830.1 L328.4 835.5 L337.7 840.7 L347.2 845.5 L356.9 850.1 L366.6 854.4 L376.5 858.4 L386.5 862.2 L396.6 865.6 L406.8 868.8 L417.0 871.7 L427.4 874.3 L437.8 876.5 L448.3 878.5 L458.8 880.2 L469.4 881.6 L480.0 882.6 L490.7 883.4 L501.3 883.8 L512.0 884.0 L522.7 883.8 L533.3 883.4 L544.0 882.6 L554.6 881.6 L565.2 880.2 L575.7 878.5 L586.2 876.5 L596.6 874.3 L607.0 871.7 L617.2 868.8 L627.4 865.6 L637.5 862.2 L647.5 858.4 L657.4 854.4 L667.1 850.1 L676.8 845.5 L686.3 840.7 L695.6 835.5 L704.8 830.1 L713.9 824.5 L722.8 818.5 L731.5 812.4 L740.0 806.0 L748.3 799.3 L756.5 792.4 L764.4 785.3 L772.1 777.9 L779.7 770.4 L787.0 762.6 L794.0 754.6 L800.9 746.4 L807.5 738.0 L813.8 729.5 L819.9 720.7 L825.8 711.8 L831.4 702.7 L836.7 693.5 L841.8 684.1 L846.6 674.6 L851.1 664.9 L855.4 655.1 L859.3 645.2 L863.0 635.2 L866.4 625.1 L869.5 614.9';

// The seal's rings, recreated as clean stroked circles. The source artwork drew
// these as huge filled evenodd annuli; rendering them as strokes is identical to
// the eye, self-draws natively via pathLength, weighs a fraction as much, and
// sidesteps the malformed-coordinate risk of hand-carried path data. Outer pair
// + inner pair = the original "double ring above, double ring below" seal.
const RINGS = [
  { r: 484, w: 3, stroke: 'url(#emblem-ringGold)', opacity: 0.95, delay: 0.0 },
  { r: 470, w: 1.5, stroke: '#CFA23C', opacity: 0.85, delay: 0.08 },
  { r: 270, w: 1.5, stroke: '#CFA23C', opacity: 0.85, delay: 0.26 },
  { r: 259, w: 2.5, stroke: 'url(#emblem-ringGold)', opacity: 0.95, delay: 0.32 },
];

const DIAMONDS_LEFT = [
  '185,485 199,512 185,539 171,512',
  '185,463 190,468 185,473 180,468',
  '185,551 190,556 185,561 180,556',
];
const DIAMONDS_RIGHT = [
  '839,485 853,512 839,539 825,512',
  '839,463 844,468 839,473 834,468',
  '839,551 844,556 839,561 834,556',
];

// Eases: a soft-out for opacity/scale fades, a symmetric in-out for the inked
// strokes so they accelerate off the start and settle at the end like a pen.
const SOFT_OUT = [0.22, 1, 0.36, 1];
const INK = [0.65, 0, 0.35, 1];

export default function EmblemSeal({ phase, reduced }) {
  const { sealStyle, flameStyle, handlers } = useEmblemPointer();

  // Once lit, the flame fill stays lit through reveal/done.
  const igniting = phase === 'igniting' || phase === 'reveal' || phase === 'done';
  const igniteSec = IGNITE_MS / 1000;

  // Per-layer entrance. With reduced motion we hand back `false` for `initial`
  // so every layer mounts already at its final state — no self-draw, no flood.
  const enter = (initial) => (reduced ? false : initial);

  return (
    <motion.div
      className="relative h-full w-full"
      style={sealStyle}
      {...handlers}
    >
      <svg
        viewBox="0 0 1024 1024"
        className="h-full w-full overflow-visible"
        role="img"
        aria-label="Muhammad Abdullah emblem"
      >
        <defs>
          <linearGradient id="emblem-flameText" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#FFE9A0" />
            <stop offset="0.16" stopColor="#FFC93F" />
            <stop offset="0.40" stopColor="#FFA221" />
            <stop offset="0.62" stopColor="#FF7A1C" />
            <stop offset="0.82" stopColor="#F4571A" />
            <stop offset="1" stopColor="#E03C12" />
          </linearGradient>
          <linearGradient id="emblem-ringGold" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#FFF1C6" />
            <stop offset="0.46" stopColor="#FFD45E" />
            <stop offset="1" stopColor="#C7922C" />
          </linearGradient>
          <linearGradient id="emblem-flameMono" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#FFD23E" />
            <stop offset="0.32" stopColor="#FFA21F" />
            <stop offset="0.62" stopColor="#FF6E1C" />
            <stop offset="1" stopColor="#F2401C" />
          </linearGradient>
          <radialGradient id="emblem-bloom" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="#FFE7B0" stopOpacity="0.95" />
            <stop offset="0.35" stopColor="#FF8A1E" stopOpacity="0.7" />
            <stop offset="0.7" stopColor="#FF6D05" stopOpacity="0.25" />
            <stop offset="1" stopColor="#FF6D05" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Whole-seal entrance: a quiet scale-up so nothing pops in cold. */}
        <motion.g
          style={{ transformOrigin: '512px 512px', transformBox: 'view-box' }}
          initial={enter({ opacity: 0, scale: 0.9 })}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: reduced ? 0 : 0.5, ease: SOFT_OUT }}
        >
          {/* (1) The inscription: the double rings stroke themselves on like a
              compass tracing the seal, outer pair first then inner pair. */}
          {RINGS.map((ring) => (
            <motion.circle
              key={ring.r}
              cx={512}
              cy={512}
              r={ring.r}
              fill="none"
              stroke={ring.stroke}
              strokeWidth={ring.w}
              strokeLinecap="round"
              initial={enter({ pathLength: 0, opacity: 0 })}
              animate={{ pathLength: 1, opacity: ring.opacity }}
              transition={{
                delay: reduced ? 0 : ring.delay,
                duration: reduced ? 0 : 1.0,
                ease: INK,
              }}
            />
          ))}

          {/* Invisible arc baselines for the engraved name. */}
          <path id="emblem-topArc" d={TOP_ARC_D} fill="none" />
          <path id="emblem-botArc" d={BOT_ARC_D} fill="none" />

          {/* (3) The name engraves around the arcs, top then bottom. */}
          <motion.text
            fill="url(#emblem-flameText)"
            fontWeight="800"
            fontSize="88"
            letterSpacing="26"
            style={{
              fontFamily:
                "var(--font-montserrat), 'Helvetica Neue', Helvetica, Arial, sans-serif",
            }}
            initial={enter({ opacity: 0 })}
            animate={{ opacity: 1 }}
            transition={{ delay: reduced ? 0 : 0.85, duration: reduced ? 0 : 0.55, ease: SOFT_OUT }}
          >
            <textPath href="#emblem-topArc" startOffset="50%" textAnchor="middle">
              MUHAMMAD
            </textPath>
          </motion.text>
          <motion.text
            fill="url(#emblem-flameText)"
            fontWeight="800"
            fontSize="88"
            letterSpacing="26"
            style={{
              fontFamily:
                "var(--font-montserrat), 'Helvetica Neue', Helvetica, Arial, sans-serif",
            }}
            initial={enter({ opacity: 0 })}
            animate={{ opacity: 1 }}
            transition={{ delay: reduced ? 0 : 1.0, duration: reduced ? 0 : 0.55, ease: SOFT_OUT }}
          >
            <textPath href="#emblem-botArc" startOffset="50%" textAnchor="middle">
              ABDULLAH
            </textPath>
          </motion.text>

          {/* (4) Side diamonds set into place — each group scales from its own
              centre so the ornaments pop where they belong, not from the middle. */}
          <motion.g
            fill="#EFC04A"
            style={{ transformOrigin: '185px 512px', transformBox: 'view-box' }}
            initial={enter({ opacity: 0, scale: 0.4 })}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: reduced ? 0 : 1.15, duration: reduced ? 0 : 0.45, ease: SOFT_OUT }}
          >
            {DIAMONDS_LEFT.map((pts, i) => (
              <polygon key={`l${i}`} points={pts} />
            ))}
          </motion.g>
          <motion.g
            fill="#EFC04A"
            style={{ transformOrigin: '839px 512px', transformBox: 'view-box' }}
            initial={enter({ opacity: 0, scale: 0.4 })}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: reduced ? 0 : 1.2, duration: reduced ? 0 : 0.45, ease: SOFT_OUT }}
          >
            {DIAMONDS_RIGHT.map((pts, i) => (
              <polygon key={`r${i}`} points={pts} />
            ))}
          </motion.g>

          {/* (5 + climax) The flame monogram. The bloom sits behind it; the
              whole group leans toward the cursor a touch more than the seal
              tilts, so it floats above the rings (parallax). */}
          <motion.g style={flameStyle}>
            {/* Core ember bloom — the contained light that becomes the wipe. */}
            <motion.circle
              cx={512}
              cy={520}
              r={150}
              fill="url(#emblem-bloom)"
              style={{ transformOrigin: '512px 520px', transformBox: 'view-box' }}
              initial={{ opacity: 0, scale: 0.4 }}
              animate={
                igniting && !reduced
                  ? { opacity: [0, 0.95, 0.6], scale: [0.4, 1.15, 1.5] }
                  : { opacity: 0, scale: 0.4 }
              }
              transition={{ duration: igniteSec, ease: 'easeOut' }}
            />

            {/* Cool gold outline — the line-art that the fill later overtakes. */}
            {!reduced && (
              <motion.path
                d={MONO_D}
                fill="none"
                stroke="url(#emblem-flameMono)"
                strokeWidth={3}
                fillRule="evenodd"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: igniting ? 0 : 0.95 }}
                transition={{
                  pathLength: { delay: 1.25, duration: 1.05, ease: INK },
                  opacity: igniting
                    ? { duration: igniteSec * 0.5 }
                    : { delay: 1.25, duration: 0.3 },
                }}
              />
            )}

            {/* Molten fill — clip-path floods it up from the base on ignite.
                An SVG element's default clip reference box is its own fill-box,
                so inset(100%→0% from the top) reveals the monogram bottom-up
                within its own bounds. Shown whole under reduced motion. */}
            <motion.path
              d={MONO_D}
              fill="url(#emblem-flameMono)"
              fillRule="evenodd"
              initial={enter({ clipPath: 'inset(100% 0% 0% 0%)' })}
              animate={{
                clipPath:
                  igniting || reduced
                    ? 'inset(0% 0% 0% 0%)'
                    : 'inset(100% 0% 0% 0%)',
              }}
              transition={{ duration: reduced ? 0 : igniteSec * 0.8, ease: INK }}
            />
          </motion.g>
        </motion.g>
      </svg>
    </motion.div>
  );
}
