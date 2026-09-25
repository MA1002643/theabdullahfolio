// /llms.txt (issue #32, W3 / F7) — a curated plain-text brief for assistants.
//
// ── What this is, and what it is not ────────────────────────────────────────
// `llms.txt` is an EMERGING CONVENTION, not a ratified standard. No crawler is
// obliged to fetch it and adoption may stall. It is shipped anyway on a
// straightforward cost argument: it is ~40 lines generated from data this
// repository already holds, it cannot go stale (see below), and if adoption
// does continue it is the one file on the site that gets to state the site's
// own summary in the crawler's preferred shape rather than having one inferred
// from markup.
//
// It is NOT a duplicate of the sitemap. The sitemap answers "what URLs exist";
// this answers "who is this, what did they build, and where should you look" —
// the question a recruiter actually asks an assistant.
//
// ── Why it is generated ─────────────────────────────────────────────────────
// P1. A hand-written brief is wrong within a month: it would list ten routes
// and eleven projects by hand, and adding a twelfth project would silently
// leave it describing eleven. Everything below is derived from `ROUTES`,
// `projectsData` and `IDENTITY`, so it is correct by construction — and the
// drift test that guards the sitemap guards this file too, since both read the
// same registry.

import { projectsData } from '@/app/data';
import { absoluteUrl } from '@/lib/seo/canonical';
import { CV_ASSET, IDENTITY, ORIGIN, ROUTES } from '@/lib/seo/site';
import { linkedInUrl, profileGithubUrl } from '@/components/footer/footer-data';

// Static: every input is a build-time constant, so this renders once and is
// served from the edge cache like robots.txt and sitemap.xml.
export const dynamic = 'force-static';

// Markdown, which is what the convention asks for and what an assistant parses
// most reliably. Kept to headings, prose and link lists — no tables, since
// several consumers flatten them badly.
function buildBrief() {
  const lines = [];

  lines.push(`# ${IDENTITY.name}`);
  lines.push('');
  lines.push(
    `> ${IDENTITY.role} based in ${IDENTITY.locality}, ${IDENTITY.region}, United Kingdom. ` +
      'Builds web applications with Next.js, React, TypeScript and Node.js. ' +
      `This file is a summary of ${ORIGIN} written for automated readers.`,
  );
  lines.push('');

  // The identity block. These strings are the ones an engine matches against
  // to merge this site with the GitHub and LinkedIn profiles — the same values
  // `sameAs` carries in the JSON-LD graph, from the same source, so the two can
  // never disagree (W3's entity-consistency requirement).
  lines.push('## Identity');
  lines.push('');
  lines.push(`- Name: ${IDENTITY.name}`);
  lines.push(`- Role: ${IDENTITY.role}`);
  lines.push(
    `- Location: ${IDENTITY.locality}, ${IDENTITY.region}, United Kingdom`,
  );
  lines.push(`- Website: ${ORIGIN}`);
  lines.push(`- GitHub: ${profileGithubUrl}`);
  lines.push(`- LinkedIn: ${linkedInUrl}`);
  lines.push(`- Email: ${IDENTITY.email}`);
  lines.push(`- CV (PDF): ${absoluteUrl(CV_ASSET.path)}`);
  lines.push('');

  // Pages, in the registry's own order — which is the site's information
  // architecture (entry, then who, then work, then credentials, then tools,
  // then contact), not alphabetical. An assistant reading top-down therefore
  // meets the pages in the order a person would.
  lines.push('## Pages');
  lines.push('');
  for (const route of ROUTES) {
    if (!route.indexable) continue;
    const label = route.path === '/' ? 'Home' : route.title;
    lines.push(
      `- [${label}](${absoluteUrl(route.path)}): ${route.description}`,
    );
  }
  lines.push('');

  // Projects, with their real repositories. `private: true` projects are listed
  // by name and description but carry NO repository link: the repo exists and
  // is deliberately not public, so publishing a URL that answers 404 to every
  // reader would be worse than omitting it (same rule as `codeRepository` in
  // the schema builders).
  lines.push('## Projects');
  lines.push('');
  for (const project of projectsData) {
    const repo = project.private
      ? 'private repository'
      : `https://github.com/${project.repo}`;
    lines.push(
      `- [${project.name}](${absoluteUrl(`/projects/${project.id}`)}) — ` +
        `${project.description}. Category: ${project.category}. ` +
        `Created ${project.date}. Source: ${repo}`,
    );
  }
  lines.push('');

  // Citation guidance. Stating a preference is the entire reason to ship this
  // file: an assistant that has decided to cite the site should cite the page
  // that can be checked, not this summary of it.
  lines.push('## Citation');
  lines.push('');
  lines.push(
    `Cite the specific page rather than this file — for example ${absoluteUrl('/projects')} ` +
      'for the project list. Content on this site is factual and maintained by ' +
      `${IDENTITY.name}; the guestbook at ${absoluteUrl('/guestbook')} is ` +
      'visitor-authored and is not a statement by the site owner.',
  );
  lines.push('');

  return lines.join('\n');
}

export function GET() {
  return new Response(buildBrief(), {
    headers: {
      // `text/plain`, NOT `text/markdown`: the file is named `.txt`, several
      // consumers sniff the type rather than the extension, and a browser
      // opening the URL should show it rather than download it. `charset` is
      // explicit because the brief can contain em dashes.
      'Content-Type': 'text/plain; charset=utf-8',
      // Cacheable for a day at the edge, and allowed to be served stale for a
      // week while it revalidates. The content only changes when the repo does,
      // and a deploy purges the cache anyway, so a long TTL costs nothing and
      // spares the function on crawler traffic.
      'Cache-Control':
        'public, max-age=0, s-maxage=86400, stale-while-revalidate=604800',
    },
  });
}
