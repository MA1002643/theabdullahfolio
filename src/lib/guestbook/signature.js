// Ink-signature path grammar (issue #40 Phase 3). A signature is stored as ONE
// normalised SVG path string, and that string is untrusted user input that
// ends up in the DOM — so both sides of the wire run the same strict
// validator: the API route before storage, SignatureGlyph before render.
//
// Grammar (deliberately far narrower than SVG's):
//   • commands: uppercase M, L, Q, C, Z only
//   • numbers: 0–100, at most 2 decimals, optional leading minus rejected by
//     the range check (nothing legitimate is ever negative)
//   • separators: spaces and/or commas
//   • must start with M, contain at least one drawing command (L/Q/C), and
//     stay under MAX_SIGNATURE_BYTES / MAX_SIGNATURE_COMMANDS
//
// Anything else — transforms, arcs, scientific notation, e/E, url(), quotes —
// fails the tokenizer and the whole signature is rejected outright.

export const SIGNATURE_VIEWBOX = { width: 100, height: 40 };
export const MAX_SIGNATURE_BYTES = 4096;
export const MAX_SIGNATURE_COMMANDS = 400;

// How many coordinate numbers each command consumes.
const ARITY = { M: 2, L: 2, Q: 4, C: 6, Z: 0 };

const NUMBER_RE = /^\d{1,3}(?:\.\d{1,2})?$/;

function isValidNumber(token) {
  if (!NUMBER_RE.test(token)) return false;
  const n = Number(token);
  return n >= 0 && n <= 100;
}

// Boolean validator — shared verbatim by server (store gate) and client
// (render gate), so a payload that slips past one can never pass the other.
export function isValidSignaturePath(d) {
  if (typeof d !== 'string') return false;
  const trimmed = d.trim();
  if (!trimmed) return false;
  // Byte cap, not char cap — the grammar is ASCII-only anyway, but measure
  // honestly so a multi-byte smuggle can't dodge the limit.
  if (new TextEncoder().encode(trimmed).length > MAX_SIGNATURE_BYTES) {
    return false;
  }

  const tokens = trimmed.replace(/,/g, ' ').split(/\s+/);
  let i = 0;
  let commands = 0;
  let drawCommands = 0;

  if (tokens[0] !== 'M') return false;

  while (i < tokens.length) {
    const cmd = tokens[i];
    const arity = ARITY[cmd];
    if (arity === undefined) return false;
    i += 1;
    for (let n = 0; n < arity; n += 1, i += 1) {
      if (i >= tokens.length || !isValidNumber(tokens[i])) return false;
    }
    commands += 1;
    if (cmd === 'L' || cmd === 'Q' || cmd === 'C') drawCommands += 1;
    if (commands > MAX_SIGNATURE_COMMANDS) return false;
  }

  return drawCommands >= 1;
}

// Preset "marks" — the no-pointer / reduced-motion alternative to drawing
// (issue #40 Phase 3), and the keyboard-reachable option for everyone else.
// Hand-authored in the 100×40 signature space; every path here must pass
// isValidSignaturePath, which the unit tests assert so a preset can never
// drift out of the grammar it is the fallback for.
export const PRESET_MARKS = [
  {
    id: 'flourish',
    label: 'Flourish',
    d: 'M 10 30 C 30 5 45 5 55 20 C 62 30 75 32 90 12',
  },
  {
    id: 'wave',
    label: 'Wave',
    d: 'M 10 25 Q 20 10 30 25 Q 40 40 50 25 Q 60 10 70 25 Q 80 40 90 25',
  },
  {
    id: 'spark',
    label: 'Spark',
    d: 'M 50 6 L 50 34 M 36 11 L 64 29 M 64 11 L 36 29',
  },
  {
    id: 'orbit',
    label: 'Orbit',
    d: 'M 50 10 C 74 10 90 14 90 20 C 90 28 72 34 50 34 C 26 34 10 28 10 20 C 10 13 28 10 50 10 Z',
  },
];
