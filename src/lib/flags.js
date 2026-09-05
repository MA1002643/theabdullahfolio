// Feature flags for the guestbook's elite interaction layer (issue #40
// Phase 4). Every enhancement checks its flag at its MOUNT POINT, so any one
// of them can be killed with a one-line flip here — no component surgery, no
// conditional spaghetti inside the features themselves.
//
// These are build-time constants on purpose (not env vars, not remote
// config): the portfolio deploys on every merge, so a flip ships in minutes,
// and dead flags are tree-shaken out of the client bundle.
export const GUESTBOOK_FLAGS = {
  // 3D tilt + specular glare on message cards (useCardTilt).
  tilt: true,
  // Magnetic pull on the send button and sign-in CTA (useMagneticPull).
  magnetic: true,
  // GUESTBOOK headline decodes from glyphs on mount and on new messages.
  // OFF by owner decision: the guestbook title/subtitle must play the exact
  // sitewide PageTitle ignite, same as every other sub-page. The decode
  // variant (GuestbookTitle) stays one flip away.
  scramble: false,
  // Depth falloff down the wall (cards sharpen as they rise). The background
  // scroll parallax this flag also covered was removed outright — the
  // backdrop must match /about, whose image is static.
  scrollChoreography: true,
  // "N here now" presence pill, polled while the tab is visible.
  presence: true,
  // 🔥 🚀 ❤️ reactions with the particle burst.
  reactions: true,
  // ⌘K command palette (shared component — src/components/commandPalette).
  commandPalette: true,
  // Web Audio UI blips — off by default at runtime too; this flag removes
  // even the toggle.
  sound: true,
  // Grain + vignette overlay.
  grain: true,
};
