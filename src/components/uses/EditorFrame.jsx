'use client';

import { motion } from 'framer-motion';
import { useCardTilt } from '@/hooks/useCardTilt';
import { USES_FLAGS } from '@/lib/flags';
import { staged, useStagedReveal } from './useStagedReveal';

// A hand-built editor "screen" (issue #37 §9E) — DOM, not a screenshot. A PNG
// would be blurry at 2× and stale in a month; this is crisp at any DPR, ~1KB,
// themable, and it is LITERALLY the same array the palette's "copy my editor
// settings" action writes to the clipboard, so what you see is what you copy.
// Recruiters who open DevTools find code, not a picture of code.
//
// Colours are the real theme's token colours (Dracula — the theme the owner's
// settings.json names), painted on the theme's own background: this is a
// depiction of a real screen, the one place on the site a second palette is
// honest. The window dots are grey, not traffic-light colours. Lines are
// sanitised at the data layer (no tokens, no paths, no account names).
//
// Reveal (owner correction 2026-09-06): the frame OPENS on its own viewport
// gate — a clip wipe unrolls it top→bottom as it rises — and the excerpt
// then TYPES ITSELF: each line is a clip-path wipe left→right at 11ms per
// character (monospace, so a linear wipe IS uniform typing), a caret riding
// the wipe front, lines in sequence with a 70ms return between them, and a
// resting caret that blinks three times at the end of the last line and
// goes dark (no loop on an always-visible surface). Gutter numbers light as
// their line starts; the status bar's items fade in once typing ends. All
// text is real DOM the whole time — selectable, crawlable, copyable — the
// wipe only paints it in. Reduced motion: fully typed, still, no carets.
//
// The frame reads as a physical object, so it carries the ±4° tilt (the
// second of the two tilting surfaces; inert on touch / reduced motion by the
// hook's own gate, killable via USES_FLAGS.tilt).

// A tiny JSON tokenizer — enough for a settings excerpt. A string followed by
// a colon is a key; everything else is a string / number / literal / punct.
const TOKEN_RE =
  /("(?:[^"\\]|\\.)*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?)|([{}[\],:])|(\s+)|([^\s"{}[\],:]+)/g;

export function tokenizeJsonLine(line) {
  const out = [];
  let m;
  TOKEN_RE.lastIndex = 0;
  while ((m = TOKEN_RE.exec(line)) !== null) {
    if (m[1] !== undefined) {
      if (m[2] !== undefined) {
        out.push({ type: 'key', text: m[1] });
        out.push({ type: 'punct', text: m[2] });
      } else {
        out.push({ type: 'str', text: m[1] });
      }
    } else if (m[3] !== undefined) out.push({ type: 'bool', text: m[3] });
    else if (m[4] !== undefined) out.push({ type: 'num', text: m[4] });
    else if (m[5] !== undefined) out.push({ type: 'punct', text: m[5] });
    else if (m[6] !== undefined) out.push({ type: 'ws', text: m[6] });
    else out.push({ type: 'plain', text: m[7] });
  }
  return out;
}

const OPEN_S = 0.65; // the frame unrolls
const TYPE_START_S = 0.4; // first keystroke, after the frame has opened
const CHAR_S = 0.011;
const LINE_GAP_S = 0.07; // the "return" between lines
const MIN_LINE_S = 0.12;
// The unroll clips an INNER screen wrapper, never the <figure> the viewport
// gate observes: Chromium's IntersectionObserver applies the target's own
// clip-path, and a shut clip has no area — a self-clipped frame would never
// be seen to arrive, and so never open (found on the first probe,
// 2026-09-06). The figure's glow lives outside the wrapper, so no bleed is
// needed either.
const OPEN_CLIP = 'inset(0 0 0% 0)';
const SHUT_CLIP = 'inset(0 0 100% 0)';

// When each line starts typing and for how long — pure, so the schedule is
// the same on the server and the client.
export function typingSchedule(lines) {
  let t = TYPE_START_S;
  const rows = lines.map((line) => {
    const dur = Math.max(MIN_LINE_S, line.length * CHAR_S);
    const start = t;
    t += dur + LINE_GAP_S;
    return { start, dur };
  });
  return { rows, end: t };
}

// The resting caret: three blinks, then dark. Paired times give hard on/off
// steps rather than a fade. The list STARTS at 0: framer holds a keyframe
// animation's first value through its delay, so a list starting at 1 lit
// the resting caret while the lines above were still typing.
const BLINK = {
  opacity: [0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0],
  times: [0, 0.01, 0.16, 0.17, 0.33, 0.34, 0.5, 0.51, 0.66, 0.67, 0.83, 0.84, 1],
  duration: 3,
};

export default function EditorFrame({
  frame,
  revealed,
  reduceMotion,
  revealedAtRef,
}) {
  const tilt = useCardTilt({ maxTilt: 4 });
  const tiltOn = USES_FLAGS.tilt && tilt.enabled;
  const { fileName, theme, lines, status = [] } = frame;
  const { ref, on, delay } = useStagedReveal({
    revealed,
    reduceMotion,
    revealedAtRef,
    amount: 0.2,
  });
  const { rows, end: typedEnd } = typingSchedule(lines);
  const at = (offset, duration, ease) =>
    staged(reduceMotion, delay, offset, duration, ease);

  return (
    <motion.figure
      ref={ref}
      className="uses-anim uses-editor relative isolate m-0 overflow-hidden rounded-xl"
      style={tiltOn ? tilt.style : undefined}
      initial={reduceMotion ? false : { opacity: 0, y: 16 }}
      animate={on ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 }}
      transition={at(0, OPEN_S)}
      {...(tiltOn ? tilt.handlers : {})}
    >
      {tiltOn ? (
        <motion.div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-10 rounded-xl"
          style={tilt.glareStyle}
        />
      ) : null}

      <figcaption className="sr-only">
        An excerpt of my VS Code {fileName}, shown in the {theme} theme.
      </figcaption>

      {/* The screen — unrolls top→bottom as the frame arrives. */}
      <motion.div
        className="uses-anim-clip uses-editor__screen"
        initial={reduceMotion ? false : { clipPath: SHUT_CLIP }}
        animate={{ clipPath: on ? OPEN_CLIP : SHUT_CLIP }}
        transition={at(0, OPEN_S)}
      >
        {/* Window chrome — inert grey dots, the open tab. Decorative. */}
        <div className="uses-editor__bar" aria-hidden="true">
          <span className="uses-editor__dots">
            <i />
            <i />
            <i />
          </span>
          <span className="uses-editor__tab">
            <span className="uses-editor__tabdot" />
            {fileName}
          </span>
        </div>

        {/* Real text in a real <pre>: selectable, crawlable, copyable. The
          gutter numbers are decorative and hidden from AT. */}
        <pre className="uses-editor__code m-0">
          {lines.map((line, i) => {
            const { start, dur } = rows[i];
            const last = i === lines.length - 1;
            return (
              <div key={i} className="uses-editor__line">
                <motion.span
                  className="uses-anim uses-editor__gutter"
                  aria-hidden="true"
                  initial={reduceMotion ? false : { opacity: 0 }}
                  animate={{ opacity: on ? 1 : 0 }}
                  transition={at(start, 0.2)}
                >
                  {i + 1}
                </motion.span>
                {/* Shrink-to-fit wrapper (`justify-self: start`): the wipe runs
                  over the TEXT's width, so 0→100% is one keystroke per
                  character however wide the column is. */}
                <span className="uses-editor__typed">
                  <motion.code
                    className="uses-anim uses-anim-clip"
                    initial={
                      reduceMotion ? false : { clipPath: 'inset(0 100% 0 0)' }
                    }
                    animate={{
                      clipPath: on ? 'inset(0 0% 0 0)' : 'inset(0 100% 0 0)',
                    }}
                    transition={at(start, dur, 'linear')}
                  >
                    {tokenizeJsonLine(line).map((tok, k) => (
                      <span key={k} className={`tok-${tok.type}`}>
                        {tok.text}
                      </span>
                    ))}
                  </motion.code>
                  {reduceMotion ? null : (
                    <motion.span
                      aria-hidden="true"
                      className="uses-caret"
                      initial={{ left: '0%', opacity: 0 }}
                      animate={
                        on
                          ? { left: '100%', opacity: [0, 1, 1, 0] }
                          : { left: '0%', opacity: 0 }
                      }
                      transition={{
                        left: {
                          duration: dur,
                          delay: delay + start,
                          ease: 'linear',
                        },
                        opacity: {
                          duration: dur,
                          delay: delay + start,
                          times: [0, 0.02, 0.98, 1],
                          ease: 'linear',
                        },
                      }}
                    />
                  )}
                  {last && !reduceMotion ? (
                    <motion.span
                      aria-hidden="true"
                      className="uses-caret"
                      style={{ left: '100%' }}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: on ? BLINK.opacity : 0 }}
                      transition={{
                        duration: BLINK.duration,
                        delay: delay + start + dur,
                        times: BLINK.times,
                        ease: 'linear',
                      }}
                    />
                  ) : null}
                </span>
              </div>
            );
          })}
        </pre>

        {/* Status bar — the real theme, encoding, indentation and formatter. */}
        <div className="uses-editor__status" aria-hidden="true">
          {status.map((s, i) => (
            <motion.span
              key={s}
              className="uses-anim"
              initial={reduceMotion ? false : { opacity: 0, y: 4 }}
              animate={on ? { opacity: 1, y: 0 } : { opacity: 0, y: 4 }}
              transition={at(typedEnd + i * 0.08, 0.4)}
            >
              {s}
            </motion.span>
          ))}
        </div>
      </motion.div>
    </motion.figure>
  );
}
