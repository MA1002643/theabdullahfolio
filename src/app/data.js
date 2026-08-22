/*
Websites:

- https://github.com/pmndrs/gltfjsx (GLTF JSX for 3D Models)
- https://lucide.dev/icons/ (Lucide Icons)
- https://github.com/anuraghazra/github-readme-stats (Github Readme Stats)
- https://skillicons.dev (Skill Icons to show skills)
- https://github-readme-streak-stats.herokuapp.com (Github Readme Streak Stats)

:root {
  --background: 27 27 27;
  --foreground: 225 225 225;
  --muted: 115 115 115;
  --accent: 254 254 91; #FEFE5B
}

*/

export const projectsData = [
  {
    id: 1,
    // The portfolio itself (github.com/MA1002643/theabdullahfolio). The
    // description doubles as the /projects/[id] subtitle (ProjectIntro);
    // 4 words to match the listing's card rhythm, echoing the "Portfolio
    // Redesign — Scroll-Driven Rebuild" project board it's built against.
    // Date = repo creation.
    name: 'theabdullahfolio',
    description: 'Cinematic scroll-driven portfolio rebuild',
    date: '2025-07-20',
    demoLink: 'https://ma.codes',
    category: 'Web',
    // `repo` (issue #48): the GitHub `owner/name` whose issue board drives
    // this project's live completion percentage in the about page's
    // Project Progress popup (/api/project-progress derives
    // closed-vs-total counts from it, batched across every project in one
    // GraphQL call). Casing must match GitHub exactly. A project with no
    // usable board would set `repo: null` and render as "Not tracked" —
    // every current project has one, so none do today.
    repo: 'MA1002643/theabdullahfolio',
  },
  {
    id: 2,
    // github.com/MA1002643/AfaaqX — "Design and Implementation of a
    // Role-Based Multi-Tenant Business Management System with Integrated
    // Authentication, Real-Time Notifications, and AI-Assisted Customer
    // Support". Category System, not Web: the repo names itself a
    // management SYSTEM, and its issue board is dominated by system-level
    // scope (multi-tenant RBAC, Stripe payments, bookings/CRM, security
    // audits, CI/CD) rather than a site's presentation layer. Date = repo
    // creation; no homepage exists, so the demo link is the repo itself.
    name: 'AfaaqX',
    description: 'Multi-tenant business management platform',
    date: '2025-02-13',
    demoLink: 'https://github.com/MA1002643/AfaaqX',
    category: 'System',
    repo: 'MA1002643/AfaaqX',
  },
  {
    id: 3,
    // github.com/MA1002643/culina — "A smart recipe search platform
    // leveraging AI to help users discover, filter and personalise cooking
    // ideas". Category AI, not Web or System: the repo leads with AI
    // everywhere — its description, its topics (ai, machine-learning), and
    // the largest feature cluster on its 41-issue board (sous-chef
    // assistant, RAG/embeddings pipeline, semantic search, model routing +
    // gateway failover, prompt governance, AI cost rails) — scope neither
    // existing tab describes. The tab label keeps its casing via the
    // acronym map in src/lib/categories.js (the plain fold would render
    // "Ai"). Date = repo creation; no homepage exists, so the demo link is
    // the repo itself.
    name: 'culina',
    description: 'AI-powered recipe discovery platform',
    date: '2025-10-09',
    demoLink: 'https://github.com/MA1002643/culina',
    category: 'AI',
    repo: 'MA1002643/culina',
  },
  {
    id: 4,
    // github.com/MA1002643/muhammadabdullah-portfolio — the previous
    // portfolio, live at muhammadabdullah227.co.uk: "An elite,
    // motion-driven Next.js portfolio showcasing my projects, skills, and
    // creative design in an immersive scroll experience". Category Web:
    // it's a personal site, and its redesign board
    // (users/MA1002643/projects/7) is presentation-layer scope end to
    // end — design tokens, GSAP/ScrollTrigger/Lenis scroll choreography,
    // section builds, WCAG 2.2 AA, SEO, performance budgets. The 3-word
    // description is lifted from the repo's own framing. Date = repo
    // creation; the demo link is the live site.
    name: 'muhammadabdullah-portfolio',
    description: 'Immersive motion-driven portfolio',
    date: '2024-07-08',
    demoLink: 'https://muhammadabdullah227.co.uk/',
    category: 'Web',
    repo: 'MA1002643/muhammadabdullah-portfolio',
  },
  {
    id: 5,
    // github.com/MA1002643/colophon — "Colophon — a cross-platform,
    // AI-powered publishing platform. Vue 3 · Express · Postgres ·
    // pgvector" (the repo formerly named
    // article-server-full-stack-blogging-platform). Category AI, on the
    // culina precedent: the repo's own description leads with AI, and the
    // defining cluster on its 36-issue board ("Colophon — Product
    // Programme", users/MA1002643/projects/9) is AI/RAG — provider-
    // agnostic AI gateway, embeddings + pgvector store, grounded
    // assistant with tool-calls, semantic search, AI cost rails and
    // prompt-injection defences — alongside cross-platform delivery
    // (Tauri desktop, Capacitor mobile, installable PWA). The 4-word
    // description is the repo's own phrasing. Date = repo creation; no
    // homepage exists, so the demo link is the repo itself.
    name: 'colophon',
    description: 'Cross-platform AI-powered publishing platform',
    date: '2023-03-04',
    demoLink: 'https://github.com/MA1002643/colophon',
    category: 'AI',
    repo: 'MA1002643/colophon',
  },
  {
    id: 6,
    // github.com/MA1002643/dhun — "Dhun — cross-platform music streaming
    // platform: web, desktop and mobile from one codebase" (the repo
    // formerly named fullstack-singer-platform). Category System, on the
    // AfaaqX precedent: its 60-issue board ("Dhun — Streaming Rebuild",
    // users/MA1002643/projects/10) is dominated by system-level scope —
    // HLS playback engine, FFmpeg ingest pipeline, catalogue + search
    // infra, realtime sync, R2/CDN storage, RBAC and monorepo CI — with
    // web as just one of five delivery targets (so not Web) and only ~3
    // AI-flavoured issues of 60 (so not AI). The 4-word description is
    // the repo's own phrasing. Date = repo creation; no homepage exists,
    // so the demo link is the repo itself.
    name: 'dhun',
    description: 'Cross-platform music streaming platform',
    date: '2023-03-04',
    demoLink: 'https://github.com/MA1002643/dhun',
    category: 'System',
    repo: 'MA1002643/dhun',
  },
  {
    id: 7,
    // github.com/MA1002643/plenary — the repo formerly named
    // vevox-real-time-chat-web-application: today "a real-time web chat
    // application", but its ~60-issue board ("Plenary — Educational
    // Session Platform", users/MA1002643/projects/11) rebuilds it into a
    // live audience-engagement platform for teaching sessions — polls,
    // quizzes, word clouds, moderated Q&A, presenter console + projection
    // view, 3,000-participant scale certification, LTI 1.3/SSO, cohort
    // analytics, Tauri/Capacitor/PWA shells. Category System on the
    // AfaaqX/dhun precedent: realtime product-platform scope dominates;
    // the AI cluster (RAG, question generation, clustering, summaries) is
    // supporting — 8 of ~60 issues — not the lead as on culina/colophon.
    // The 4-word description blends the realtime core with the board's
    // own "Educational Session Platform" framing. Date = repo creation;
    // no homepage exists, so the demo link is the repo itself.
    name: 'plenary',
    description: 'Real-time educational engagement platform',
    date: '2023-03-04',
    demoLink: 'https://github.com/MA1002643/plenary',
    category: 'System',
    repo: 'MA1002643/plenary',
  },
  {
    id: 8,
    // Replaced the placeholder "TechTalk" entry (2026-08). Description and
    // category are derived from MA1002643/auxo's open issues: a cross-platform
    // mobile fitness/nutrition app (TestFlight/Play beta, watch apps, HealthKit
    // / Health Connect, StoreKit & Play Billing) with a large AI coaching
    // layer — "Mobile" is the product form, AI one component. Date = repo
    // creation. The repo is PRIVATE with no homepage yet — a github.com
    // link would 404 for every visitor, so unlike the public-repo entries
    // (plenary precedent) there is no URL to offer: `demoLink: null` +
    // `private` let a consumer render an explicit private-project state
    // instead of a dead link. Swap in a real URL once a public landing
    // page or repo exists.
    name: 'auxo',
    description: 'AI-powered fitness coaching platform',
    date: '2026-08-02',
    demoLink: null,
    private: true,
    category: 'Mobile',
    repo: 'MA1002643/auxo',
  },
  {
    id: 9,
    // Replaced the placeholder "FitTrack" entry (2026-08). Description and
    // category are derived from MA1002643/clearway's open issues: truck-legal
    // HGV navigation (constraint routing, bridge-strike prevention, CarPlay /
    // Android Auto, offline maps) with a deterministic EU/UK/US drivers'-hours
    // compliance engine — a cross-platform mobile app like auxo, hence
    // "Mobile". Date = repo creation. PRIVATE repo, no homepage — same
    // no-dead-links rule as auxo: `demoLink: null` + `private` until a
    // public URL exists.
    name: 'clearway',
    description: 'Truck-legal navigation and compliance',
    date: '2026-08-02',
    demoLink: null,
    private: true,
    category: 'Mobile',
    repo: 'MA1002643/clearway',
  },
  {
    id: 10,
    // github.com/MA1002643/vigil — "Vigil — automated hourly check-in
    // calls, verified. Server-mediated telephony + React Native." Added
    // with tailorhawk (2026-08) to close the 11-boards-vs-9-cards gap:
    // both repos already fed the maintenance header (workTrackedRepos,
    // boards 4/5) but had no card here. Category Mobile on the
    // auxo/clearway precedent — the product form is a mobile app: React
    // Native is the ONLY delivery target on its 67-issue board ("vigil",
    // users/MA1002643/projects/4 — TestFlight/Play distribution, store
    // listings + submission, mobile crash reporting, WCAG 2.2 AA), with
    // the server-mediated call engine (outbound PSTN placement, DTMF PIN
    // entry, IVR/voicemail detection, outcome state machine) and the
    // PIN-custody security cluster as supporting layers, like auxo's AI
    // coaching. Not System on the dhun/plenary precedent because that
    // rule needed multi-target delivery with web as one of many — vigil
    // ships to exactly one form factor. The 4-word description is the
    // repo's own phrasing. Date = repo creation. PRIVATE repo, no
    // homepage — same no-dead-links rule as auxo: `demoLink: null` +
    // `private` until a public URL exists.
    name: 'vigil',
    description: 'Automated hourly check-in calls',
    date: '2026-07-25',
    demoLink: null,
    private: true,
    category: 'Mobile',
    repo: 'MA1002643/vigil',
  },
  {
    id: 11,
    // github.com/MA1002643/tailorhawk — "AI-powered job discovery & CV
    // optimisation — daily digest of top job matches with ATS-optimised,
    // per-role CV and LinkedIn PDFs. Cross-platform, security-first,
    // cost-aware." Added with vigil (2026-08), see above. Category AI on
    // the culina/colophon precedent: the description and the repo topics
    // (ai, ats, cv, job-search) lead with AI, and the defining engines on
    // its 52-issue board ("Tailorhawk", users/MA1002643/projects/5) are
    // AI end to end — repository-analysis engine, matching/scoring engine
    // with a documented ranking rubric, ATS-optimised CV rewrite,
    // LinkedIn rewrite, per-run token-spend tracking and daily cost
    // ceilings — while cross-platform delivery (five platforms, as on
    // colophon) is the shell, not the lead. The 4-word description keeps
    // the repo's own leading phrase, "& tailoring" covering the CV /
    // LinkedIn rewrite half (and the product's namesake). Date = repo
    // creation. PRIVATE repo, no homepage — same no-dead-links rule as
    // auxo: `demoLink: null` + `private` until a public URL exists.
    name: 'tailorhawk',
    description: 'AI-powered job discovery & tailoring',
    date: '2026-07-25',
    demoLink: null,
    private: true,
    category: 'AI',
    repo: 'MA1002643/tailorhawk',
  },
];

export const BtnList = [
  { label: 'About', link: '/about', icon: 'about', newTab: false },
  { label: 'Projects', link: '/projects', icon: 'projects', newTab: false },
  {
    label: 'Qualifications',
    link: '/qualifications',
    icon: 'qualifications',
    newTab: false,
  },
  { label: 'Contact', link: '/contact', icon: 'contact', newTab: false },
  {
    label: 'Github',
    link: 'https://www.github.com/MA1002643',
    icon: 'github',
    newTab: false,
  },
  {
    // Resolves to src/app/(sub pages)/my-past — the archive page created
    // (issue #88 rework) so the route can answer 200 and carry its own
    // dedicated OG/share card (crawlers refuse to unfurl a 404, which is
    // what this path deliberately was before). The restored university-era
    // portfolio lands on that page later.
    label: 'My Past',
    link: '/my-past',
    icon: 'past',
    newTab: false,
  },
  {
    label: 'LinkedIn',
    link: 'https://www.linkedin.com/in/muhammad-abdullah227/',
    icon: 'linkedin',
    newTab: false,
  },
  {
    label: 'Resume',
    link: '/Muhammad_Abdullah_CV.pdf',
    icon: 'resume',
    newTab: false,
  },
];
