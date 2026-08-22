import { ImageResponse } from 'next/og';
import { projectsData } from '@/app/data';
import { projectCard, sectionCard } from '@/lib/og/card';
import { ogFonts } from '@/lib/og/assets';

// Per-project share poster (issue #88 v2, tier 2). The route segment's
// generateStaticParams + dynamicParams=false mean one card per project
// is rendered AT BUILD TIME and served static — sharing
// ma.codes/projects/3 unfurls that project's own poster at zero runtime
// cost.
export const alt = 'Project card · Muhammad Abdullah — ma.codes';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// The page's generateStaticParams does NOT extend to sibling metadata
// image handlers — without this pair the poster route builds as
// server-rendered-on-demand. Restating both here is what makes all
// eleven cards render at build time and serve static.
export function generateStaticParams() {
  return projectsData.map((p) => ({ id: String(p.id) }));
}
export const dynamicParams = false;

export default async function Image({ params }) {
  const project = projectsData.find((p) => String(p.id) === String(params.id));

  // dynamicParams=false makes this unreachable, but a metadata image
  // should degrade to the generic card rather than ever failing a build.
  const card = project
    ? await projectCard({
        name: project.name,
        category: project.category,
        description: project.description,
        date: project.date,
      })
    : await sectionCard({
        label: 'Projects',
        tagline: 'Web, systems, and apps — built in the open.',
      });

  return new ImageResponse(card, { ...size, fonts: await ogFonts() });
}
