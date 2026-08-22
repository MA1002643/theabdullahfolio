/* eslint-disable @next/next/no-img-element, jsx-a11y/alt-text --
   This JSX is rendered by satori (next/og) into a PNG, not by the DOM:
   next/image cannot exist there, and the accessible text for these
   images lives at the metadata layer (og:image:alt), not inside the
   bitmap. */
import { monogramDataUri, badgeDataUri } from './assets';

// Share-card compositions (issue #88 v2, reworked for the brand-seal
// system). Every card that leaves this site is typeset here, in the
// brand's own ink: the headline gradient is the exact four-stop ramp
// `.hero` paints MUHAMMAD ABDULLAH with (globals.css), on the same
// `#0a0a0a` ground, and the mark on every card is the full Muhammad
// Abdullah seal — the same circular badge the intro loader inscribes
// (EmblemSeal.jsx) and the app icons carry, so a share card, a favicon
// and the site itself are recognisably one object.
//
// Supporting text is no longer flat grey: taglines and descriptions set
// in a warm parchment ramp (SUPPORT_INK) and identity lines in a soft
// ember (ACCENT), both quiet enough that the headline gradient stays
// the loudest thing on the card, both comfortably AAA against #0a0a0a.
//
// These trees are rendered by satori (next/og), not a browser: every
// multi-child div must declare display:flex, and only the flex subset
// of CSS exists. Keep compositions restrained — dark ground, one wash
// of light, typography doing the work.

const BG = '#0a0a0a';
const EMBER = '#ff6d05';
const INK = 'linear-gradient(180deg, #ffd7a8 0%, #ff8a2b 46%, #ff6d05 74%, #c73b00 100%)';
// Warm parchment ramp for taglines/descriptions — colour and luminosity
// without competing with the headline INK.
const SUPPORT_INK = 'linear-gradient(180deg, #f2e2cd 0%, #e0c3a3 55%, #c69a72 100%)';
// Soft ember for identity lines / chips — brighter than parchment,
// dimmer than the headline.
const ACCENT = '#ffb166';
// Warm faint for the ma.codes wordmark and quiet furniture.
const FAINT = '#8a7462';
const MUTED_WARM = '#d9c7b2';
// The inset frame hairline, warmed to match the seal's gold.
const HAIRLINE = 'rgba(255, 176, 102, 0.12)';

const gradientText = {
  backgroundImage: INK,
  backgroundClip: 'text',
  color: 'transparent',
};

const supportText = {
  backgroundImage: SUPPORT_INK,
  backgroundClip: 'text',
  color: 'transparent',
};

// The seal artwork (monogram.png) is square — 1024x1024 with the badge
// content at ~95% — and satori requires explicit img dimensions.
const seal = (h) => ({ height: h, width: h });

/** Root frame: dark ground, restrained ember wash, warmed inset hairline. */
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

/** Short gradient hairline used to flank identity/role lines. */
function flankRule({ flip = false } = {}) {
  return (
    <div
      style={{
        display: 'flex',
        width: 56,
        height: 1,
        backgroundImage: `linear-gradient(${flip ? 270 : 90}deg, rgba(255,177,102,0) 0%, rgba(255,177,102,0.55) 100%)`,
      }}
    />
  );
}

/** The personal-brand identity line: NAME · ROLE, two-tone. */
function identityLine({ fontSize = 20 }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 18,
      }}
    >
      <div style={{ display: 'flex', fontSize, letterSpacing: 4, color: MUTED_WARM }}>
        MUHAMMAD ABDULLAH
      </div>
      <div style={{ display: 'flex', fontSize, color: EMBER }}>·</div>
      <div style={{ display: 'flex', fontSize, letterSpacing: 4, color: ACCENT }}>
        SOFTWARE ENGINEER
      </div>
    </div>
  );
}

/**
 * Homepage card. `segments` is the live strip from fetchLiveSignals();
 * with no segments the card falls back to the pure identity composition,
 * which is the guarantee that lets the live fetch fail soft.
 */
export async function homeCard({ segments = [], live = false, square = false }) {
  const sealArt = await monogramDataUri();
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
          src={sealArt}
          {...seal(square ? 330 : 236)}
          style={{ marginBottom: square ? 40 : 28 }}
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
            alignItems: 'center',
            gap: 22,
            marginTop: square ? 32 : 24,
          }}
        >
          {flankRule()}
          <div
            style={{
              display: 'flex',
              fontSize: square ? 28 : 24,
              letterSpacing: 13,
              color: ACCENT,
            }}
          >
            SOFTWARE ENGINEER
          </div>
          {flankRule({ flip: true })}
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
                color: MUTED_WARM,
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
  const sealArt = await monogramDataUri();

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
        <img src={sealArt} {...seal(168)} style={{ marginBottom: 30 }} />
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
            marginTop: 24,
            fontSize: 27,
            letterSpacing: 1,
            lineHeight: 1.5,
            maxWidth: 900,
            textAlign: 'center',
            ...supportText,
          }}
        >
          {tagline}
        </div>
        {/* bottom 58, not 74: every section tagline wraps to two lines at
            this measure, and 74 left the identity line crowding the copy.
            The wordmark (bottom 40, right corner) shares the band but not
            the horizontal span. */}
        <div
          style={{
            position: 'absolute',
            bottom: 58,
            left: 0,
            right: 0,
            display: 'flex',
            justifyContent: 'center',
          }}
        >
          {identityLine({ fontSize: 19 })}
        </div>
        {wordmark({ bottom: 40 })}
      </div>
    ),
  });
}

/** Per-project poster: /projects/[id]. */
export async function projectCard({ name, category, description, date }) {
  const sealArt = await monogramDataUri();
  // Brand casing is kept (AfaaqX, vigil…); size steps down for long names.
  const nameSize = name.length > 13 ? 76 : 96;
  const year = typeof date === 'string' ? date.slice(0, 4) : null;

  return frame({
    width: 1200,
    height: 630,
    washY: '50%',
    children: (
      <div style={{ width: '100%', height: '100%', display: 'flex' }}>
        {/* The seal as a quiet watermark: oversized and cropped off the right
            edge so the arc text reads as engraved texture, not as competing
            copy. Opacity keeps it a layer of the ground, never the subject. */}
        <img
          src={sealArt}
          {...seal(700)}
          style={{
            position: 'absolute',
            right: -150,
            top: -35,
            opacity: 0.1,
          }}
        />
        {year ? (
          <div
            style={{
              position: 'absolute',
              top: 52,
              right: 56,
              display: 'flex',
              fontSize: 19,
              letterSpacing: 6,
              color: FAINT,
            }}
          >
            {year}
          </div>
        ) : null}
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
                backgroundColor: 'rgba(255,109,5,0.08)',
                borderRadius: 999,
                padding: '10px 24px',
                fontSize: 20,
                letterSpacing: 6,
                color: '#ff9a4d',
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
              maxWidth: 780,
              ...supportText,
            }}
          >
            {description}
          </div>
          <div
            style={{
              display: 'flex',
              marginTop: 44,
              width: 64,
              height: 2,
              backgroundImage:
                'linear-gradient(90deg, rgba(255,109,5,0.9) 0%, rgba(255,109,5,0) 100%)',
            }}
          />
          <div style={{ display: 'flex', marginTop: 22 }}>
            {identityLine({ fontSize: 19 })}
          </div>
        </div>
      </div>
    ),
  });
}

/**
 * The /my-past card — the university-era portfolio, framed as the first
 * chapter of the same brand: the seal above, the era's raw materials
 * (HTML · CSS · JAVASCRIPT) set as quiet tokens below, and the same
 * identity line as every other card so the journey visibly ends here.
 */
export async function myPastCard() {
  const sealArt = await monogramDataUri();
  const tokens = ['HTML', 'CSS', 'JAVASCRIPT'];

  return frame({
    width: 1200,
    height: 630,
    washY: '42%',
    children: (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          paddingBottom: 18,
        }}
      >
        <img src={sealArt} {...seal(132)} style={{ marginBottom: 24 }} />
        <div
          style={{
            display: 'flex',
            fontFamily: 'Montserrat',
            fontSize: 104,
            letterSpacing: 6,
            ...gradientText,
          }}
        >
          MY PAST
        </div>
        <div
          style={{
            display: 'flex',
            marginTop: 22,
            fontSize: 27,
            letterSpacing: 1,
            lineHeight: 1.5,
            maxWidth: 880,
            textAlign: 'center',
            ...supportText,
          }}
        >
          The university-era portfolio where the journey began — hand-built
          for the open web, kept as the first chapter of this one.
        </div>
        <div style={{ display: 'flex', gap: 16, marginTop: 30 }}>
          {tokens.map((t) => (
            <div
              key={t}
              style={{
                display: 'flex',
                border: '1px solid rgba(255,177,102,0.35)',
                borderRadius: 8,
                padding: '9px 22px',
                fontSize: 18,
                letterSpacing: 5,
                color: MUTED_WARM,
              }}
            >
              {t}
            </div>
          ))}
        </div>
        {/* In flow, not absolute: this card's centred column is the tallest
            of the section-style compositions (title + tagline + tokens), and
            an absolutely-anchored footer line collides with the tokens the
            moment the tagline wraps. Flow keeps the rhythm collision-proof. */}
        <div style={{ display: 'flex', marginTop: 34 }}>
          {identityLine({ fontSize: 19 })}
        </div>
        {wordmark({ bottom: 40 })}
      </div>
    ),
  });
}

export { badgeDataUri };
