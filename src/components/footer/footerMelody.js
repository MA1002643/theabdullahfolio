// Melody for the footer "guitar" (issue #30).
//
// COPYRIGHT NOTE — read before editing:
// This is an ORIGINAL melodic line, composed here. A musical SCALE/mode (here a
// warm major/Ionian) is public-domain music theory — a framework, not a
// composition — so writing a fresh phrase over it is original work. The phrase is
// meant to feel like a soft, romantic, fingerpicked ballad in the mood of a
// Pakistani/Indian love song, WITHOUT reproducing any specific copyrighted song's
// tune (a melody is protected expression, same as lyrics). If you want a
// particular song, DON'T transcribe a copyrighted one here — replace the NOTES
// with a sequence you hold the rights to, or a genuinely traditional/public-
// domain melody.
//
// How it's used:
//   • Desktop HOVER performs the phrase by hand — one pitch per pluck, in order,
//     looping — so the RHYTHM comes from how you sweep the cursor (see MELODY).
//   • Mobile / touch AUTO-PLAY has no hand to set the timing, so it performs
//     PERFORMANCE, which carries real musical phrasing per note: a DURATION (long
//     held resolutions vs flowing arpeggio runs), a VELOCITY (soft passing tones
//     swelling gently to the romantic peak), and a short REST ("breath") at each
//     phrase boundary — so the self-play reads as someone playing, not a tick.

const TONIC = 220; // "do" = A3 — a warm, singable register for the ballad
const semi = (n) => TONIC * Math.pow(2, n / 12);

// A warm MAJOR (Ionian) scale — the most consonant, peaceful, romantic palette;
// no clashing intervals, so any arpeggio across it sounds sweet. Degrees are
// solfège-ish (S=do, R=re, G=mi, M=fa, P=sol, D=la, N=ti) across a low tail, the
// home octave, and the octave above.
const DEG = {
  'P.': semi(-5), // sol, (a 5th below — a warm low anchor)
  'D.': semi(-3), // la,
  S: semi(0), // do
  R: semi(2), // re
  G: semi(4), // mi
  M: semi(5), // fa
  P: semi(7), // sol
  D: semi(9), // la
  N: semi(11), // ti (leading tone → romantic pull up to do')
  "S'": semi(12), // do'
  "R'": semi(14), // re'
  "G'": semi(16), // mi'
  "P'": semi(19), // sol'
};

// The phrase, as [degree, beats, velocity, restAfterBeats?]. An original, gently
// arpeggiated love theme: a tender opening around the home triad, a yearning
// climb to the octave, a soft float at the romantic peak (r'), then a settled
// fall home to a long-held "do". Durations breathe (held cadences, flowing runs),
// dynamics stay soft and swell only to the peak — an unhurried, romantic feel.
// The pitch ORDER is what desktop hover plays; the beats/velocity/breaths shape
// the touch self-play.
const NOTES = [
  // Line 1 — tender opening: rise through the triad to la, sigh back, resolve.
  ['S', 1.5, 0.42], ['G', 0.75, 0.4], ['P', 0.75, 0.44], ['D', 1.5, 0.48],
  ['P', 0.75, 0.42], ['G', 0.75, 0.4], ['R', 1, 0.42], ['S', 2, 0.44, 1],
  // Line 2 — a yearning climb up to the octave via the leading tone.
  ['G', 0.75, 0.44], ['P', 0.75, 0.46], ['D', 0.75, 0.5], ['N', 0.75, 0.52],
  ["S'", 2, 0.58], ['N', 0.75, 0.5], ['D', 0.75, 0.48], ['P', 1.5, 0.46, 1],
  // Line 3 — the romantic peak: floats around the octave, high point on re'.
  ['D', 0.75, 0.5], ["S'", 1, 0.56], ["R'", 2, 0.62], ["S'", 1, 0.54],
  ['N', 0.75, 0.5], ['D', 0.75, 0.48], ['P', 0.75, 0.46], ['M', 1.5, 0.44, 1],
  // Line 4 — a tender descent and a warm cadence back to "do".
  ['G', 0.75, 0.44], ['M', 0.75, 0.44], ['P', 1, 0.48], ['D', 1.5, 0.5],
  ['P', 0.75, 0.44], ['G', 0.75, 0.42], ['R', 1, 0.42], ['S', 2.5, 0.44, 1],
  // Line 5 — a gentle closing echo, dipping low, resolving home (long, + loop breath).
  ['P', 1, 0.44], ['G', 1, 0.42], ['S', 1, 0.42], ['D.', 1.5, 0.4],
  ['S', 0.75, 0.42], ['R', 0.75, 0.42], ['G', 1, 0.42], ['S', 3, 0.42, 2],
];

// One "beat" in ms — the base pulse the durations multiply. ~260ms is an
// unhurried, relaxing lilt (a full loop is ~13s). Raise to slow further.
const BASE_BEAT = 260;

// Pitch-only sequence for desktop hover — plucking the letters performs the
// phrase in order; the cursor sets the rhythm.
export const MELODY = NOTES.map(([d]) => DEG[d]);

// Fully-phrased performance for the mobile self-play: frequency + how long to
// hold before the next note (dur) + a trailing breath (restAfter) + how softly to
// pluck (vel, also drives the visual strum accent). Times are pre-baked to ms.
export const PERFORMANCE = NOTES.map(([d, beats, vel, restBeats = 0]) => ({
  freq: DEG[d],
  vel,
  dur: beats * BASE_BEAT,
  restAfter: restBeats * BASE_BEAT,
}));
