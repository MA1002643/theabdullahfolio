// The gold→ember "fire" ramp shared by the Architect-of-Enchantment paragraph
// (About) and the contact-page intro. Its stops mirror `.text-fire-amber` in
// globals.css so the copy reads as the same material as the rest of the theme.
//
// WHY THIS EXISTS. Both paragraphs split their copy into per-word spans (for
// their scroll / blur reveals) and clip a gradient to each word individually — a
// word owning its OWN clip is what keeps the fill robust inside GPU-promoted
// layers, where a single `background-clip:text` on the parent <p> rasterises
// once and paints the words regardless of their per-word opacity (the About
// tilt-card bug). The cost of per-word clips is that one gradient can no longer
// span the whole paragraph, so the "starts bright gold, darkens to ember toward
// the end" reading is re-created HERE: each word's vertical sheen is sampled
// from a WINDOW of the ramp that slides along it by the word's position in the
// text. First words sit in the bright-gold end of the ramp; last words sit in
// the deep-ember end — a continuous reading-order darkening, per-word-clip safe.

// Ramp stops as [position 0..1, [r,g,b]]. Matches .text-fire-amber.
const STOPS = [
  { at: 0.0, rgb: [0xff, 0xd2, 0x7d] }, // #ffd27d — bright gold (start)
  { at: 0.4, rgb: [0xff, 0xbb, 0x55] }, // #ffbb55
  { at: 0.7, rgb: [0xff, 0xaa, 0x2a] }, // #ffaa2a
  { at: 1.0, rgb: [0xff, 0x6d, 0x05] }, // #ff6d05 — deep ember (end)
];

// Fraction of the ramp each word's vertical sheen spans. Small enough that the
// slide between words (not the intra-word gradient) carries the darkening, large
// enough that each glyph keeps a molten top→bottom shimmer.
const WINDOW = 0.32;

const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);

// Linear-interpolate the ramp at t ∈ [0,1]; returns a CSS `rgb()` string.
export function rampColor(t) {
  const p = clamp01(t);
  let lo = STOPS[0];
  let hi = STOPS[STOPS.length - 1];
  for (let i = 0; i < STOPS.length - 1; i += 1) {
    if (p >= STOPS[i].at && p <= STOPS[i + 1].at) {
      lo = STOPS[i];
      hi = STOPS[i + 1];
      break;
    }
  }
  const span = hi.at - lo.at || 1;
  const k = (p - lo.at) / span;
  const ch = (c) => Math.round(lo.rgb[c] + (hi.rgb[c] - lo.rgb[c]) * k);
  return `rgb(${ch(0)}, ${ch(1)}, ${ch(2)})`;
}

// Per-word clipped fill. `i` / `total` place the word along the paragraph so the
// copy darkens from gold (first words) to ember (last words) in reading order.
// Both edges are sampled from the SAME ramp, so the whole paragraph still reads
// as one continuous fire rather than a set of independently-shaded words.
export function wordFill(i, total) {
  const t = total > 1 ? i / (total - 1) : 0;
  const top = t * (1 - WINDOW); // window slides bright→dark as t goes 0→1
  return {
    backgroundImage: `linear-gradient(180deg, ${rampColor(top)} 0%, ${rampColor(top + WINDOW)} 100%)`,
    WebkitBackgroundClip: 'text',
    backgroundClip: 'text',
    color: 'transparent',
    WebkitTextFillColor: 'transparent',
  };
}
