'use client';

import { useMemo } from 'react';
import { usePaletteActions } from '@/components/commandPalette/registry';
import { projectGithubUrl } from '@/components/footer/footer-data';
import { jumpToChapter } from './ChapterIndex';

// The project page's ⌘K commands (issue #31), on the JourneyPalette seam: a
// config component that renders nothing and contributes to the one palette
// the root layout mounts, only while this page is mounted.
//
//   project-chapter-<type>  jump to each chapter, in page order
//   project-open-demo       the live site, when there is one
//   project-open-source     the repository, when it is public
//
// Every label arrives from the server already translated, so this costs the
// route no client messages. Ids are prefixed `project-chapter-` / `project-open-`
// so they can never meet the sitewide `project-<id>` rows.
//
// No source command for the site's OWN repository: the sitewide "View source"
// already opens exactly that URL, and two commands for one destination is the
// duplicate the house rules forbid (the /journey `open-cv` defect).

/** Pure builder, exported for the unit suite. */
export function buildProjectActions({ chapters, links, copy, openExternal = defaultOpen, jump = jumpToChapter }) {
  const jumps = chapters.map((c) => ({
    id: `project-chapter-${c.type}`,
    label: copy.jump(c.title),
    section: copy.section,
    keywords: `chapter section jump ${c.type} ${c.title}`,
    perform: () => jump(c.anchor),
  }));
  const external = [
    links.demo
      ? {
          id: 'project-open-demo',
          label: copy.demo,
          hint: hostOf(links.demo),
          section: copy.section,
          keywords: 'live demo site open visit',
          perform: () => openExternal(links.demo),
        }
      : null,
    links.source && links.source !== projectGithubUrl
      ? {
          id: 'project-open-source',
          label: copy.source,
          hint: 'github.com',
          section: copy.section,
          keywords: 'source code github repo repository',
          perform: () => openExternal(links.source),
        }
      : null,
  ].filter(Boolean);
  return [...jumps, ...external];
}

function defaultOpen(url) {
  window.open(url, '_blank', 'noopener,noreferrer');
}

function hostOf(url) {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/**
 * @param {{ projectId: number, chapters: {type:string, anchor:string, title:string, jumpLabel:string}[],
 *   links: {demo:string|null, source:string|null}, section: string, demoLabel: string, sourceLabel: string }} props
 */
export default function ProjectPalette({ projectId, chapters, links, section, demoLabel, sourceLabel }) {
  const actions = useMemo(() => {
    const labels = new Map(chapters.map((c) => [c.title, c.jumpLabel]));
    return buildProjectActions({
      chapters,
      links,
      copy: { section, demo: demoLabel, source: sourceLabel, jump: (title) => labels.get(title) ?? title },
    });
  }, [chapters, links, section, demoLabel, sourceLabel]);
  usePaletteActions(`project-${projectId}`, actions);
  return null;
}
