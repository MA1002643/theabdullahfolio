import { Fragment } from 'react';
import { getTranslations } from 'next-intl/server';
import { getDataT } from '@/i18n/getDataT';
import { localizeCaseStudy, localizeCategory, localizeProject } from '@/i18n/data';
import { formatNumber, intlTag } from '@/i18n/format';
import { languagesFor } from '@/lib/seo/projectLanguages';
import { deriveChapters } from '@/lib/caseStudy/chapters';
import { resolveFigure } from '@/lib/caseStudy/figures';
import { groupStack, languageStackItems } from '@/lib/caseStudy/stack';
import { resolveStackVersion } from '@/lib/caseStudy/versions';
import { diagramNodeIds } from './diagrams';
import ChapterIndex from './ChapterIndex';
import ProjectPalette from './ProjectPalette';
import Hero from './chapters/Hero';
import Overview from './chapters/Overview';
import Statement from './chapters/Statement';
import WalkthroughChapter from './chapters/WalkthroughChapter';
import GalleryChapter from './chapters/GalleryChapter';
import Architecture from './chapters/Architecture';
import Notes from './chapters/Notes';
import Outcomes from './chapters/Outcomes';
import Stack from './chapters/Stack';

// The project page body (issue #31). Server Component, and the ONE place the
// page is assembled: it localizes the project, derives the chapter list once
// (deriveChapters), resolves every title, figure, version and label, and
// hands the chapters, the index and the palette the same list. So the index,
// the ⌘K jumps and the rendered sections can never disagree.
//
// Everything a client island receives is already a string or a number in the
// reader's language (a Server Component cannot pass a function across).
//
// Two forms, one template: a project with a `caseStudy` renders its authored
// chapters; one without renders the short form (overview from the listing
// fields, then the repository's languages as a "Built with" chapter).

/** "Jul 2025" in the reader's language, from a `YYYY-MM` or `YYYY-MM-DD`. */
function monthYear(value, locale) {
  if (!value) return null;
  const [y, m = '01'] = value.split('-');
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, 1));
  return new Intl.DateTimeFormat(intlTag(locale), { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(date);
}

function yearOf(value, locale) {
  if (!value) return null;
  return formatNumber(Number(value.slice(0, 4)), locale, { useGrouping: false });
}

export default async function CaseStudy({ project, locale }) {
  const t = await getTranslations({ locale, namespace: 'ProjectDetail' });
  const dataT = await getDataT(locale);

  const cs = localizeCaseStudy(project, dataT);
  const description = localizeProject(project, dataT).description;
  const category = localizeCategory(project.category, dataT);
  const languages = languagesFor(project) ?? [];
  const { form, chapters } = deriveChapters(cs ? { ...project, caseStudy: cs } : project, {
    hasLanguages: languages.length > 0,
  });

  // Outbound links, with the same rules as the listing: a private repository
  // is never published, and a "demo" that is only the repository again is
  // dropped rather than shown twice under two names.
  const repoUrl = project.repo ? `https://github.com/${project.repo}` : null;
  const links = {
    source: project.private ? null : repoUrl,
    demo: project.demoLink && project.demoLink !== repoUrl ? project.demoLink : null,
    private: Boolean(project.private),
  };

  const titleOf = (c) => c.data?.title ?? t(`chapters.${c.type}`);
  const titled = chapters.map((c) => ({ ...c, title: titleOf(c) }));

  // Two-digit ordinals ("01", "٠١") for the chapter numerals, the walkthrough
  // steps and the craft-note cards, in the reader's digits.
  const ordinal = (i) => formatNumber(i + 1, locale, { minimumIntegerDigits: 2 });

  const sr = (chunks) => <span className="sr-only">{chunks}</span>;
  const startedAt = cs?.timeline?.start ?? project.date;
  const year = yearOf(startedAt, locale);

  // ── Overview facts ────────────────────────────────────────────────────────
  const overviewFacts = () => {
    if (form === 'full') {
      const tl = cs.timeline;
      const start = monthYear(tl?.start, locale);
      const facts = [];
      if (cs.role) facts.push({ id: 'role', label: t('facts.role'), value: cs.role });
      if (start) {
        facts.push({
          id: 'timeline',
          label: t('facts.timeline'),
          value: tl.end
            ? t('facts.timelineRange', { start, end: monthYear(tl.end, locale) })
            : t('facts.timelineOngoing', { start }),
        });
      }
      const authored = titled.find((c) => c.type === 'overview')?.data?.facts ?? [];
      return [...facts, ...authored];
    }
    const facts = [{ id: 'category', label: t('facts.category'), value: category }];
    const started = monthYear(project.date, locale);
    if (started) facts.push({ id: 'started', label: t('facts.started'), value: started });
    if (repoUrl) {
      facts.push(
        links.source
          ? { id: 'repository', label: t('facts.repository'), value: t('facts.public'), href: links.source }
          : { id: 'repository', label: t('facts.repository'), value: t('facts.private') },
      );
    }
    if (links.demo) {
      facts.push({ id: 'live', label: t('facts.live'), value: new URL(links.demo).host, href: links.demo, translate: 'no' });
    }
    return facts;
  };

  // ── Built with ────────────────────────────────────────────────────────────
  // Authored items for a full case study; the repository's languages for the
  // short form. Versions are read from the lockfile at build, never typed.
  const stackGroups = (items) =>
    groupStack(items).map((g) => ({
      id: g.group,
      label: t(`stack.groups.${g.group}`),
      count: formatNumber(g.items.length, locale),
      items: g.items.map((item) => {
        const version = resolveStackVersion(item);
        return {
          id: item.id,
          label: item.label,
          body: item.body ?? null,
          icon: item.icon ?? null,
          version,
          versionLabel: version ? t('stack.version', { version }) : null,
        };
      }),
    }));

  // ── One renderer per chapter type ─────────────────────────────────────────
  const render = (c, index) => {
    const base = { anchor: c.anchor, title: c.title, number: ordinal(index) };
    const d = c.data ?? {};
    switch (c.type) {
      case 'overview':
        return (
          <Overview
            {...base}
            body={form === 'full' ? d.body : t('shortForm.pending')}
            facts={overviewFacts()}
            factsLabel={t('facts.label')}
          />
        );
      case 'statement':
        return <Statement {...base} body={d.body} />;
      case 'walkthrough':
        return <WalkthroughChapter {...base} steps={d.steps} counters={d.steps.map((_, i) => ordinal(i))} />;
      case 'gallery':
        return <GalleryChapter {...base} items={d.items} regionLabel={t('gallery.region', { title: c.title })} />;
      case 'architecture': {
        const nodeIds = diagramNodeIds(d.diagram);
        const labels = Object.fromEntries(
          nodeIds.map((id) => [
            id,
            { title: t(`diagrams.${d.diagram}.${id}.title`), detail: t(`diagrams.${d.diagram}.${id}.detail`) },
          ]),
        );
        return (
          <Architecture
            {...base}
            body={d.body}
            diagram={d.diagram}
            labels={labels}
            nodeIds={nodeIds}
            listLabel={t('architecture.listLabel')}
          />
        );
      }
      case 'stack': {
        const items = form === 'full' ? d.items : languageStackItems(languages);
        return (
          <Stack
            {...base}
            lead={form === 'full' ? (d.body ?? null) : t('stack.lead')}
            groups={stackGroups(items)}
            derivedNote={items.some((item) => item.pkg || item.derive) ? t('stack.derived') : null}
          />
        );
      }
      case 'notes':
        return <Notes {...base} items={d.items} counters={d.items.map((_, i) => ordinal(i))} readLabel={t('notes.read')} />;
      case 'outcomes':
        return (
          <Outcomes
            {...base}
            items={d.items.map((item) => ({ id: item.id, label: item.label, value: resolveFigure(item) }))}
            locale={locale}
            derivedNote={d.items.some((item) => item.derive) ? t('outcomes.derived') : null}
          />
        );
      default:
        return null;
    }
  };

  const indexChapters = titled.map(({ type, anchor, title }) => ({ type, anchor, title }));

  return (
    <article className="cs-page">
      {/* A reader with scripts off gets the whole page: every entrance below
          starts hidden in server HTML (masked words, risen-from poses, closed
          clips, the unlit dividers) and only client code undoes it. The
          molten word fills are pure CSS, so those headings simply stay hot. */}
      <noscript>
        <style>{`[data-cs-rise],[data-cs-clip]{opacity:1!important;transform:none!important;clip-path:none!important}.cs-chapter::before{transform:none!important}`}</style>
      </noscript>
      <a href="#case-study-index" className="sr-only focus:not-sr-only cs-skip">
        {t('index.skip')}
      </a>

      <Hero
        name={project.name}
        eyebrow={
          cs?.role
            ? t('hero.eyebrow', { category, year, role: cs.role })
            : t('hero.eyebrowShort', { category, year })
        }
        thesis={cs?.thesis ?? description}
        links={links}
        labels={{
          linksLabel: t('hero.linksLabel', { name: project.name }),
          liveDemo: t.rich('hero.liveDemo', { sr }),
          source: t.rich('hero.source', { sr }),
          private: t('hero.private'),
        }}
        media={cs?.hero ?? null}
      />

      <div className="cs-body-grid">
        <ChapterIndex
          chapters={indexChapters}
          labels={{
            nav: t('index.nav'),
            close: t('index.close'),
            positions: indexChapters.map((_, i) =>
              t('index.position', { n: i + 1, total: indexChapters.length }),
            ),
          }}
        />
        <div className="cs-chapters">
          {titled.map((c, i) => (
            <Fragment key={c.anchor}>{render(c, i)}</Fragment>
          ))}
        </div>
      </div>

      <ProjectPalette
        projectId={project.id}
        chapters={indexChapters.map((c) => ({ ...c, jumpLabel: t('palette.jump', { title: c.title }) }))}
        links={{ demo: links.demo, source: links.source }}
        section={t('palette.section')}
        demoLabel={t('palette.demo')}
        sourceLabel={t('palette.source')}
      />
    </article>
  );
}
