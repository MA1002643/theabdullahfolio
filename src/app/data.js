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
    // Replaced the GitHub ring button (issue #38, owner-directed): the ring's
    // eight slots are prime navigation real estate, and an external hop to a
    // repo profile earned one less than the in-app /journey timeline does.
    // GitHub is not gone — it keeps its slot in the footer's ELSEWHERE
    // terminal (footer-data.js socialLinks), which is where external
    // destinations live. Swapping IN PLACE (not appending) matters: the
    // sub-480px two-column layout slices BtnList 0-3 / 4-7, so a ninth entry
    // would silently vanish on phones.
    label: 'Journey',
    link: '/journey',
    icon: 'journey',
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
    // Replaced the LinkedIn ring button (issue #40, owner-directed), on the
    // same reasoning as the GitHub → Journey swap above: the ring's eight
    // slots are prime navigation real estate, and an external hop earns one
    // less than the in-app /guestbook wall does. LinkedIn is not gone — it
    // keeps its slot in the footer's ELSEWHERE terminal (footer-data.js
    // socialLinks), where external destinations live. Swapping IN PLACE (not
    // appending) matters: the sub-480px two-column layout slices BtnList
    // 0-3 / 4-7, so a ninth entry would silently vanish on phones.
    label: 'Guestbook',
    link: '/guestbook',
    icon: 'guestbook',
    newTab: false,
  },
  {
    label: 'Resume',
    link: '/Muhammad_Abdullah_CV.pdf',
    icon: 'resume',
    newTab: false,
  },
];

// /journey timeline (issue #38). Newest first — the page scrolls BACK through
// time, so the array order is the render order (and MUST stay grouped by
// `year`, monotonically descending: the era separators render on every year
// CHANGE, so an interleaved year would mint a duplicate separator). Two date
// fields on purpose: `year` is the machine value (era grouping, the year
// separators, the ghost year readout), `dateLabel` is what the card prints —
// which lets a range-spanning entry sit in its END year, where the story
// resolves, while still showing its true span. `type` keys into the accent map
// in components/journey (career/education/milestone in service — each gets its
// own icon + accent colour; `milestone` carries the community/volunteering
// roles). The map's `project` and `origin` types are deliberately UNTENANTED
// here: the owner keeps /journey to the documented education/employment
// record — the portfolio already lives on /projects, and the poetic
// "first line" origin card was cut on the same review; the EST. end-cap in
// components/journey carries the where-it-began note instead. Don't re-add
// either. Content
// is the COMPLETE employment/education/volunteering record from the LinkedIn
// profile, owner-supplied 2026-08-22, cross-checked against the CV at
// public/Muhammad_Abdullah_CV.pdf — where the two disagreed, LinkedIn won
// (BTEC is 2019–2021 with the OCNLR cert before it, not the CV's 2017 start;
// Unisys is MAY 2023 — SEP 2024, not APR—JUL). Keep all three in step.
//
// `start`/`end` are the machine form of `dateLabel` for the overlap atlas
// (components/journey/TimelineAtlas): 'YYYY-MM', `end: null` = still running
// (the atlas closes those bars on the live clock). The two year-only college
// labels resolve to the academic year (SEP → JUN) — the label stays the
// honest display, the span is the best month-true reading of it. `org` is the
// employer/institution: the atlas prints every bar caption as `org · role`
// (role = the title's first ' · ' segment) IN FULL — a short bar's caption
// spills past its edge, with the lane packing reserving the room — so keep it
// the proper name, never an abbreviation. Keep all three date fields telling
// one story.
export const journeyData = [
  {
    id: 'j-indie',
    year: 2026,
    dateLabel: 'APR 2026 →',
    start: '2026-04',
    end: null,
    org: 'Independent Projects',
    title: 'Software Engineer · Independent Projects',
    description:
      'Designing, building and shipping full-stack work end-to-end: a Swagger-documented REST API with Mocha/Chai tests, Colophon (AI publishing — Vue 3, Express, PostgreSQL + pgvector), AfaaqX, and a GitHub profile regenerated daily by scheduled Actions pipelines.',
    type: 'career',
    tags: ['TypeScript', 'PostgreSQL', 'GitHub Actions'],
    link: 'https://github.com/MA1002643',
  },
  {
    id: 'j-constant',
    year: 2026,
    dateLabel: 'MAY 2026 →',
    start: '2026-05',
    end: null,
    org: 'Constant Security Services',
    title: 'Security Officer · Constant Security Services',
    description:
      'SIA-licensed across critical science and university sites, including Jodrell Bank Observatory — patrols, CCTV, incident response and control-room reporting while landing the next engineering role.',
    type: 'career',
    tags: ['SIA-licensed', 'Jodrell Bank'],
    link: null,
  },
  {
    id: 'j-c365',
    year: 2026,
    dateLabel: 'FEB — MAY 2026',
    start: '2026-02',
    end: '2026-05',
    org: 'C365Cloud',
    title: 'DevOps Engineer · C365Cloud',
    description:
      'Kept a compliance platform shipping: CI/CD pipelines, Microsoft SQL Server and MySQL administration, and .NET (Blazor) platform features for internal teams in Wakefield.',
    type: 'career',
    tags: ['CI/CD', 'T-SQL', '.NET Blazor'],
    link: null,
  },
  {
    id: 'j-adullam',
    year: 2026,
    dateLabel: 'APR 2025 — MAY 2026',
    start: '2025-04',
    end: '2026-05',
    org: 'Adullam Homes',
    title: 'Concierge · Adullam Homes',
    description:
      'Out-of-hours point of contact in supported accommodation — safeguarding escalations, incident management and accurate electronic record-keeping for vulnerable residents.',
    type: 'career',
    tags: ['Safeguarding'],
    link: null,
  },
  {
    id: 'j-showsec',
    year: 2025,
    dateLabel: 'DEC 2024 — AUG 2025',
    start: '2024-12',
    end: '2025-08',
    org: 'Showsec',
    title: 'Security Officer / CCTV Operator · Showsec',
    description:
      'CCTV monitoring, crowd management and incident response at high-profile events, coordinating in real time with security teams and law enforcement.',
    type: 'career',
    tags: ['CCTV', 'Incident response'],
    link: null,
  },
  {
    id: 'j-lidl',
    year: 2025,
    dateLabel: 'SEP 2021 — APR 2025',
    start: '2021-09',
    end: '2025-04',
    org: 'Lidl GB',
    title: 'Customer Assistant · Lidl GB',
    description:
      'High-volume store through the whole degree — till, deliveries, stock; part of the team that lifted the store’s sales ranking from 14th to 10th and customer satisfaction 18% in four months.',
    type: 'career',
    tags: ['3 yrs 8 mo alongside study'],
    link: null,
  },
  {
    id: 'j-unisys',
    year: 2024,
    dateLabel: 'MAY 2023 — SEP 2024',
    start: '2023-05',
    end: '2024-09',
    org: 'Unisys',
    title: 'Software Engineer · Unisys',
    description:
      '17-month industrial placement in Manchester: shipped full-stack C# / .NET (Blazor) features that lifted system efficiency ~20%, cut production issues 30% owning support triage, and stepped up to lead a project team to an on-time delivery that won follow-on client contracts.',
    type: 'career',
    tags: ['C#', '.NET Blazor', 'SQL'],
    link: null,
  },
  {
    id: 'j-ambassador',
    year: 2023,
    dateLabel: 'MAY 2022 — OCT 2023',
    start: '2022-05',
    end: '2023-10',
    org: 'MMU',
    title: 'Student Ambassador · MMU',
    description:
      'Represented the university at open days, tours and recruitment events across Greater Manchester.',
    type: 'milestone',
    tags: ['Community'],
    link: null,
  },
  {
    id: 'j-mmu-helpdesk',
    year: 2023,
    dateLabel: 'JUL 2022 — JAN 2023',
    start: '2022-07',
    end: '2023-01',
    org: 'MMU',
    title: 'IT Help Desk Technician · MMU',
    description:
      'First-line support for staff and students — hardware, software and access issues, bridging IT and partner departments; praised by multiple departments in the first week.',
    type: 'career',
    tags: ['First-line support'],
    link: null,
  },
  {
    id: 'j-mmu-dev',
    year: 2023,
    dateLabel: 'APR 2022 — JAN 2023',
    start: '2022-04',
    end: '2023-01',
    org: 'MMU',
    title: 'Software Developer · MMU',
    description:
      'Front-end and back-end functionality in a multidisciplinary university team — resolved 50+ bugs, improved load speed 25% and cut development time 15% translating stakeholder requirements into working features.',
    type: 'career',
    tags: ['Full-stack', '50+ bugs resolved'],
    link: null,
  },
  {
    id: 'j-course-rep',
    year: 2022,
    dateLabel: 'SEP 2021 — SEP 2022',
    start: '2021-09',
    end: '2022-09',
    org: 'MMU',
    title: 'Course Representative · MMU',
    description:
      'Elected voice for the cohort — negotiated assessment scheduling around religious observances and expanded departmental guest-speaker sessions.',
    type: 'milestone',
    tags: ['Learner Voice Award', 'Volunteering Award'],
    link: null,
  },
  {
    id: 'j-bsc',
    year: 2021,
    dateLabel: 'SEP 2021 →',
    start: '2021-09',
    end: null,
    org: 'MMU',
    title: 'BSc (Hons) Software Engineering · MMU',
    description:
      'Manchester Metropolitan University — BCS-accredited, predicted First-Class Honours. The formal deep end.',
    type: 'education',
    tags: ['BCS Accredited', 'First-Class (predicted)'],
    link: null,
  },
  {
    id: 'j-kfc',
    year: 2021,
    dateLabel: 'MAR 2019 — SEP 2021',
    start: '2019-03',
    end: '2021-09',
    org: 'KFC',
    title: 'Team Member · KFC',
    description:
      'Every station, front to back — named Best Employee six consecutive months, in the crew that lifted the store’s regional ranking from 5th to 2nd.',
    type: 'career',
    tags: ['Best Employee ×6'],
    link: null,
  },
  {
    id: 'j-btec',
    year: 2021,
    dateLabel: '2019 — 2021',
    start: '2019-09',
    end: '2021-06',
    org: 'Bolton College',
    title: 'BTEC Level 3 Extended Diploma in IT',
    description:
      'Bolton College — Triple Distinction (DDD). Two years that turned curiosity into a discipline.',
    type: 'education',
    tags: ['Triple Distinction'],
    link: null,
  },
  {
    id: 'j-ocnlr',
    year: 2019,
    dateLabel: '2018 — 2019',
    start: '2018-09',
    end: '2019-06',
    org: 'Bolton College',
    title: 'OCNLR Certificate in Digital Skills',
    description:
      'Bolton College — the first formal step into computing, and the doorway to everything above it.',
    type: 'education',
    tags: ['Digital Skills'],
    link: null,
  },
];
