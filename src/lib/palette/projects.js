import { projectsData } from '@/app/data';
import { getDataT } from '@/i18n/getDataT';
import { localizeCategory, localizeProject } from '@/i18n/data';

// The project list the sitewide ⌘K palette offers (issue #41), built on the
// SERVER and handed to the client as a prop by the root layout.
//
// Server-side on purpose: importing projectsData into the palette would put
// all of data.js (33 kB of source) into the first-load JS of every route.
// This hands over only what a palette row needs, already in the visitor's
// language: the name (a proper noun, never translated), the category as the
// hint, and search keywords in BOTH languages, so "recipe" finds the recipe
// app from /ja/ as well as from /.
export async function paletteProjects(locale) {
  const t = await getDataT(locale);
  return projectsData.map((p) => {
    const local = localizeProject(p, t);
    const category = localizeCategory(p.category, t);
    const keywords = [...new Set([local.description, p.description, category, p.category])]
      .filter(Boolean)
      .join(' ');
    return { id: p.id, name: p.name, hint: category, keywords };
  });
}
