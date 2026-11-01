// Footer-only configuration (issue #30). Kept out of the JSX so URLs, labels,
// and copy live in one editable place and the component stays presentational.
//
// Since issue #82 the visitor-facing COPY lives in the message catalogue
// (messages/en/Footer.json) and this file keeps only what does not translate:
// URLs, handles, brand names and the stable `key` each entry's copy is filed
// under. Translating a word must never be able to break a link.
//
// NB: this is intentionally separate from src/app/data.js `BtnList` (the home
// navigation island). The footer needs a few things BtnList doesn't carry —
// most importantly `projectGithubUrl` (the repository itself, distinct from the
// GitHub *profile*) — plus lucide icon identities per link, so it gets its own
// small config rather than overloading the shared nav list.

// GitHub owner + repository this site is built from. Both read from env — with
// the same defaults as the API routes — so a fork retargets everything the footer
// says about THIS project from env alone, no code edit: the "view this project on
// GitHub" CTA link below AND the live /api/project-repo metadata caption (which
// reads the same two vars). `githubUsername` is also the handle behind the
// footer's live signals (CallingCard's contribution count).
export const githubUsername =
  process.env.NEXT_PUBLIC_GITHUB_USERNAME || 'MA1002643';
const projectRepo = process.env.NEXT_PUBLIC_PROJECT_REPO || 'theabdullahfolio';

// The repository this site is built from. MANDATORY, per the issue: the footer
// must always surface a working "view this project on GitHub" call to action.
export const projectGithubUrl = `https://github.com/${githubUsername}/${projectRepo}`;

// Personal / professional destinations.
export const profileGithubUrl = 'https://github.com/MA1002643';
export const linkedInUrl = 'https://www.linkedin.com/in/muhammad-abdullah227/';
// Served from /public — opens the CV PDF directly. Still the canonical
// downloadable artifact, and still what /journey's download button and the
// command palette reach for.
export const resumeUrl = '/Muhammad_Abdullah_CV.pdf';

// The HTML CV (issue #32, W1c). This is what the FOOTER links, in place of the
// PDF it used to point at, for three reasons:
//
//   • A crawler following the footer now reaches a document it can read.
//     Pointing the site's only CV affordance at a PDF meant /cv would have been
//     an orphan the moment it shipped — the F1 failure, reintroduced.
//   • A phone reader no longer has to commit to a download before seeing a
//     word. The PDF is offered prominently ON that page instead.
//   • It is an internal link, so it participates in the site's own graph
//     rather than terminating it.
export const cvUrl = '/cv';

// Contact micro-block. `email` is the PUBLIC contact/reply-to address shown in
// the footer — env-overridable with the literal below as its default (same
// pattern as githubUsername/projectRepo above), so a fork retargets it from env
// with no code edit. It is deliberately SEPARATE from the contact form's
// RECEIVER_EMAIL: that is a server-only secret the /api/send-mail route delivers
// to, unreadable from this client bundle, so the two can't share one var. They
// point at the same inbox today by choice, not construction — if you want the
// address shown here to stay equal to the delivery inbox, set both to the same
// value. `location` matches the identity stated across the site.
export const email =
  process.env.NEXT_PUBLIC_CONTACT_EMAIL || 'muhammad.abdullah33176444@gmail.com';
export const location = 'Bolton, Manchester, England';

// Brand/signature copy lives in the catalogues: the name in `Common.owner`
// (hand-transliterated per locale, never machine-translated), the role and the
// one-line positioning statement in Footer.json (`identity.role`,
// `identity.statement`). The statement must still fit two lines at 360px in
// every language (see its translator note).

// Primary quick navigation. `key` files the row's visible label and its
// descriptor under `manifest.links.<key>` in Footer.json; `href` is matched
// against the current pathname for the route-aware highlight. Order mirrors
// the site's information architecture (learn -> credentials -> work -> reach
// out).
export const quickLinks = [
  { key: 'about', href: '/about' },
  { key: 'journey', href: '/journey' },
  { key: 'qualifications', href: '/qualifications' },
  // The record, sitting with the other credentials rather than with the work
  // (issue #32). It is also linked from the Elsewhere terminal's Résumé row —
  // two entries, deliberately: that row is "where else to find me", this one is
  // the site index, and a page missing from the index reads as a page that does
  // not exist.
  { key: 'cv', href: '/cv' },
  { key: 'projects', href: '/projects' },
  // After the work, the tools it was built with (issue #37), then the reasoning
  // behind them (issue #32). Nine links put the two-column Manifest board at
  // 5 / 4 — the asymmetry is accepted (the masthead is asymmetric by design),
  // and the board derives its row count from this array's length rather than
  // hardcoding one, so nothing else moves when a link is added.
  { key: 'uses', href: '/uses' },
  { key: 'notes', href: '/notes' },
  { key: 'contact', href: '/contact' },
  // Last on purpose — the IA arc ends "reach out, then sign the wall". Also
  // feeds the Manifest departures board, which maps this list with no
  // hardcoded row count, so the sixth row flips in like the rest (issue #40).
  { key: 'guestbook', href: '/guestbook' },
];

// Live availability state, surfaced in the identity block as an honest,
// semantic signal (a job-seeking flag — the one case the design system permits
// a status dot). `open` gates whether the "open to new roles" line shows at
// all; flip it to false when not looking and the line simply disappears. The
// line itself is `availability` in Footer.json.
export const availability = {
  open: true,
  // The city whose local time is shown next to the flag — a reachability cue
  // (when am I awake to reply?), rendered in Europe/London so it stays correct
  // through BST/GMT without hardcoding an offset.
  city: 'Bolton',
  timeZone: 'Europe/London',
};

// Icon-bearing professional links. `icon` names a lucide-react component the
// footer maps to a real icon; `external` drives target/rel + the new-tab a11y
// affordances. Resume is `external` too so it opens the PDF in its own tab
// rather than navigating away from the SPA.
//
// `label` is the brand name the terminal types as a command ("open github"),
// which is code and stays English in every locale. The accessible description
// each link adds after it is `elsewhere.<key>` in Footer.json.
export const socialLinks = [
  {
    key: 'github',
    label: 'GitHub',
    // Short, honest destination shown under the label as a monospace handle.
    handle: 'github.com/MA1002643',
    href: profileGithubUrl,
    icon: 'github',
    external: true,
  },
  {
    key: 'linkedin',
    label: 'LinkedIn',
    handle: 'in/muhammad-abdullah227',
    href: linkedInUrl,
    icon: 'linkedin',
    external: true,
  },
  {
    key: 'resume',
    label: 'Résumé',
    // The handle now names the ROUTE rather than the file. It is the honest
    // label for where the link goes, and it is what tells a reader the
    // destination is a page rather than a download — which is the whole
    // behavioural change here.
    handle: 'ma.codes/cv',
    href: cvUrl,
    icon: 'resume',
    // Internal now, so it opens in the same tab and takes no `noopener`
    // treatment. The PDF is still one click further on, and still external.
    external: false,
  },
];
