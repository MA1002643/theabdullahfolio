import { SIMPLE_ICONS_SLUGS } from "@/utils/simpleIconsSlugs";
import { CATEGORY_ORDER } from "@/utils/skillsIconUrl";

// Skill detection → icon mapping for the About-page skills grid (issue #20).
//
// SERVER-SIDE detection module. It builds SKILL_MAP and pulls in the ~3.4k-slug
// Simple Icons catalog (`simpleIconsSlugs.js`) at module load, so it is HEAVY and
// must NOT reach the client bundle — it's imported ONLY by the /api/github-skills
// route, which maps raw detected language/dependency names (GitHub language names
// + manifest keys) through `resolveSkill` and buckets them with
// `categorizeSkills*`. Client components ("use client") get the small,
// catalog-free helpers (`getIconUrl`, `CATEGORY_ORDER`, `emptyCategories`) from
// the sibling `skillsIconUrl.js` instead. There is NO hardcoded display list —
// the grid is sourced entirely from the live GitHub crawl.
//
// COVERAGE — two tiers, curated first then a catalog fallback:
//   1. CURATED (the SKILLS table below): every icon skillicons.dev serves (its
//      full canonical set) plus a handful skillicons lacks (ESLint, Prettier,
//      NumPy, …) via `source: "simpleicons"`. Curated rows give the nice display
//      name + correct category, and OWN ambiguous short names (e.g. "ai", "go").
//   2. FALLBACK (`simpleIconsFallback`): any detected name NOT in the curated
//      table is normalised with Simple Icons' own slug algorithm and, if that
//      slug exists in the bundled ~3.4k-slug catalog (`simpleIconsSlugs.js`),
//      resolves to it. This covers the long tail of named frameworks/libraries/
//      tools without hand-listing each. Membership is a LOCAL set lookup, so an
//      unknown name is still dropped (never a broken image).
// To pin a specific display name/category or override the fallback, add a row to
// the curated table; its slug MUST be a real skillicons short name (or a valid
// simpleicons slug when source is "simpleicons"), else the icon 404s.

// CATEGORY_ORDER (the grid's category sequence) is imported from the client-safe
// `skillsIconUrl` module above — single source of truth shared with the UI —
// and used below to build SKILL_MAP and to bucket detections.

// Compact source-of-truth, grouped by category. Each row is
//   [slug, displayName, aliases?, source?]
//   slug        — skillicons short name (or simpleicons slug if source set)
//   displayName — human label shown in the hover overlay
//   aliases     — extra LOWERCASE detected names that resolve here: GitHub
//                 language names, npm/pip package keys (incl. scoped), short
//                 codes. The slug and displayName are auto-registered as keys
//                 too, so list only the EXTRA spellings.
//   source      — "skillicons" (default) | "simpleicons"
//
// Ambiguous one/two-letter codes (e.g. "ai" → Illustrator) are deliberately
// omitted as aliases — "ai" is far more likely the Vercel AI SDK package than
// Adobe Illustrator, and a wrong icon is worse than none.
const SKILLS = {
  languages: [
    ["javascript", "JavaScript", ["js"]],
    ["typescript", "TypeScript", ["ts"]],
    ["python", "Python", ["py", "jupyter notebook", "jupyter"]],
    ["c", "C"],
    ["cpp", "C++", ["c++"]],
    ["cs", "C#", ["c#", "csharp"]],
    ["java", "Java"],
    ["kotlin", "Kotlin"],
    ["swift", "Swift"],
    ["golang", "Go", ["go"]],
    ["rust", "Rust"],
    ["ruby", "Ruby"],
    ["php", "PHP"],
    ["perl", "Perl"],
    ["scala", "Scala", ["sc"]],
    ["dart", "Dart"],
    ["elixir", "Elixir"],
    ["haskell", "Haskell"],
    ["haxe", "Haxe"],
    ["lua", "Lua"],
    ["r", "R"],
    ["julia", "Julia"],
    ["ocaml", "OCaml"],
    ["clojure", "Clojure"],
    ["crystal", "Crystal"],
    ["nim", "Nim"],
    ["zig", "Zig"],
    ["v", "V", ["vlang"]],
    ["vala", "Vala"],
    ["fortran", "Fortran"],
    ["forth", "Forth"],
    ["matlab", "MATLAB"],
    ["octave", "Octave"],
    ["coffeescript", "CoffeeScript"],
    ["solidity", "Solidity"],
    ["css", "CSS", ["css3"]],
    ["html", "HTML", ["html5"]],
    ["sass", "Sass", ["scss"]],
    ["less", "Less", ["lesscss"]],
    ["graphql", "GraphQL", ["gql"]],
    ["bash", "Bash", ["shell", "sh"]],
    ["powershell", "PowerShell", ["pwsh"]],
    ["latex", "LaTeX", ["tex"]],
    ["markdown", "Markdown", ["md", "mdx"]],
    ["regex", "RegEx", ["regexp"]],
    ["svg", "SVG"],
    ["pug", "Pug", ["pugjs"]],
    ["gherkin", "Gherkin"],
    ["verilog", "Verilog"],
    ["webassembly", "WebAssembly", ["wasm"]],
    ["aiscript", "AiScript"],
    ["pkl", "Pkl"],
  ],
  frameworks: [
    ["react", "React"],
    ["angular", "Angular", ["@angular/core", "angularjs"]],
    ["vuejs", "Vue.js", ["vue", "vue.js", "@vue/cli"]],
    ["svelte", "Svelte", ["sveltekit", "@sveltejs/kit"]],
    ["solidjs", "SolidJS", ["solid", "solid-js"]],
    ["nextjs", "Next.js", ["next", "next.js"]],
    ["nuxtjs", "Nuxt.js", ["nuxt", "nuxt.js"]],
    ["gatsby", "Gatsby", ["gatsbyjs"]],
    ["remix", "Remix", ["@remix-run/react"]],
    ["astro", "Astro"],
    ["ember", "Ember", ["emberjs", "ember.js"]],
    ["lit", "Lit", ["lit-element", "lit-html"]],
    ["alpinejs", "Alpine.js", ["alpine"]],
    ["htmx", "htmx"],
    ["qt", "Qt", ["pyqt"]],
    ["gtk", "GTK"],
    ["flutter", "Flutter"],
    ["django", "Django"],
    ["flask", "Flask"],
    ["fastapi", "FastAPI"],
    ["elysia", "Elysia"],
    ["expressjs", "Express", ["express"]],
    ["nestjs", "NestJS", ["nest", "@nestjs/core"]],
    ["laravel", "Laravel"],
    ["rails", "Rails", ["rubyonrails", "ruby-on-rails"]],
    ["spring", "Spring", ["springboot", "spring-boot", "springframework", "org.springframework", "org.springframework.boot"]],
    ["symfony", "Symfony"],
    ["streamlit", "Streamlit", [], "simpleicons"],
    ["ktor", "Ktor", ["ktorio", "io.ktor"]],
    ["adonis", "AdonisJS", ["adonisjs", "@adonisjs/core"]],
    ["actix", "Actix", ["actix-web"]],
    ["rocket", "Rocket"],
    ["yew", "Yew"],
    ["bevy", "Bevy"],
    ["dotnet", ".NET", ["net", ".net", "dotnetcore"]],
    ["hibernate", "Hibernate", ["org.hibernate", "hibernate-core"]],
    ["bootstrap", "Bootstrap"],
    ["tailwindcss", "Tailwind CSS", ["tailwind"]],
    ["windicss", "Windi CSS", ["windi"]],
    ["vuetify", "Vuetify"],
    ["electron", "Electron"],
    ["tauri", "Tauri", ["@tauri-apps/api"]],
    ["godot", "Godot"],
    ["unity", "Unity"],
    ["unrealengine", "Unreal Engine", ["unreal"]],
    ["robloxstudio", "Roblox Studio"],
    ["gamemakerstudio", "GameMaker Studio"],
    ["haxeflixel", "HaxeFlixel"],
    ["processing", "Processing"],
    ["p5js", "p5.js", ["p5"]],
    ["ros", "ROS"],
  ],
  libraries: [
    ["redux", "Redux", ["@reduxjs/toolkit", "reduxjs"]],
    ["pinia", "Pinia"],
    ["materialui", "Material UI", ["mui", "@mui/material", "material-ui"]],
    ["emotion", "Emotion", ["@emotion/react", "@emotion/styled"]],
    ["styledcomponents", "styled-components", ["styled-components"]],
    ["threejs", "Three.js", ["three", "three.js"]],
    ["d3", "D3.js", ["d3-node", "d3js"]],
    ["jquery", "jQuery"],
    ["prisma", "Prisma", ["@prisma/client"]],
    ["sequelize", "Sequelize"],
    ["apollo", "Apollo", ["@apollo/client", "apollo-server"]],
    ["reactivex", "ReactiveX", ["rxjs", "rxjava", "rx"]],
    ["pytorch", "PyTorch", ["torch"]],
    ["tensorflow", "TensorFlow", ["tf"]],
    ["scikitlearn", "scikit-learn", ["sklearn", "scikit-learn"]],
    ["opencv", "OpenCV", ["opencv-python"]],
    // Python data/ML/web libraries — not in skillicons, use Simple Icons.
    ["numpy", "NumPy", [], "simpleicons"],
    ["pandas", "pandas", [], "simpleicons"],
    ["scipy", "SciPy", [], "simpleicons"],
    ["keras", "Keras", [], "simpleicons"],
    ["sqlalchemy", "SQLAlchemy", [], "simpleicons"],
    ["celery", "Celery", [], "simpleicons"],
    ["swiper", "Swiper", [], "simpleicons"],
    ["discordjs", "Discord.js", ["discord.js"]],
    ["supabase", "Supabase", ["@supabase/supabase-js"]],
    ["firebase", "Firebase"],
    ["appwrite", "Appwrite"],
    // Common, but not in skillicons — fall back to Simple Icons.
    ["framer", "Framer Motion", ["framer-motion", "framermotion", "motion"], "simpleicons"],
    ["axios", "Axios", [], "simpleicons"],
    ["zod", "Zod", [], "simpleicons"],
    ["chakraui", "Chakra UI", ["@chakra-ui/react", "chakra-ui"], "simpleicons"],
    ["reacthookform", "React Hook Form", ["react-hook-form"], "simpleicons"],
  ],
  tools: [
    ["git", "Git"],
    ["docker", "Docker", ["dockerfile"]],
    ["kubernetes", "Kubernetes", ["k8s"]],
    ["ansible", "Ansible"],
    ["terraform", "Terraform"],
    ["jenkins", "Jenkins"],
    ["githubactions", "GitHub Actions", ["ghactions", "github-actions"]],
    ["gradle", "Gradle"],
    ["maven", "Maven"],
    ["cmake", "CMake"],
    ["npm", "npm"],
    ["yarn", "Yarn"],
    ["pnpm", "pnpm"],
    ["bun", "Bun"],
    ["deno", "Deno"],
    ["nodejs", "Node.js", ["node", "node.js"]],
    ["vite", "Vite", ["vitejs"]],
    ["webpack", "Webpack"],
    ["rollupjs", "Rollup", ["rollup", "rollup.js"]],
    ["gulp", "Gulp"],
    ["babel", "Babel", ["@babel/core"]],
    ["cypress", "Cypress"],
    ["jest", "Jest"],
    ["vitest", "Vitest"],
    ["selenium", "Selenium"],
    ["nginx", "Nginx"],
    ["prometheus", "Prometheus"],
    ["grafana", "Grafana"],
    ["sentry", "Sentry"],
    ["kafka", "Kafka", ["apachekafka"]],
    ["rabbitmq", "RabbitMQ"],
    ["elasticsearch", "Elasticsearch"],
    ["redis", "Redis"],
    ["mongodb", "MongoDB", ["mongo", "mongoose"]],
    ["mysql", "MySQL", ["mysql2"]],
    ["postgresql", "PostgreSQL", ["postgres", "psql"]],
    ["sqlite", "SQLite", ["sqlite3"]],
    ["cassandra", "Cassandra"],
    ["dynamodb", "DynamoDB"],
    ["planetscale", "PlanetScale"],
    ["aws", "AWS", ["amazonwebservices", "amazon-web-services"]],
    ["gcp", "Google Cloud", ["googlecloud", "google-cloud"]],
    ["azure", "Azure", ["microsoftazure"]],
    ["cloudflare", "Cloudflare", ["cf"]],
    ["workers", "Cloudflare Workers", ["cloudflare-workers"]],
    ["heroku", "Heroku"],
    ["netlify", "Netlify"],
    ["vercel", "Vercel"],
    ["openshift", "OpenShift"],
    ["openstack", "OpenStack"],
    ["azul", "Azul"],
    ["anaconda", "Anaconda"],
    ["ipfs", "IPFS"],
    ["arduino", "Arduino"],
    ["raspberrypi", "Raspberry Pi", ["rpi"]],
    ["linux", "Linux"],
    ["ubuntu", "Ubuntu"],
    ["debian", "Debian"],
    ["arch", "Arch Linux", ["archlinux", "arch-linux"]],
    ["kali", "Kali Linux", ["kalilinux"]],
    ["mint", "Linux Mint", ["linuxmint"]],
    ["nix", "Nix", ["nixos"]],
    ["redhat", "Red Hat", ["rhel"]],
    ["bsd", "BSD", ["freebsd"]],
    ["windows", "Windows"],
    ["apple", "Apple", ["macos", "ios"]],
    // Common, but not in skillicons — fall back to Simple Icons.
    ["eslint", "ESLint", [], "simpleicons"],
    ["prettier", "Prettier", [], "simpleicons"],
    ["storybook", "Storybook", ["@storybook/react"], "simpleicons"],
    ["pytest", "pytest", [], "simpleicons"],
    ["poetry", "Poetry", [], "simpleicons"],
    ["mocha", "Mocha", ["mochajs"], "simpleicons"],
    ["chai", "Chai", ["chaijs"], "simpleicons"],
    ["swagger", "Swagger", ["swagger-ui", "swagger-ui-express", "swagger-autogen", "swagger-jsdoc"], "simpleicons"],
  ],
  software: [
    ["vscode", "VS Code", ["visualstudiocode", "vs-code"]],
    ["vscodium", "VSCodium"],
    ["visualstudio", "Visual Studio", ["vs"]],
    ["idea", "IntelliJ IDEA", ["intellij", "intellijidea"]],
    ["pycharm", "PyCharm"],
    ["webstorm", "WebStorm"],
    ["phpstorm", "PhpStorm"],
    ["clion", "CLion"],
    ["rider", "Rider"],
    ["eclipse", "Eclipse"],
    ["androidstudio", "Android Studio", ["android-studio"]],
    ["neovim", "Neovim", ["nvim"]],
    ["vim", "Vim", ["vim script"]],
    ["emacs", "Emacs", ["emacs lisp"]],
    ["sublime", "Sublime Text", ["sublimetext"]],
    ["atom", "Atom"],
    ["obsidian", "Obsidian"],
    ["notion", "Notion"],
    ["figma", "Figma"],
    ["photoshop", "Photoshop", ["ps"]],
    ["illustrator", "Illustrator"],
    ["xd", "Adobe XD", ["adobexd"]],
    ["premiere", "Premiere Pro", ["pr"]],
    ["aftereffects", "After Effects", ["ae", "after-effects"]],
    ["audition", "Audition", ["au"]],
    ["sketchup", "SketchUp"],
    ["blender", "Blender"],
    ["autocad", "AutoCAD"],
    ["ableton", "Ableton"],
    ["github", "GitHub"],
    ["gitlab", "GitLab"],
    ["bitbucket", "Bitbucket"],
    ["codepen", "CodePen"],
    ["replit", "Replit"],
    ["stackoverflow", "Stack Overflow"],
    ["devto", "DEV.to", ["dev.to"]],
    ["postman", "Postman"],
    ["spotify", "Spotify"],
    ["discord", "Discord"],
    ["discordbots", "Discord Bots", ["bots"]],
    ["twitter", "Twitter", ["x"]],
    ["instagram", "Instagram"],
    ["linkedin", "LinkedIn"],
    ["gmail", "Gmail"],
    ["mastodon", "Mastodon"],
    ["misskey", "Misskey"],
    ["fediverse", "Fediverse"],
    ["activitypub", "ActivityPub"],
    ["wordpress", "WordPress"],
    ["webflow", "Webflow"],
    ["plan9", "Plan 9"],
  ],
};

// Build the lookup Map from the table: each icon is keyed by its slug, its
// lowercased displayName, and every alias — so a GitHub language name, an npm
// package key, or a short code all resolve to the same entry. Later rows would
// overwrite an earlier key, but the table is kept collision-free by design.
export const SKILL_MAP = new Map();
for (const category of CATEGORY_ORDER) {
  for (const [slug, displayName, aliases = [], source = "skillicons"] of SKILLS[category]) {
    const entry = { slug, displayName, category, source };
    SKILL_MAP.set(slug.toLowerCase(), entry);
    SKILL_MAP.set(displayName.toLowerCase(), entry);
    for (const alias of aliases) SKILL_MAP.set(alias.toLowerCase(), entry);
  }
}

// NOTE: there is intentionally no hardcoded skill list here. The skills grid is
// now sourced ENTIRELY from a live GitHub crawl (languages + manifest
// dependencies); `SKILL_MAP` above is only the detected-name → icon lookup, not
// a list of things to render. Anything not present in your repos won't appear.

// Simple Icons builds a slug from a brand TITLE with this exact transform
// (mirrors their `titleToSlug`): lowercase → expand a few symbols/letters →
// strip accents → drop every remaining non-alphanumeric. Applying it to a
// dependency name lets "socket.io" → "socketdotio", "tailwindcss" →
// "tailwindcss", "c++" → "cplusplus" resolve against the bundled catalog. It
// only matches when the package name ≈ the brand name; mismatches (e.g.
// "torch" → PyTorch) are exactly what the curated table handles first.
const SI_REPLACEMENTS = {
  "+": "plus",
  ".": "dot",
  "&": "and",
  đ: "d",
  ħ: "h",
  ı: "i",
  ĸ: "k",
  ł: "l",
  ß: "ss",
  ŧ: "t",
  ø: "o",
};
const SI_REPLACE_RE = /[+.&đħıĸłßŧø]/g;
function toSimpleIconsSlug(name) {
  return name
    .toLowerCase()
    .replace(SI_REPLACE_RE, (ch) => SI_REPLACEMENTS[ch] ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip combining diacritical marks
    .replace(/[^a-z0-9]/g, "");
}

// Generic single-word slugs that exist in the Simple Icons catalog but, as a
// raw dependency name, almost always mean the ordinary English word rather than
// the brand — block them from the FALLBACK so they don't render a misleading
// logo. Curated rows are unaffected (they resolve before the fallback runs).
const FALLBACK_DENY = new Set([
  "html", "css", "json", "xml", "share", "x", "now", "stack",
  "home", "page", "box", "io", "ui", "api", "app", "web", "dev", "cli",
]);

// Long-tail fallback bucket. Categories are never shown as headings, so this
// only affects grid ordering; "libraries" is the neutral middle for the npm/
// PyPI/crates long tail most fallback hits come from.
const FALLBACK_CATEGORY = "libraries";

// Candidate spellings to try against the Simple Icons catalog for one detected
// name: the whole name, and — for scoped/vendored names ("@scope/pkg",
// "vendor/pkg") — each path segment, so "@nestjs/core" can match via "nestjs".
function fallbackCandidates(key) {
  const out = [key];
  if (key.includes("/")) {
    for (const part of key.replace(/^@/, "").split("/")) {
      if (part) out.push(part);
    }
  }
  return out;
}

// Resolve a detected name to a Simple Icons catalog entry, or null. Used only
// after the curated map misses. Skips obvious false-positive words and slugs
// shorter than 2 chars (one-letter brands are ambiguous and curated-owned).
function simpleIconsFallback(key) {
  for (const candidate of fallbackCandidates(key)) {
    if (FALLBACK_DENY.has(candidate)) continue;
    const slug = toSimpleIconsSlug(candidate);
    if (slug.length < 2 || FALLBACK_DENY.has(slug)) continue;
    if (SIMPLE_ICONS_SLUGS.has(slug)) {
      // Show the original detected name (recognisable) rather than the mangled
      // slug; `categorizeSkills` dedupes by slug so repeats collapse.
      return { slug, displayName: candidate, category: FALLBACK_CATEGORY, source: "simpleicons" };
    }
  }
  return null;
}

/**
 * Resolve a raw detected name (language or dependency) to its icon entry.
 * Case-insensitive and whitespace-trimmed. Tries the curated map first, then
 * the Simple Icons catalog fallback. Returns null for anything neither covers —
 * callers MUST drop nulls so an unmapped tool never renders as a broken image
 * (issue #20, acceptance #8).
 *
 * @param {string} name
 * @returns {{ slug: string, displayName: string, category: string, source: string } | null}
 */
export function resolveSkill(name) {
  if (typeof name !== "string") return null;
  const key = name.trim().toLowerCase();
  if (!key) return null;
  const direct = SKILL_MAP.get(key);
  if (direct) return direct;
  // Scoped/vendored names ("@types/express", "@nestjs/core", "vlucas/phpdotenv"):
  // a path segment often names a curated brand. Prefer that over the catalog
  // fallback so the dep MERGES with the brand (keeping its display name +
  // category) instead of duplicating it under a different slug.
  if (key.includes("/")) {
    for (const part of key.replace(/^@/, "").split("/")) {
      const seg = SKILL_MAP.get(part);
      if (seg) return seg;
    }
  }
  return simpleIconsFallback(key);
}

/**
 * Bucket a flat list of raw detected names into the category shape the UI
 * consumes: `{ languages: [...], frameworks: [...], ... }`, every category
 * present (possibly empty), each item `{ slug, displayName, source }`.
 *
 * Unmapped names are silently dropped. Duplicate slugs (aliases like
 * "next"/"nextjs", or the same tool detected in many repos) collapse to one
 * entry, keeping first-seen order within the category.
 *
 * @param {string[]} names
 * @returns {Record<string, Array<{ slug: string, displayName: string, source: string }>>}
 */
export function categorizeSkills(names) {
  const categories = Object.fromEntries(CATEGORY_ORDER.map((c) => [c, []]));
  const seen = new Set();
  const list = Array.isArray(names) ? names : [];
  for (const name of list) {
    const entry = resolveSkill(name);
    if (!entry) continue;
    if (seen.has(entry.slug)) continue;
    seen.add(entry.slug);
    // `category` is validated against CATEGORY_ORDER so a typo in the table
    // can't push an item into a bucket the UI never iterates.
    const bucket = categories[entry.category];
    if (!bucket) continue;
    bucket.push({ slug: entry.slug, displayName: entry.displayName, source: entry.source });
  }
  return categories;
}

// Cap repos listed per skill so a ubiquitous tool (e.g. Git) can't bloat the
// payload; the popover lists the rest as "+N more" if it ever matters.
const MAX_REPOS_PER_SKILL = 60;

/**
 * Like `categorizeSkills`, but the input maps each detected name to the
 * repositories (`nameWithOwner`) that surfaced it — public ones in `repos`,
 * private ones in `privateRepos` — and each emitted item carries the merged,
 * de-duped PUBLIC repo list plus a bare `privateRepoCount`, so the UI can show
 * "which repos use this language/framework/tool" and "N private repositories"
 * without ever disclosing a private name. Aliases that resolve to the same slug
 * merge their repos (e.g. "next" + "nextjs" → Next.js); private identities are
 * needed here PRECISELY for that merge (per-slug dedupe), then reduced to a
 * count — they must never be emitted. A plain string[] value is tolerated as a
 * public-only list (the pre-privateRepos shape).
 *
 * @param {Record<string, string[] | { repos: string[], privateRepos?: string[] }>} nameToRepos
 * @returns {Record<string, Array<{slug, displayName, source, repos: Array<{name, nameWithOwner, url}>, privateRepoCount: number}>>}
 */
export function categorizeSkillsWithRepos(nameToRepos) {
  const categories = Object.fromEntries(CATEGORY_ORDER.map((c) => [c, []]));
  const bySlug = new Map();
  const entries = nameToRepos && typeof nameToRepos === "object" ? Object.entries(nameToRepos) : [];
  for (const [name, value] of entries) {
    const entry = resolveSkill(name);
    if (!entry) continue;
    let agg = bySlug.get(entry.slug);
    if (!agg) {
      agg = { entry, repos: new Set(), privateRepos: new Set() };
      bySlug.set(entry.slug, agg);
    }
    const repos = Array.isArray(value) ? value : value?.repos;
    const privateRepos = Array.isArray(value) ? [] : value?.privateRepos;
    if (Array.isArray(repos)) for (const r of repos) if (r) agg.repos.add(r);
    if (Array.isArray(privateRepos)) for (const r of privateRepos) if (r) agg.privateRepos.add(r);
  }
  for (const { entry, repos, privateRepos } of bySlug.values()) {
    const bucket = categories[entry.category];
    if (!bucket) continue;
    const repoList = [...repos]
      .sort((a, b) => a.localeCompare(b))
      .slice(0, MAX_REPOS_PER_SKILL)
      .map((nwo) => ({
        name: nwo.includes("/") ? nwo.split("/").pop() : nwo,
        nameWithOwner: nwo,
        url: `https://github.com/${nwo}`,
      }));
    bucket.push({
      slug: entry.slug,
      displayName: entry.displayName,
      source: entry.source,
      repos: repoList,
      // Count only — the private Set's contents stop here by design.
      privateRepoCount: privateRepos.size,
    });
  }
  // The crawl records detections concurrently (two privacy scopes + a per-repo
  // fan-out), so `bySlug` insertion order — and thus each bucket's order — varies
  // run-to-run for an IDENTICAL detected set. Sort each bucket deterministically
  // (display name, slug as tiebreaker) so the payload is STABLE: the client's
  // order-sensitive `skillsFingerprint` would otherwise churn on every fetch,
  // defeating its "nothing changed" fast-path (a needless localStorage rewrite
  // each time) and reshuffling the rendered grid even when nothing changed.
  for (const bucket of Object.values(categories)) {
    bucket.sort(
      (a, b) =>
        a.displayName.localeCompare(b.displayName, undefined, { sensitivity: "base" }) ||
        a.slug.localeCompare(b.slug),
    );
  }
  return categories;
}

// `getIconUrl` now lives in the client-safe `skillsIconUrl.js` so UI components
// can build icon URLs without importing this heavy detection module (the
// SKILL_MAP build + the ~3.4k-slug Simple Icons catalog).
