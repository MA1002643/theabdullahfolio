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
    // The case study (issue #31). Optional on every project: present, the
    // /projects/[id] page renders the full long-read; absent, it renders the
    // short form (hero, overview, stack, next project) from the fields above.
    //
    // Chapters render in ARRAY ORDER, and the chapter index, the reading
    // anchors (`#chapter-<type>`), the ⌘K jumps and Ask's citations all derive
    // from this one array (src/lib/caseStudy/chapters.js), so reordering,
    // adding or removing a chapter is an edit here and nowhere else. A type
    // appears at most once. Every step, item and fact carries a stable `id`:
    // translations are keyed by it, never by position, so reordering does not
    // re-point a translation at the wrong entry (scripts/i18n-data.mjs).
    //
    // Prose here is the English source; npm run i18n:data mirrors it into
    // messages/en/Data.json for translation. Outcome figures are NOT typed:
    // `derive` names a build-time source (src/lib/caseStudy/figures.js), so a
    // count cannot drift from the thing it counts (CLAUDE.md §2).
    caseStudy: {
      role: 'Design & engineering',
      timeline: { start: '2025-07', end: null },
      thesis:
        'A personal site built like a product: served in twenty languages, verified by a layered test plan, and with every decision written up in public.',
      hero: {
        src: '/projects/theabdullahfolio/hero.webp',
        alt: 'The theabdullahfolio home page: the name in orange above a laptop on a lantern-lit stone path, ringed by navigation buttons, under a live GitHub status bar.',
        width: 1600,
        height: 1000,
        // The hero as a live recording (owner, 2026-11-21), superseding the
        // 2026-11-19 shader cinemagraph: a screen capture of the real
        // homepage, loop-closed at one full orbit label cycle (~40 s at
        // 9°/s), so the lanterns flicker, the lake moves and the navigation
        // ring actually orbits. hero.webp above IS the loop's first frame
        // (exported from the same encoded master), so the video taking over
        // cannot pop. The rung boundary is painted CSS px × dpr (capped 2),
        // picked in JS (HeroSceneLoop) because <source media> is only
        // honoured inside <picture>. Paths only: nothing here reaches the
        // i18n mirror.
        video: {
          sources: [
            {
              max: 1280,
              webm: '/projects/theabdullahfolio/hero-loop-960.webm',
              mp4: '/projects/theabdullahfolio/hero-loop-960.mp4',
            },
            {
              max: Infinity,
              webm: '/projects/theabdullahfolio/hero-loop.webm',
              mp4: '/projects/theabdullahfolio/hero-loop.mp4',
            },
          ],
        },
      },
      chapters: [
        {
          type: 'overview',
          body: 'theabdullahfolio is the portfolio you are reading. It is a Next.js site that doubles as its own case study: each page is a working sample of how I build software, from the first byte a visitor downloads to the notes that explain why it was built that way.',
          facts: [
            { id: 'stack', label: 'Stack', value: 'Next.js, React, next-intl, framer-motion, Vercel' },
            { id: 'status', label: 'Status', value: 'Live, in active development' },
          ],
        },
        {
          type: 'statement',
          title: 'The problem',
          body: 'Most portfolios are brochures. They list what someone has made, but never show how it was made. This one had to be the evidence itself: as accountable as a product, as accessible as a public service, and open to anyone who wants to check the work.',
        },
        {
          type: 'walkthrough',
          title: 'How a visit works',
          steps: [
            {
              id: 'arrive',
              title: 'Arrive',
              body: 'The home page paints its name and a ring of destinations first. Animation features arrive afterwards in their own chunk, so nothing a visitor needs waits for motion to download.',
              media: {
                src: '/projects/theabdullahfolio/walk-arrive.webp',
                alt: 'The home page with its orbit of navigation buttons around the name.',
              },
            },
            {
              id: 'language',
              title: 'Read in your language',
              body: 'Every page is served in twenty languages. Four of them read right to left, and the layout mirrors with them: margins, arrows, motion and typed input all follow the reader’s direction.',
              media: {
                src: '/projects/theabdullahfolio/walk-language.webp',
                alt: 'The about page in Arabic, laid out right to left.',
              },
            },
            {
              id: 'palette',
              title: 'Move by keyboard',
              body: 'A command palette on every page reaches each route, project and section by typing. It also has an Ask panel that answers questions about the work and cites the page each answer came from.',
              media: {
                src: '/projects/theabdullahfolio/walk-palette.webp',
                alt: 'The command palette open over the projects page, listing the site’s routes.',
              },
            },
            {
              id: 'receipts',
              title: 'Check the receipts',
              body: 'The engineering notes are published as pages, and the uses page reads its figures from the build itself: the test counts, the dependency versions and the deployment pipeline.',
              media: {
                src: '/projects/theabdullahfolio/walk-receipts.webp',
                alt: 'The uses page: the machine and the editor bench, each row confirmed by the owner.',
              },
            },
          ],
        },
        {
          type: 'gallery',
          title: 'Screens',
          items: [
            {
              id: 'about',
              src: '/projects/theabdullahfolio/screen-about.webp',
              alt: 'The about page: the most-used languages and GitHub statistics, read live from GitHub, beside the years-in-the-craft card.',
              caption: 'About: live counts from GitHub and the CV.',
            },
            {
              id: 'journey',
              src: '/projects/theabdullahfolio/screen-journey.webp',
              alt: 'The journey page: a timeline of study and work.',
              caption: 'Journey: the timeline, era by era.',
            },
            {
              id: 'projects',
              src: '/projects/theabdullahfolio/screen-projects.webp',
              alt: 'The projects listing with category tabs.',
              caption: 'Projects: filtered by category.',
            },
            {
              id: 'notes',
              src: '/projects/theabdullahfolio/screen-notes.webp',
              alt: 'An engineering note rendered as a long-form page.',
              caption: 'Notes: decisions, written up in public.',
            },
            {
              id: 'japanese',
              src: '/projects/theabdullahfolio/screen-japanese.webp',
              alt: 'The journey page in Japanese.',
              caption: 'Japanese: line breaking without spaces.',
            },
          ],
        },
        {
          type: 'architecture',
          title: 'Architecture',
          body: 'Pages are rendered on the server and prerendered at build wherever they can be. Content and translations are files in the repository, and live figures come through a few small API routes. Each of those routes keeps its credentials on the server.',
          diagram: 'theabdullahfolio',
        },
        {
          // "Built with" (owner review, 2026-11-15; it replaced the "Next
          // project" hand-off). A flat list, each item in one of the four
          // STACK_GROUPS (src/lib/caseStudy/chapters.js), so the Data
          // catalogue mirrors `label` and `body` by id like any other
          // chapter. No version is typed here: `pkg` names the dependency
          // and src/lib/caseStudy/versions.js reads the installed version
          // from package-lock.json at build; `derive: 'node'` reads the
          // runtime major from `engines`. `icon` is a slug in
          // src/components/case-study/stackIcons.js; an item without one
          // shows a monogram.
          type: 'stack',
          title: 'Built with',
          body: 'A mainstream stack kept deliberately small: one framework, one styling system, one translation library, and a handful of libraries that each do one job.',
          items: [
            {
              id: 'javascript',
              group: 'languages',
              label: 'JavaScript',
              body: 'ES modules end to end; JSDoc types where a signature earns one.',
              icon: 'javascript',
            },
            {
              id: 'css',
              group: 'languages',
              label: 'CSS',
              body: 'One stylesheet with logical properties only, scaled from a single fluid factor.',
              icon: 'css',
            },
            {
              id: 'glsl',
              group: 'languages',
              label: 'GLSL',
              body: 'Fragment shaders for the home scene, the aurora and the ember passage.',
              icon: 'glsl',
            },
            {
              id: 'shell',
              group: 'languages',
              label: 'Shell',
              body: 'Build, verification and CI scripts.',
              icon: 'shell',
            },
            {
              id: 'next',
              group: 'frameworks',
              label: 'Next.js',
              pkg: 'next',
              body: 'App Router and Server Components; every route prerendered at build.',
              icon: 'next',
            },
            {
              id: 'react',
              group: 'frameworks',
              label: 'React',
              pkg: 'react',
              body: 'Server Components carry the words; client islands carry the motion.',
              icon: 'react',
            },
            {
              id: 'tailwind',
              group: 'frameworks',
              label: 'Tailwind CSS',
              pkg: 'tailwindcss',
              body: 'Utilities for layout and spacing; the site’s own voices live in one stylesheet.',
              icon: 'tailwind',
            },
            {
              id: 'next-intl',
              group: 'frameworks',
              label: 'next-intl',
              pkg: 'next-intl',
              body: 'Twenty locales with ICU messages and a message budget per route.',
            },
            {
              id: 'framer-motion',
              group: 'libraries',
              label: 'Framer Motion',
              pkg: 'framer-motion',
              body: 'LazyMotion: the animation engine arrives after first paint, or not at all, and the page is whole either way.',
              icon: 'framer',
            },
            {
              id: 'ai-sdk',
              group: 'libraries',
              label: 'AI SDK',
              pkg: 'ai',
              body: 'Ask and the fit check, streamed through the Vercel AI Gateway to Claude.',
              icon: 'anthropic',
            },
            {
              id: 'upstash',
              group: 'libraries',
              label: 'Upstash Redis',
              pkg: '@upstash/redis',
              body: 'The guestbook, the live location and every rate limit.',
              icon: 'upstash',
            },
            {
              id: 'three',
              group: 'libraries',
              label: 'three.js',
              pkg: 'three',
              body: 'The home scene and the aurora, through React Three Fiber, loaded only where they play.',
              icon: 'three',
            },
            {
              id: 'react-hook-form',
              group: 'libraries',
              label: 'React Hook Form',
              pkg: 'react-hook-form',
              body: 'The contact form’s fields and validation.',
              icon: 'reacthookform',
            },
            {
              id: 'auth',
              group: 'libraries',
              label: 'Auth.js',
              pkg: 'next-auth',
              body: 'GitHub and Google sign-in for the guestbook.',
            },
            {
              id: 'sonner',
              group: 'libraries',
              label: 'Sonner',
              pkg: 'sonner',
              body: 'Toasts for the forms and the project list.',
            },
            {
              id: 'lucide',
              group: 'libraries',
              label: 'Lucide',
              pkg: 'lucide-react',
              body: 'The interface icons, one inline SVG each.',
              icon: 'lucide',
            },
            {
              id: 'marked',
              group: 'libraries',
              label: 'marked',
              pkg: 'marked',
              body: 'Renders the engineering notes from Markdown at build.',
              icon: 'markdown',
            },
            {
              id: 'nodemailer',
              group: 'libraries',
              label: 'Nodemailer',
              pkg: 'nodemailer',
              body: 'Delivers the contact form over SMTP.',
            },
            {
              id: 'vitest',
              group: 'tooling',
              label: 'Vitest',
              pkg: 'vitest',
              body: 'The unit, property, component and API layers.',
              icon: 'vitest',
            },
            {
              id: 'playwright',
              group: 'tooling',
              label: 'Playwright',
              pkg: '@playwright/test',
              body: 'End-to-end, accessibility, visual and performance layers, in real browsers.',
            },
            {
              id: 'axe',
              group: 'tooling',
              label: 'axe-core',
              pkg: '@axe-core/playwright',
              body: 'WCAG 2.2 AA on every route, at two widths.',
            },
            {
              id: 'fast-check',
              group: 'tooling',
              label: 'fast-check',
              pkg: 'fast-check',
              body: 'Property tests for the parsers, the rankers and the chapter lists.',
            },
            {
              id: 'stryker',
              group: 'tooling',
              label: 'Stryker',
              pkg: '@stryker-mutator/core',
              body: 'Mutation testing on the critical logic.',
              icon: 'stryker',
            },
            {
              id: 'eslint',
              group: 'tooling',
              label: 'ESLint',
              pkg: 'eslint',
              body: 'Core Web Vitals and accessibility rules on every commit.',
              icon: 'eslint',
            },
            {
              id: 'github-actions',
              group: 'tooling',
              label: 'GitHub Actions',
              body: 'Tests, Lighthouse, visual baselines and dependency updates.',
              icon: 'githubactions',
            },
            {
              id: 'vercel',
              group: 'tooling',
              label: 'Vercel',
              body: 'Hosting, previews, analytics and the AI Gateway.',
              icon: 'vercel',
            },
            {
              id: 'node',
              group: 'tooling',
              label: 'Node.js',
              derive: 'node',
              body: 'The runtime, pinned by engines and .nvmrc.',
              icon: 'node',
            },
          ],
        },
        {
          type: 'notes',
          title: 'Craft notes',
          items: [
            {
              id: 'lazy-motion',
              title: 'Motion that is allowed to arrive late',
              body: 'The animation engine left every first load. Elements describe their end state in props, so a page that never receives the motion chunk is still complete. Rejected: shipping the whole library up front.',
              href: '/notes/discoverability',
            },
            {
              id: 'languages',
              title: 'Twenty languages, four right to left',
              body: 'Copy is translated by message, then validated for placeholders and plurals. Layout uses logical properties only. Rejected: an English site with a translate button.',
              href: '/notes/multilingual',
            },
            {
              id: 'testing',
              title: 'A test plan that is published',
              body: 'Unit, property, mutation, component, API, end-to-end, accessibility, visual, performance and security layers, each written down with what it does not catch. Rejected: coverage as the goal.',
              href: '/notes/testing',
            },
            {
              id: 'restraint',
              title: 'Words before WebGL',
              body: 'This page used to be a 3D laptop on a tree stump. It now explains the work instead of staging it, and three.js has left the route. Rejected: a scene that hid the content and cost a GPU.',
              href: '/notes/discoverability',
            },
          ],
        },
        {
          type: 'outcomes',
          title: 'Outcomes',
          items: [
            { id: 'languages', label: 'Languages served', derive: 'locales' },
            { id: 'rtl', label: 'Read right to left', derive: 'rtlLocales' },
            { id: 'vitest', label: 'Vitest test cases', derive: 'vitestCases' },
            { id: 'browser', label: 'Browser test cases', derive: 'browserCases' },
            { id: 'notes', label: 'Published engineering notes', derive: 'notes' },
          ],
        },
      ],
    },
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
    // portfolio lands on that page later. Kept in the ring on owner
    // direction (2026-09-06): the /uses button takes the Resume slot below
    // instead, not this one.
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
    // Replaced the Resume ring button (issue #37, owner-directed 2026-09-06
    // — the spec's option A had /uses take My Past's slot; the owner kept
    // My Past and gave /uses this one instead). Same reasoning as the
    // GitHub → Journey and LinkedIn → Guestbook swaps above: the ring's
    // eight slots are prime navigation real estate, and a hop out to a PDF
    // earns one less than the in-app /uses instrument panel does. The CV is
    // not gone — it keeps its slot in the footer's ELSEWHERE terminal
    // (footer-data.js socialLinks `resumeUrl`), where external destinations
    // live. Swapping IN PLACE (not appending) matters: the sub-480px
    // two-column layout slices BtnList 0-3 / 4-7, so a ninth entry would
    // silently vanish on phones.
    label: 'Uses',
    link: '/uses',
    icon: 'uses',
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
// (BTEC is 2019–2021 with the OCNLR cert before it, not the CV's 2017 start).
//
// The Unisys range was the one exception, and it went the other way: this file
// carried MAY 2023 — SEP 2024 against the CV's APR 2023 — JUL 2024, and the
// owner confirmed on 2026-09-12 that the CV is correct. Corrected here, so the
// two documents now agree — which matters because the CV is itself a
// deliberately-indexed public surface (#32 W1b) and /about derives its
// employment figure from this array. `tests/unit/cvJourneyConsistency.test.js`
// compares the two and fails on any disagreement that is not written down.
// Keep all three date fields in step.
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
    id: 'j-adullam-lead',
    year: 2026,
    dateLabel: 'OCT 2026 →',
    start: '2026-10',
    end: null,
    org: 'Adullam Homes Housing Association',
    title: 'Concierge Team Leader · Adullam Homes Housing Association',
    description:
      'Area-level lead for concierge services across eight supported-accommodation sites in Bolton — leading three teams across two organisations, hiring for the region, managing incidents, and replacing two separate spreadsheet rotas with a Microsoft Teams shift-management tool that offers open shifts to staff directly.',
    type: 'career',
    tags: ['Team leadership', 'Hiring manager', 'Microsoft Teams'],
    link: null,
  },
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
    org: 'Adullam Homes Housing Association',
    title: 'Concierge · Adullam Homes Housing Association',
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
    dateLabel: 'APR 2023 — JUL 2024',
    start: '2023-04',
    end: '2024-07',
    org: 'Unisys',
    title: 'Software Engineer · Unisys',
    description:
      '16-month industrial placement in Manchester: shipped full-stack C# / .NET (Blazor) features that lifted system efficiency ~20%, cut production issues 30% owning support triage, and stepped up to lead a project team to an on-time delivery that won follow-on client contracts.',
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

// /uses (issue #37) — the HAND-SET half of the setup page. Everything that
// can be counted or crawled is NOT here: package versions, workflow names and
// spec counts come from src/lib/uses/buildFacts.js at build, and the stack's
// live tiles + repo counts come from /api/github-skills. What lives here is
// what only the owner can state — the hardware, the bench, the sanitised
// editor excerpt — plus the CURATED stack fallback the plate shows before the
// crawl lands (and instead of it when GitHub is unreachable, with the live
// claim dropped).
//
// Provenance of the machine rows: model / chip / memory / display from the
// build machine's own hardware report; macOS 26.6 on Darwin 25.6 from
// `sw_vers`; the 1440 × 900 logical width is the fluid-scale unity viewport
// (src/lib/fluidScale.js). The phone model is deliberately unstated.
//
// editorFrame.lines is the sanitised settings.json excerpt: only keys that
// carry no path, token, email or machine name. The SAME array feeds the
// EditorFrame render and the palette's "Copy my editor settings" action, so
// what is shown is exactly what is copied (CLAUDE.md §1 applies to what is
// rendered, not just what is committed).
export const usesData = {
  machine: [
    {
      label: 'Machine',
      value: '13-inch MacBook Pro · Apple M1 · 16 GB unified memory',
    },
    {
      label: 'Display',
      value: '2560 × 1600 Retina · 1440 × 900 logical',
      note: 'The fluid-scale unity viewport — every sub-page is authored at scale 1 on exactly this width, then breathes from one factor.',
    },
    {
      label: 'OS',
      value: 'macOS 26 · Darwin 25.6',
    },
    {
      label: 'Phone',
      value: 'iPhone, running OwnTracks in HTTP mode',
      note: 'It posts a location fix to /api/location; the town and local time in the footer come from this device.',
      href: '#footer-location',
      hrefLabel: 'see the town it feeds',
    },
  ],
  bench: [
    {
      role: 'Editor',
      name: 'Visual Studio Code',
      detail: 'Dracula theme · vscode-icons · Prettier on save',
      link: 'https://code.visualstudio.com/',
    },
    {
      role: 'Agentic pair',
      name: 'Claude Code',
      detail:
        'VS Code extension + CLI — skills, subagents and MCP servers (Chrome DevTools, Playwright) drive the browser during verification',
      link: 'https://claude.com/claude-code',
    },
    {
      role: 'Terminal & shell',
      // Names only: a station's `name` is not in any catalogue, so prose here
      // (it once read 'the VS Code terminal') stays English in every locale.
      // The pseudo-locale gate caught it.
      name: 'zsh · macOS Terminal · VS Code',
      detail: 'Node pinned by .nvmrc through nvm · Homebrew for everything else',
    },
    {
      role: 'Formatting & lint',
      name: 'Prettier + ESLint',
      detail: 'prettier-plugin-tailwindcss · eslint-config-next (core-web-vitals)',
    },
    {
      role: 'Type',
      name: 'Inter · Montserrat · Varela Round',
      detail: 'next/font/google — self-hosted at build, so the fonts never shift layout',
    },
    {
      role: 'Browser tooling',
      name: 'Chrome DevTools · Playwright · Lighthouse',
      detail:
        'Pixel probes, reduced-motion emulation and the e2e gate all run against real Chromium',
    },
  ],
  extensions: [
    'Claude Code',
    'Tailwind CSS IntelliSense',
    'ESLint',
    'Prettier',
    'GitLens',
  ],
  editorFrame: {
    fileName: 'settings.json',
    theme: 'Dracula',
    lines: [
      '{',
      '  "workbench.colorTheme": "Dracula Theme",',
      '  "workbench.iconTheme": "vscode-icons",',
      '  "editor.defaultFormatter": "esbenp.prettier-vscode",',
      '  "editor.formatOnSave": true,',
      '  "[dockercompose]": {',
      '    "editor.tabSize": 2',
      '  }',
      '}',
    ],
    status: ['Dracula Theme', 'UTF-8', 'Spaces: 2', 'Prettier'],
  },
  // Curated FALLBACK only — the shape /api/github-skills emits, minus the
  // per-skill repos (a curated list cannot know them, so the tiles show no
  // count until the live payload lands). Mirrors the crawl's detected set at
  // the time of writing; the live payload is the source of truth.
  stack: {
    languages: [
      { slug: 'javascript', displayName: 'JavaScript', source: 'skillicons' },
      { slug: 'typescript', displayName: 'TypeScript', source: 'skillicons' },
      { slug: 'html', displayName: 'HTML', source: 'skillicons' },
      { slug: 'css', displayName: 'CSS', source: 'skillicons' },
      { slug: 'bash', displayName: 'Bash', source: 'skillicons' },
      { slug: 'cs', displayName: 'C#', source: 'skillicons' },
      { slug: 'php', displayName: 'PHP', source: 'skillicons' },
    ],
    frameworks: [
      { slug: 'nextjs', displayName: 'Next.js', source: 'skillicons' },
      { slug: 'react', displayName: 'React', source: 'skillicons' },
      { slug: 'tailwindcss', displayName: 'Tailwind CSS', source: 'skillicons' },
      { slug: 'expressjs', displayName: 'Express', source: 'skillicons' },
      { slug: 'vuejs', displayName: 'Vue.js', source: 'skillicons' },
      { slug: 'bootstrap', displayName: 'Bootstrap', source: 'skillicons' },
    ],
    libraries: [
      { slug: 'threejs', displayName: 'Three.js', source: 'skillicons' },
      { slug: 'framer', displayName: 'Framer Motion', source: 'simpleicons' },
      { slug: 'prisma', displayName: 'Prisma', source: 'skillicons' },
      { slug: 'reacthookform', displayName: 'React Hook Form', source: 'simpleicons' },
      { slug: 'axios', displayName: 'Axios', source: 'simpleicons' },
      { slug: 'sharp', displayName: 'sharp', source: 'simpleicons' },
      { slug: 'upstash', displayName: 'upstash', source: 'simpleicons' },
      { slug: 'postcss', displayName: 'postcss', source: 'simpleicons' },
      { slug: 'autoprefixer', displayName: 'autoprefixer', source: 'simpleicons' },
      { slug: 'testinglibrary', displayName: 'testing-library', source: 'simpleicons' },
      { slug: 'swiper', displayName: 'Swiper', source: 'simpleicons' },
      { slug: 'dotenv', displayName: 'dotenv', source: 'simpleicons' },
      { slug: 'nodemon', displayName: 'nodemon', source: 'simpleicons' },
      { slug: 'tsnode', displayName: 'ts-node', source: 'simpleicons' },
    ],
    tools: [
      { slug: 'nodejs', displayName: 'Node.js', source: 'skillicons' },
      { slug: 'vercel', displayName: 'Vercel', source: 'skillicons' },
      { slug: 'docker', displayName: 'Docker', source: 'skillicons' },
      { slug: 'vite', displayName: 'Vite', source: 'skillicons' },
      { slug: 'vitest', displayName: 'Vitest', source: 'skillicons' },
      { slug: 'jest', displayName: 'Jest', source: 'skillicons' },
      { slug: 'mocha', displayName: 'Mocha', source: 'simpleicons' },
      { slug: 'chai', displayName: 'Chai', source: 'simpleicons' },
      { slug: 'eslint', displayName: 'ESLint', source: 'simpleicons' },
      { slug: 'prettier', displayName: 'Prettier', source: 'simpleicons' },
      { slug: 'redis', displayName: 'Redis', source: 'skillicons' },
      { slug: 'mysql', displayName: 'MySQL', source: 'skillicons' },
      { slug: 'sqlite', displayName: 'SQLite', source: 'skillicons' },
      { slug: 'swagger', displayName: 'Swagger', source: 'simpleicons' },
    ],
    software: [{ slug: 'github', displayName: 'GitHub', source: 'skillicons' }],
  },
};
