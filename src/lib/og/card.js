/* eslint-disable @next/next/no-img-element, jsx-a11y/alt-text --
   This JSX is rendered by satori (next/og) into a PNG, not by the DOM:
   next/image cannot exist there, and the accessible text for these
   images lives at the metadata layer (og:image:alt), not inside the
   bitmap. */
import { monogramDataUri, badgeDataUri } from './assets';

// Share-card compositions (issue #88 v2). Every card that leaves this
// site is typeset here, in the brand's own ink: the headline gradient is
// the exact four-stop ramp `.hero` paints MUHAMMAD ABDULLAH with
// (globals.css), on the same `#0a0a0a` ground, with the ember `#ff6d05`
// reserved — as on the site — for what is alive.
//
// These trees are rendered by satori (next/og), not a browser: every
// multi-child div must declare display:flex, and only the flex subset
// of CSS exists. Keep compositions restrained — dark ground, one wash
// of light, typography doing the work.

const BG = '#0a0a0a';
const EMBER = '#ff6d05';
const INK = 'linear-gradient(180deg, #ffd7a8 0%, #ff8a2b 46%, #ff6d05 74%, #c73b00 100%)';
const MUTED = '#8f8f8f';
const FAINT = '#6b6b6b';
const HAIRLINE = 'rgba(255,255,255,0.07)';

const gradientText = {
  backgroundImage: INK,
  backgroundClip: 'text',
  color: 'transparent',
};

// monogram.png is 552x480; satori requires explicit img dimensions.
const MONO_W = 552 / 480;
const mono = (h) => ({ height: h, width: Math.round(h * MONO_W) });

/** Root frame: dark ground, restrained ember wash, inset hairline. */
function frame({ width, height, children, washY = '44%' }) {
  return (
    <div
      style={{
        width,
        height,
        display: 'flex',
        position: 'relative',
        backgroundColor: BG,
        backgroundImage: `radial-gradient(circle at 50% ${washY}, rgba(255,109,5,0.13) 0%, rgba(255,109,5,0.04) 40%, rgba(255,109,5,0) 66%)`,
        fontFamily: 'Inter',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 26,
          left: 26,
          right: 26,
          bottom: 26,
          border: `1px solid ${HAIRLINE}`,
          display: 'flex',
        }}
      />
      {children}
    </div>
  );
}

function wordmark({ right = 52, bottom = 44 }) {
  return (
    <div
      style={{
        position: 'absolute',
        right,
        bottom,
        fontSize: 20,
        letterSpacing: 8,
        color: FAINT,
      }}
    >
      ma.codes
    </div>
  );
}

/**
 * Homepage card. `segments` is the live strip from fetchLiveSignals();
 * with no segments the card falls back to the pure identity composition,
 * which is the guarantee that lets the live fetch fail soft.
 */
export async function homeCard({ segments = [], live = false, square = false }) {
  const monogram = await monogramDataUri();
  const W = 1200;
  const H = square ? 1200 : 630;
  const nameLines = square ? ['MUHAMMAD', 'ABDULLAH'] : ['MUHAMMAD ABDULLAH'];

  return frame({
    width: W,
    height: H,
    washY: square ? '40%' : '44%',
    children: (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          paddingBottom: square ? 40 : 30,
        }}
      >
        <img
          src={monogram}
          {...mono(square ? 240 : 168)}
          style={{ marginBottom: square ? 48 : 34 }}
        />
        {nameLines.map((line) => (
          <div
            key={line}
            style={{
              display: 'flex',
              fontFamily: 'Montserrat',
              fontSize: square ? 104 : 76,
              letterSpacing: square ? 4 : 2,
              lineHeight: 1.08,
              ...gradientText,
            }}
          >
            {line}
          </div>
        ))}
        <div
          style={{
            display: 'flex',
            marginTop: square ? 34 : 24,
            fontSize: square ? 28 : 24,
            letterSpacing: 13,
            color: MUTED,
          }}
        >
          SOFTWARE ENGINEER
        </div>
        {segments.length > 0 ? (
          <div
            style={{
              position: 'absolute',
              bottom: square ? 96 : 78,
              left: 0,
              right: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 16,
            }}
          >
            {live ? (
              <div
                style={{
                  display: 'flex',
                  width: 11,
                  height: 11,
                  borderRadius: 6,
                  backgroundColor: EMBER,
                  boxShadow: '0 0 14px rgba(255,109,5,0.9)',
                }}
              />
            ) : null}
            <div
              style={{
                display: 'flex',
                fontSize: 21,
                letterSpacing: 3,
                color: '#c9c9c9',
              }}
            >
              {segments.join('   ·   ')}
            </div>
          </div>
        ) : null}
        {wordmark({ bottom: square ? 44 : 40 })}
      </div>
    ),
  });
}

/** Section card: /about, /projects, /qualifications, /contact. */
export async function sectionCard({ label, tagline }) {
  const monogram = await monogramDataUri();

  return frame({
    width: 1200,
    height: 630,
    washY: '40%',
    children: (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          paddingBottom: 24,
        }}
      >
        <img src={monogram} {...mono(116)} style={{ marginBottom: 36 }} />
        <div
          style={{
            display: 'flex',
            fontFamily: 'Montserrat',
            fontSize: 112,
            letterSpacing: 6,
            ...gradientText,
          }}
        >
          {label.toUpperCase()}
        </div>
        <div
          style={{
            display: 'flex',
            marginTop: 26,
            fontSize: 26,
            letterSpacing: 2,
            color: MUTED,
            maxWidth: 900,
            textAlign: 'center',
          }}
        >
          {tagline}
        </div>
        <div
          style={{
            position: 'absolute',
            bottom: 78,
            left: 0,
            right: 0,
            display: 'flex',
            justifyContent: 'center',
            fontSize: 20,
            letterSpacing: 6,
            color: FAINT,
          }}
        >
          MUHAMMAD ABDULLAH · SOFTWARE ENGINEER
        </div>
        {wordmark({ bottom: 40 })}
      </div>
    ),
  });
}

/** Per-project poster: /projects/[id]. */
export async function projectCard({ name, category, description, id }) {
  const monogram = await monogramDataUri();
  // Brand casing is kept (AfaaqX, vigil…); size steps down for long names.
  const nameSize = name.length > 13 ? 76 : 96;

  return frame({
    width: 1200,
    height: 630,
    washY: '50%',
    children: (
      <div style={{ width: '100%', height: '100%', display: 'flex' }}>
        <img
          src={monogram}
          {...mono(560)}
          style={{
            position: 'absolute',
            right: -60,
            top: 60,
            opacity: 0.09,
          }}
        />
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            padding: '0 96px',
            width: '100%',
          }}
        >
          <div style={{ display: 'flex' }}>
            <div
              style={{
                display: 'flex',
                border: '1px solid rgba(255,109,5,0.45)',
                borderRadius: 999,
                padding: '10px 24px',
                fontSize: 20,
                letterSpacing: 6,
                color: EMBER,
              }}
            >
              {category.toUpperCase()}
            </div>
          </div>
          <div
            style={{
              display: 'flex',
              marginTop: 34,
              fontFamily: 'Montserrat',
              fontSize: nameSize,
              lineHeight: 1.05,
              ...gradientText,
            }}
          >
            {name}
          </div>
          <div
            style={{
              display: 'flex',
              marginTop: 26,
              fontSize: 30,
              lineHeight: 1.45,
              color: '#b9b9b9',
              maxWidth: 780,
            }}
          >
            {description}
          </div>
          <div
            style={{
              display: 'flex',
              marginTop: 46,
              fontSize: 20,
              letterSpacing: 3,
              color: FAINT,
            }}
          >
            {`MUHAMMAD ABDULLAH   ·   ma.codes/projects/${id}`}
          </div>
        </div>
      </div>
    ),
  });
}

export { badgeDataUri };
