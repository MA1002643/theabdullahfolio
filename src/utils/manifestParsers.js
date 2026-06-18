// Multi-ecosystem manifest parsing for the About-page skills crawl (issue #20).
//
// The /api/github-skills route pulls a fixed set of dependency manifests INLINE
// per repo (one GraphQL `file(path:)` alias each — see MANIFESTS) and runs the
// matching parser here to extract raw dependency / package names. Those names
// are unioned with the repo's GitHub language list and handed to
// `categorizeSkills`, which resolves each to an icon and SILENTLY DROPS anything
// unmapped. So these parsers are deliberately permissive: over-extraction is
// harmless (unmapped noise is dropped downstream), under-extraction loses a
// detection. The goal is breadth, not a faithful dependency resolver.
//
// SCOPE: only the repo's DEFAULT-BRANCH ROOT path of each manifest is fetched
// (GraphQL resolves `file(path:)` to an exact path). Nested manifests in a
// monorepo (e.g. `packages/*/package.json`, `services/api/requirements.txt`)
// are not crawled — that would need a tree walk per repo and blow the
// serverless budget. Root manifests cover the overwhelming majority of repos.
//
// Pure + framework-agnostic (no Node/Next imports) so it stays unit-testable
// and reusable. No TOML/YAML/XML dependency is pulled in: each parser is a
// lightweight line/regex scanner tuned to the dependency-bearing sections only.

// The manifests fetched per repo. `alias` is the GraphQL field alias (must be a
// valid GraphQL name — alphanumeric, no dots/slashes); `path` is the exact
// default-branch root path passed to `file(path:)`. Add a row here AND a case
// in `parseManifest` to cover a new ecosystem.
export const MANIFESTS = [
  { alias: "packageJson", path: "package.json" }, // JS / Node (npm, pnpm, yarn, bun)
  { alias: "requirementsTxt", path: "requirements.txt" }, // Python (pip)
  { alias: "pyprojectToml", path: "pyproject.toml" }, // Python (poetry / PEP 621)
  { alias: "pipfile", path: "Pipfile" }, // Python (pipenv)
  { alias: "goMod", path: "go.mod" }, // Go modules
  { alias: "cargoToml", path: "Cargo.toml" }, // Rust (cargo)
  { alias: "gemfile", path: "Gemfile" }, // Ruby (bundler)
  { alias: "composerJson", path: "composer.json" }, // PHP (composer)
  { alias: "pubspecYaml", path: "pubspec.yaml" }, // Dart / Flutter (pub)
  { alias: "pomXml", path: "pom.xml" }, // Java / JVM (Maven)
  { alias: "buildGradle", path: "build.gradle" }, // Java / JVM (Gradle, Groovy DSL)
  { alias: "buildGradleKts", path: "build.gradle.kts" }, // Kotlin (Gradle, Kotlin DSL)
];

// ---------------------------------------------------------------------------
// Shared low-level helpers
// ---------------------------------------------------------------------------

// Split a Python requirement spec ("Flask>=2.0  # web", "requests[socks]==1")
// down to its bare, lowercased distribution name. Returns null for comments,
// option lines (-r/-e/--hash), VCS/URL/local installs, and blanks.
function pyRequirementName(spec) {
  const s = String(spec).split("#")[0].trim();
  if (!s || s.startsWith("-")) return null;
  if (/^(git\+|hg\+|svn\+|bzr\+|https?:|file:|\.{1,2}\/)/i.test(s)) return null;
  // Name runs until the first version operator, extras bracket, env marker,
  // or whitespace. PEP 503 names are [A-Za-z0-9._-].
  const m = s.match(/^([A-Za-z0-9][A-Za-z0-9._-]*)/);
  return m ? m[1].toLowerCase() : null;
}

// Carve a flat TOML document into { header, lines } sections. `header` is the
// dotted table name ("" for the pre-header preamble). Naive by design: it does
// not track inline tables or multi-line values, but every parser here only
// needs the keys of dependency tables, which sit one-per-line. Array-of-tables
// headers (`[[bin]]`) don't match the single-bracket pattern and are ignored.
function tomlSections(text) {
  const sections = [];
  let current = { header: "", lines: [] };
  for (const line of String(text).split(/\r?\n/)) {
    const h = line.match(/^\s*\[([^[\]]+)\]\s*$/);
    if (h) {
      sections.push(current);
      current = { header: h[1].trim(), lines: [] };
    } else {
      current.lines.push(line);
    }
  }
  sections.push(current);
  return sections;
}

// Left-hand-side keys of `key = value` lines in a TOML section body. Tolerates
// quoted keys (`"my-dep" = ...`). Skips comments and array/table continuation.
function tomlKeys(lines) {
  const keys = [];
  for (const line of lines) {
    if (/^\s*#/.test(line)) continue;
    const m = line.match(/^\s*["']?([A-Za-z0-9][A-Za-z0-9._-]*)["']?\s*=/);
    if (m) keys.push(m[1]);
  }
  return keys;
}

// String items of every `<key> = [ ... ]` array whose key matches `keyName`,
// across the whole document (arrays may span lines). The leading `(?:^|[^\w-])`
// guard prevents `optional-dependencies = [` from matching `dependencies`.
function tomlArrayValues(text, keyName) {
  const values = [];
  const re = new RegExp(`(?:^|[^\\w-])${keyName}\\s*=\\s*\\[([\\s\\S]*?)\\]`, "gm");
  let m;
  while ((m = re.exec(text)) !== null) {
    for (const item of m[1].split(",")) {
      const s = item.trim().replace(/^["']|["']$/g, "").trim();
      if (s) values.push(s);
    }
  }
  return values;
}

// ---------------------------------------------------------------------------
// Per-ecosystem parsers — each returns a flat array of raw detected names.
// ---------------------------------------------------------------------------

// package.json — runtime + dev dependency keys (the JS framework/library tier).
function parsePackageJson(text) {
  const names = [];
  try {
    const pkg = JSON.parse(text);
    for (const field of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) {
      for (const dep of Object.keys(pkg?.[field] ?? {})) names.push(dep);
    }
  } catch {
    // Malformed package.json — skip its deps; the repo's languages still count.
  }
  return names;
}

// requirements.txt — one bare distribution name per line.
function parseRequirementsTxt(text) {
  const names = [];
  for (const line of String(text).split(/\r?\n/)) {
    const n = pyRequirementName(line);
    if (n) names.push(n);
  }
  return names;
}

// pyproject.toml — Poetry dependency tables (keys) + PEP 621 `dependencies`
// array (specs). `python` is the interpreter constraint, not a package, so drop
// it; the Python language is already detected from the GitHub language list.
function parsePyproject(text) {
  const names = [];
  for (const sec of tomlSections(text)) {
    if (/^tool\.poetry(\.group\.[^.]+)?\.(dependencies|dev-dependencies)$/.test(sec.header)) {
      for (const k of tomlKeys(sec.lines)) {
        if (k.toLowerCase() !== "python") names.push(k.toLowerCase());
      }
    }
  }
  for (const spec of tomlArrayValues(text, "dependencies")) {
    const n = pyRequirementName(spec);
    if (n) names.push(n);
  }
  return names;
}

// Pipfile — [packages] / [dev-packages] table keys (TOML).
function parsePipfile(text) {
  const names = [];
  for (const sec of tomlSections(text)) {
    if (/^(packages|dev-packages)$/.test(sec.header)) {
      for (const k of tomlKeys(sec.lines)) {
        if (k.toLowerCase() !== "python_version") names.push(k.toLowerCase());
      }
    }
  }
  return names;
}

// go.mod — every `<module-path> v<version>` line (inside or outside a require
// block). Adds both the full module path and its last path segment, since the
// segment ("gin", "echo", "chi") is the recognisable library name. The `module`
// and `go` directives carry no `v<digits>` token and are skipped.
function parseGoMod(text) {
  const names = [];
  for (const line of String(text).split(/\r?\n/)) {
    const m = line.match(/^\s*(?:require\s+)?(\S+)\s+v[0-9]/);
    if (m && m[1].includes("/")) {
      const path = m[1].toLowerCase();
      names.push(path);
      names.push(path.split("/").pop());
    }
  }
  return names;
}

// Cargo.toml — keys of any [dependencies] / [dev-dependencies] /
// [build-dependencies] table, including target-conditional variants
// (`[target.'cfg(unix)'.dependencies]`).
function parseCargoToml(text) {
  const names = [];
  for (const sec of tomlSections(text)) {
    if (/(?:^|\.)(?:dependencies|dev-dependencies|build-dependencies)$/.test(sec.header)) {
      for (const k of tomlKeys(sec.lines)) names.push(k.toLowerCase());
    }
  }
  return names;
}

// Gemfile — `gem "name"` declarations (Ruby DSL).
function parseGemfile(text) {
  const names = [];
  const re = /\bgem\s+["']([^"']+)["']/g;
  let m;
  while ((m = re.exec(text)) !== null) names.push(m[1].toLowerCase());
  return names;
}

// composer.json — `require` / `require-dev` keys are `vendor/package`. Adds the
// full key plus both halves so either spelling can resolve (e.g. vendor
// "laravel" → Laravel, "symfony" → Symfony). The PHP runtime and platform
// packages (`php`, `ext-*`, `lib-*`) are not libraries.
function parseComposerJson(text) {
  const names = [];
  try {
    const json = JSON.parse(text);
    for (const field of ["require", "require-dev"]) {
      for (const rawKey of Object.keys(json?.[field] ?? {})) {
        const key = rawKey.toLowerCase();
        if (key === "php" || key === "composer" || key.startsWith("ext-") || key.startsWith("lib-")) {
          continue;
        }
        names.push(key);
        const slash = key.indexOf("/");
        if (slash > 0) {
          names.push(key.slice(0, slash));
          names.push(key.slice(slash + 1));
        }
      }
    }
  } catch {
    // Malformed composer.json — skip; the repo's languages still count.
  }
  return names;
}

// pubspec.yaml — keys directly under `dependencies:` / `dev_dependencies:` /
// `dependency_overrides:`. A top-level (column-0) key ends the block. Nested
// keys (sdk:, version:, git:) get captured too but are unmapped → dropped.
// `flutter:` under dependencies is exactly how the Flutter SDK is declared.
function parsePubspec(text) {
  const names = [];
  let inDeps = false;
  for (const line of String(text).split(/\r?\n/)) {
    if (/^(dependencies|dev_dependencies|dependency_overrides)\s*:/.test(line)) {
      inDeps = true;
      continue;
    }
    if (/^\S/.test(line)) inDeps = false;
    if (!inDeps) continue;
    const m = line.match(/^\s+([A-Za-z0-9_]+)\s*:/);
    if (m) names.push(m[1].toLowerCase());
  }
  return names;
}

// pom.xml — every <artifactId> and <groupId>. Maven coordinates are
// group + artifact; emitting both maximises the chance one resolves.
function parsePomXml(text) {
  const names = [];
  for (const re of [/<artifactId>\s*([^<\s]+)\s*<\/artifactId>/g, /<groupId>\s*([^<\s]+)\s*<\/groupId>/g]) {
    let m;
    while ((m = re.exec(text)) !== null) names.push(m[1].trim().toLowerCase());
  }
  return names;
}

// build.gradle(.kts) — `"group:artifact:version"` dependency coordinates in any
// configuration (implementation, api, testImplementation, …). Adds the group,
// the artifact, and the group's last dotted segment (so "org.springframework"
// → "springframework", which an alias maps to Spring).
function parseGradle(text) {
  const names = [];
  const re = /["']([A-Za-z0-9_.-]+):([A-Za-z0-9_.-]+)(?::[^"']*)?["']/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const group = m[1].toLowerCase();
    const artifact = m[2].toLowerCase();
    names.push(group, artifact);
    if (group.includes(".")) names.push(group.split(".").pop());
  }
  return names;
}

/**
 * Parse one manifest's text into a flat array of raw detected names, dispatched
 * by its path. Unknown paths and non-string input return []. Names are NOT
 * deduped or icon-resolved here — that's `categorizeSkills`'s job.
 *
 * @param {string} path  one of MANIFESTS[].path
 * @param {string} text  raw file contents
 * @returns {string[]}
 */
export function parseManifest(path, text) {
  if (typeof text !== "string" || text.length === 0) return [];
  switch (path) {
    case "package.json":
      return parsePackageJson(text);
    case "requirements.txt":
      return parseRequirementsTxt(text);
    case "pyproject.toml":
      return parsePyproject(text);
    case "Pipfile":
      return parsePipfile(text);
    case "go.mod":
      return parseGoMod(text);
    case "Cargo.toml":
      return parseCargoToml(text);
    case "Gemfile":
      return parseGemfile(text);
    case "composer.json":
      return parseComposerJson(text);
    case "pubspec.yaml":
      return parsePubspec(text);
    case "pom.xml":
      return parsePomXml(text);
    case "build.gradle":
    case "build.gradle.kts":
      return parseGradle(text);
    default:
      return [];
  }
}
