// Plain-English copy for the /uses Stack plate (owner direction, 2026-09-05):
// a recruiter who has never written code must be able to read the plate —
// what each CATEGORY is, and what each TOOL is for. The crawl behind the
// plate (/api/github-skills) knows only a slug, a display name, an icon
// source and repository counts, so this dictionary is the one hand-set
// layer on an otherwise live plate. Keyed by the crawl's slug; a slug with
// no entry falls back to its category's generic line rather than to
// nothing, and the unit suite asserts every slug in the curated set has
// real copy so a new tool never silently ships the generic.
//
// Voice: one sentence, no jargon left unexplained, ≤ 90 characters so it
// holds to two lines in a card. Say what the thing DOES, not what it is
// called. Pure data — no React, no DOM.

export const CATEGORY_COPY = {
  languages: {
    label: 'Languages',
    lay: 'What the code itself is written in.',
    generic: 'A programming language this code is written in.',
  },
  frameworks: {
    label: 'Frameworks',
    lay: 'The scaffolding an application is built on: its structure and its conventions.',
    generic: 'A framework: the scaffolding an application is built on.',
  },
  libraries: {
    label: 'Libraries',
    lay: 'Ready-made building blocks, each pulled in to do one job well.',
    generic: 'A library: a ready-made building block pulled in for one job.',
  },
  tools: {
    label: 'Tools',
    lay: 'What runs around the code: testing, formatting, databases and deployment.',
    generic: 'A tool that runs around the code: building, testing, storing or shipping it.',
  },
  software: {
    label: 'Software',
    lay: 'The services the finished work lives on.',
    generic: 'A service the finished work lives on.',
  },
};

export const TOOL_COPY = {
  // ── Languages ─────────────────────────────────────────────────────────
  javascript: 'The language web browsers run natively; with Node.js it runs the server too.',
  typescript: 'JavaScript with a type system, so mistakes surface while writing, not for users.',
  html: 'The structure of every web page: the headings, text, links and images a browser reads.',
  css: 'The styling language: colour, spacing, type and layout for everything on screen.',
  bash: 'The language of the terminal, used for small scripts that automate a machine.',
  cs: "Microsoft's C#, a general-purpose language for desktop and back-end applications.",
  php: 'A server-side language that assembles web pages before they reach the browser.',
  python: 'A readable general-purpose language for scripts, data work and automation.',
  java: 'A long-established language for large, portable back-end systems.',
  kotlin: 'A modern language for Android apps and back-end services.',
  swift: "Apple's language for iPhone, iPad and Mac apps.",
  go: 'A compact, fast language built for servers and cloud tooling.',
  rust: 'A systems language that guarantees memory safety without a garbage collector.',
  ruby: 'A friendly scripting language best known for web apps built with Rails.',
  dart: "Google's language behind Flutter apps.",
  sass: 'CSS with variables, nesting and reuse, compiled down to plain CSS.',
  markdown: 'Plain-text formatting for documents: READMEs, notes and docs.',
  sql: 'The query language for relational databases: asking tables for exactly the rows you need.',

  // ── Frameworks ────────────────────────────────────────────────────────
  nextjs: 'The React framework this site is built on: pages, routing and server rendering.',
  react: 'The component library behind the interface: the UI as small reusable pieces.',
  tailwindcss: 'Utility-class styling: the design system expressed directly in the markup.',
  expressjs: 'The minimal server framework for Node.js: routes, requests and responses.',
  vuejs: 'A progressive front-end framework, an alternative to React for building interfaces.',
  bootstrap: 'A ready-made kit of layouts and components for building pages quickly.',
  angular: "Google's full-featured framework for large front-end applications.",
  svelte: 'A front-end framework that compiles components into tiny, fast plain JavaScript.',
  nuxt: 'The Vue framework for full-stack apps: routing, server rendering and data.',
  astro: 'A framework for content sites that ships almost no JavaScript to the browser.',
  remix: 'A React framework centred on web standards, forms and fast data loading.',
  flutter: "Google's toolkit for building mobile, web and desktop apps from one codebase.",
  django: "Python's batteries-included web framework: database, admin and auth built in.",
  flask: 'A small Python web framework for APIs and simple sites.',
  laravel: "PHP's most popular web framework: elegant routing, database and auth.",
  dotnet: "Microsoft's platform for building web, desktop and cloud applications.",
  jquery: 'The classic JavaScript library that made cross-browser scripting painless.',
  redux: 'A predictable store for an app’s state, shared across every component.',
  graphql: 'A query language for APIs: ask for exactly the data you need in one request.',

  // ── Libraries ─────────────────────────────────────────────────────────
  threejs: '3D graphics in the browser: the WebGL scenes on this site.',
  framer: "The animation library behind this site's motion: springs, reveals and gestures.",
  prisma: 'A type-safe bridge between application code and a database.',
  reacthookform: 'Forms in React with validation and almost no re-rendering.',
  axios: 'A tidy way for code to call web APIs and handle what comes back.',
  sharp: 'High-speed image processing: resizing and converting pictures on the server.',
  upstash: 'Serverless Redis: the live data store behind the guestbook and the footer.',
  postcss: 'A pipeline that transforms CSS; Tailwind and autoprefixer both run through it.',
  autoprefixer: 'Adds the browser-specific prefixes CSS needs so styles work everywhere.',
  testinglibrary: 'Tests that exercise the interface the way a real user would.',
  swiper: 'Touch-friendly carousels and sliders.',
  dotenv: 'Loads secrets and settings from a local file instead of the code.',
  nodemon: 'Restarts a server automatically whenever its code changes.',
  tsnode: 'Runs TypeScript directly, without a separate build step.',
  lodash: 'A toolbox of small utilities for working with lists, objects and text.',
  zod: 'Declares the shape data must have, then checks real data against it.',
  socketio: 'Live two-way messaging between browser and server.',
  mongoose: 'A structured way to talk to a MongoDB database from Node.js.',
  d3: 'The data-visualisation library: turns numbers into charts and maps.',
  gsap: 'A high-performance animation toolkit for the web.',
  storybook: 'A workshop for building and reviewing UI components in isolation.',

  // ── Tools ─────────────────────────────────────────────────────────────
  nodejs: 'JavaScript outside the browser: the runtime behind every server here.',
  vercel: 'The platform this site deploys to: builds, previews and hosting.',
  docker: 'Packages an app with everything it needs so it runs the same anywhere.',
  vite: 'A fast development server and bundler for front-end projects.',
  vitest: "A test runner built for Vite projects: this repository's unit tests.",
  jest: 'A test runner for JavaScript: proves the code does what it claims.',
  mocha: 'A flexible test runner, usually paired with Chai.',
  chai: "An assertion library: the 'expect this to equal that' inside a test.",
  eslint: 'Reads code for mistakes and inconsistencies before it ever runs.',
  prettier: 'Formats code automatically so every file reads the same way.',
  redis: 'An in-memory data store for things that must be fast: caches, counters, sessions.',
  mysql: 'A relational database: tables, rows and the queries between them.',
  sqlite: 'A whole database in a single file, ideal for small apps and tests.',
  swagger: 'Documents an API so others can read and try it without the source.',
  postgresql: 'A powerful open-source relational database.',
  postgres: 'A powerful open-source relational database.',
  mongodb: 'A document database: records stored as flexible JSON-like objects.',
  firebase: "Google's hosted backend: database, auth and hosting without a server to run.",
  supabase: 'An open-source hosted backend: a Postgres database with auth and APIs built in.',
  aws: "Amazon's cloud: the servers, storage and services behind much of the web.",
  gcp: "Google's cloud platform for hosting and running applications.",
  azure: "Microsoft's cloud platform for hosting and running applications.",
  git: 'Version control: every change to the code, recorded and reversible.',
  githubactions: "GitHub's automation: tests, checks and deploys that run on every push.",
  webpack: 'Bundles many source files into the few a browser downloads.',
  babel: 'Translates modern JavaScript so older browsers can run it.',
  npm: "JavaScript's package manager: installs and updates the libraries a project uses.",
  pnpm: 'A fast, disk-efficient package manager for JavaScript projects.',
  yarn: 'A package manager for JavaScript projects.',
  linux: 'The operating system most servers run on.',
  nginx: 'A web server and traffic director in front of applications.',
  kubernetes: 'Runs and scales containerised apps across many machines.',
  cypress: 'End-to-end tests that drive a real browser through the app.',
  playwright: 'Browser automation and end-to-end tests across Chrome, Firefox and Safari.',
  postman: 'A workbench for building, sending and testing API requests.',
  figma: 'The design tool where interfaces are drawn before they are built.',
  vscode: "Microsoft's code editor, the one this site is written in.",
  terminal: 'The command line: where builds, tests and deploys are run.',

  // ── Software ──────────────────────────────────────────────────────────
  github: 'Where the code lives: version control, reviews and automation.',
  gitlab: 'A platform for hosting code with built-in CI/CD pipelines.',
  notion: 'A workspace for notes, docs and planning.',
  slack: 'Team messaging.',
  discord: 'Voice and text communities.',
};

// The card's one-line description: the tool's own copy, else its category's
// generic line, else nothing (an unknown category renders no description).
export function describeTool(slug, category) {
  return TOOL_COPY[slug] ?? CATEGORY_COPY[category]?.generic ?? '';
}
