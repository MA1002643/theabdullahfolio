// The app's root layout is a pass-through since issue #82. The real document
// shell — <html lang dir>, fonts, providers, metadata — lives one level down in
// `src/app/[locale]/layout.js`, because `lang` and `dir` depend on the locale
// segment and only a layout inside that segment can read it.
//
// It still has to EXIST: `src/app/not-found.js` beside it handles requests the
// proxy never maps onto a locale (an unknown asset path like `/missing.png`),
// and Next requires a root layout above any root-level file.
export default function RootLayout({ children }) {
  return children;
}
