// A project's public URL (issue #31 follow-up): `/projects/<slug>`, where the
// slug is the project's name in lowercase (`/projects/theabdullahfolio`,
// `/projects/afaaqx`). Until then the URL was the numeric id (`/projects/1`);
// those URLs answer a permanent redirect to the slug (next.config.mjs,
// `projectRedirects`), so links and search results already out there keep
// working and hand their weight to the new address.
//
// EVERY project URL is built here: the cards, the page's canonical and
// structured data, the sitemap, llms.txt, the share images, the ⌘K palette and
// Ask's citations. Pure, with no data import, so a client component can call it
// on a record it was handed without pulling projectsData into its bundle.
//
// A record may pin its own `slug` in data.js. Set one before renaming a
// project, or the rename moves its URL.

/** The URL segment for a project: an explicit `slug`, else the lowercased name. */
export function projectSlug(project) {
  return project.slug ?? project.name.toLowerCase();
}

/** The project's path, unprefixed (the locale is added by the link or canonical). */
export function projectPath(project) {
  return `/projects/${projectSlug(project)}`;
}

/** The project a URL segment names, or undefined. Exact match: one URL each. */
export function projectBySlug(projects, slug) {
  return projects.find((p) => projectSlug(p) === slug);
}

/**
 * Throws unless every slug is URL-safe and unique. Run at build (the project
 * route's generateStaticParams), so a project whose name would collide with
 * another, or would need escaping in a URL, fails `next build`.
 */
export function assertProjectSlugs(projects) {
  const seen = new Map();
  for (const p of projects) {
    const slug = projectSlug(p);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      throw new Error(`projects[${p.id}]: slug "${slug}" is not lowercase letters, digits and single hyphens; set \`slug\` in data.js`);
    }
    if (/^\d+$/.test(slug)) {
      throw new Error(`projects[${p.id}]: slug "${slug}" is all digits, which the old id redirects would capture`);
    }
    if (seen.has(slug)) {
      throw new Error(`projects[${p.id}] and projects[${seen.get(slug)}] share the slug "${slug}"; set \`slug\` on one`);
    }
    seen.set(slug, p.id);
  }
}

/**
 * The permanent redirects from the old numeric URLs, one per project, in
 * English and under every other locale prefix. `next.config.mjs` returns them
 * from `redirects()`, which runs before the locale proxy.
 *
 * @param {{ id: number, name: string, slug?: string }[]} projects
 * @param {string[]} localePrefixes the non-default locale codes (`ar`, `ja`, …)
 */
export function projectRedirects(projects, localePrefixes) {
  const out = [];
  for (const p of projects) {
    const to = projectPath(p);
    out.push({ source: `/projects/${p.id}`, destination: to, permanent: true });
    for (const code of localePrefixes) {
      out.push({ source: `/${code}/projects/${p.id}`, destination: `/${code}${to}`, permanent: true });
    }
  }
  return out;
}
