import {
  Inter,
  Montserrat,
  Noto_Sans_Arabic,
  Noto_Sans_Devanagari,
  Noto_Sans_Hebrew,
  Varela_Round,
} from 'next/font/google';
import { localeInfo } from './locales';

// Fonts, and how each locale's script reaches them (issue #82).
//
// The three brand faces cover Latin, Latin-ext and Cyrillic (Inter) — enough
// for 13 of the 20 locales with no change at all. The rest are composed per
// locale by OVERRIDING the brand font variables on <body>, so no component and
// no CSS rule had to change: everything that already says
// `font-family: var(--font-inter)` simply receives a longer chain.
//
//   arabic / hebrew / devanagari — a self-hosted Noto face goes FIRST. Its
//     @font-face rules carry a script-only `unicode-range`, so Latin
//     characters (names, "Next.js", numerals in a Latin run) skip it and fall
//     through to Inter. It must lead rather than follow: next/font's
//     metric-matched fallback for Inter is local Arial, which HAS Arabic and
//     Hebrew glyphs, so a script face placed after Inter would never be
//     reached and the page would render in Arial.
//   cjk-* — system faces go LAST. Every target OS ships an excellent CJK face,
//     and a CJK webfont is megabytes even when sliced; Arial has no CJK glyphs,
//     so these are reached naturally. Listed per language because Han
//     unification makes the same code point a different glyph in Chinese,
//     Japanese and Korean; the `lang` attribute plus the right face is what
//     gets each reader their own forms.
//
// `preload: false` on every script face: an English visitor must not download
// an Arabic woff2, and with unicode-range a face is only fetched when a glyph
// in its range is actually painted.
//
// Urdu uses the Naskh-style Noto Sans Arabic, not Nastaliq. Nastaliq is the
// traditional Urdu hand, but its vertical extent is roughly double Naskh's,
// which would break the "no structural regression" goal on every line-height
// in the site. Recorded in docs/seo.md as a deliberate trade.

export const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
});

export const varelaRound = Varela_Round({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-varela-round',
});

// Brand face for the intro emblem's engraved name (MUHAMMAD / ABDULLAH),
// matching the source artwork. 800 only — it's used in one place.
export const montserrat = Montserrat({
  weight: '800',
  subsets: ['latin'],
  variable: '--font-montserrat',
});

const notoArabic = Noto_Sans_Arabic({
  subsets: ['arabic'],
  preload: false,
  display: 'swap',
});

const notoHebrew = Noto_Sans_Hebrew({
  subsets: ['hebrew'],
  preload: false,
  display: 'swap',
});

const notoDevanagari = Noto_Sans_Devanagari({
  subsets: ['devanagari'],
  preload: false,
  display: 'swap',
});

const LEADING_FACE = {
  arabic: notoArabic,
  hebrew: notoHebrew,
  devanagari: notoDevanagari,
};

const TRAILING_STACK = {
  'cjk-sc': '"PingFang SC", "Hiragino Sans GB", "Noto Sans CJK SC", "Source Han Sans SC", "Microsoft YaHei", sans-serif',
  'cjk-jp': '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans CJK JP", "Source Han Sans JP", "Yu Gothic", Meiryo, sans-serif',
  'cjk-kr': '"Apple SD Gothic Neo", "Noto Sans CJK KR", "Source Han Sans KR", "Malgun Gothic", sans-serif',
};

/** The className that registers the brand faces' variables on <body>. */
export const fontVariableClasses = [
  inter.variable,
  varelaRound.variable,
  montserrat.variable,
];

/**
 * Inline style for <body>: the brand variables re-declared with the locale's
 * script face composed in. `undefined` for Latin-script locales, which need
 * nothing, so English renders exactly as before.
 */
export function scriptFontStyle(locale) {
  const { script } = localeInfo(locale);
  const lead = LEADING_FACE[script];
  const trail = TRAILING_STACK[script];
  if (!lead && !trail) return undefined;
  const compose = (brand) =>
    [lead?.style.fontFamily, brand.style.fontFamily, trail].filter(Boolean).join(', ');
  return {
    '--font-inter': compose(inter),
    '--font-varela-round': compose(varelaRound),
    '--font-montserrat': compose(montserrat),
    // The page's default text (Tailwind's preflight system-ui stack) gets the
    // same treatment, so body copy and headings share one script face.
    fontFamily: [lead?.style.fontFamily, 'ui-sans-serif, system-ui', trail ?? 'sans-serif']
      .filter(Boolean)
      .join(', '),
  };
}
