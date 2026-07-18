// Footer-only configuration (issue #30). Kept out of the JSX so URLs, labels,
// and copy live in one editable place and the component stays presentational.
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
// Served from /public — opens the CV PDF directly.
export const resumeUrl = '/Muhammad_Abdullah_CV.pdf';

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

// Brand/signature copy.
export const brand = {
  name: 'Muhammad Abdullah',
  role: 'Software Engineer',
  // One-line positioning statement — kept short so it never wraps past two lines
  // on the narrowest supported width (360px).
  statement: 'Crafting fast, considered web experiences from the North of England.',
};

// Primary quick navigation. `label` doubles as the visible text; `href` is
// matched against the current pathname for the route-aware highlight. Order
// mirrors the site's information architecture (learn -> credentials -> work ->
// reach out).
export const quickLinks = [
  { label: 'About', href: '/about', desc: 'Who I am' },
  { label: 'Qualifications', href: '/qualifications', desc: 'Credentials' },
  { label: 'Projects', href: '/projects', desc: 'Selected work' },
  { label: 'Contact', href: '/contact', desc: 'Say hello' },
];

// Live availability state, surfaced in the identity block as an honest,
// semantic signal (a job-seeking flag — the one case the design system permits
// a status dot). `open` gates whether the "open to new roles" line shows at
// all; flip it to false when not looking and the line simply disappears.
export const availability = {
  open: true,
  label: 'Open to new roles',
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
export const socialLinks = [
  {
    label: 'GitHub',
    // Short, honest destination shown under the label as a monospace handle.
    handle: 'github.com/MA1002643',
    href: profileGithubUrl,
    icon: 'github',
    external: true,
    aria: 'GitHub profile (opens in a new tab)',
  },
  {
    label: 'LinkedIn',
    handle: 'in/muhammad-abdullah227',
    href: linkedInUrl,
    icon: 'linkedin',
    external: true,
    aria: 'LinkedIn profile (opens in a new tab)',
  },
  {
    label: 'Résumé',
    handle: 'Muhammad_Abdullah_CV.pdf',
    href: resumeUrl,
    icon: 'resume',
    external: true,
    aria: 'Download résumé PDF (opens in a new tab)',
  },
];

// Small print for the meta row. Year is filled in at render time so the
// copyright never goes stale.
export const meta = {
  builtWith: 'Next.js',
  // The person named in the copyright line.
  owner: brand.name,
};
