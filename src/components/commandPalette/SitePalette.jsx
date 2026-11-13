'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { usePathname, useRouter } from '@/i18n/navigation';
import { usePageTransition } from '@/components/pageTransition/PageTransitionProvider';
import { email, projectGithubUrl, resumeUrl } from '@/components/footer/footer-data';
import { usePaletteOpen } from '@/hooks/usePaletteOpen';
import { deferredChunk } from '@/lib/deferredChunk';
import { PALETTE_FLAGS } from '@/lib/flags';
import { pushRecent, readRecents, recentActions } from '@/lib/palette/recents';
import { whenIdle } from '@/lib/whenIdle';
import PaletteTrigger from './PaletteTrigger';
import { useContributedActions } from './registry';
import { SITE_ROUTES } from './routes';
import { isApplePlatform } from './shortcut';
import { buildSiteActions } from './siteActions';
import { usePaletteSiteCopy } from './usePaletteSiteCopy';

// The ONE ⌘K palette (issue #41), mounted by the root layout on every route,
// in every locale, the 404 included. Before #41 three pages each mounted a
// palette of their own and every other page had none.
//
// What is eager, and what is not (CLAUDE.md §5, issue #55):
//   eager    this file — the hotkey (usePaletteOpen), the contributor
//            registry, the trigger. The shortcut must work the moment the page
//            is interactive, and all of it is small.
//   deferred the panel (CommandPalette + the ranked matcher), warmed in idle
//            time and on intent over the trigger; the Ask view, warmed when
//            the palette opens; and this palette's copy (PaletteSite), fetched
//            in idle time so it never counts against a route's i18n budget.
// A chunk that never arrives renders nothing (optionalChunk): ⌘K then does
// nothing, and the page is unharmed.
//
// The list, in order: Recent (empty query only) → the current page's own
// commands (usePaletteActions) → Navigate → Projects → Actions → Language →
// Ask. Every command run from here is remembered in Recent, by id.

const panel = deferredChunk(() => import('./CommandPalette'), 'CommandPalette');
const DeferredCommandPalette = dynamic(panel.loader, { ssr: false });
const askChunk = deferredChunk(() => import('./AskPanel'), 'AskPanel');
const DeferredAskPanel = dynamic(askChunk.loader, { ssr: false });
const fitChunk = deferredChunk(() => import('./FitPanel'), 'FitPanel');
const DeferredFitPanel = dynamic(fitChunk.loader, { ssr: false });

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export default function SitePalette({ projects = [] }) {
  const controller = usePaletteOpen();
  const { open } = controller;
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const { navigate } = usePageTransition();
  const tNav = useTranslations('Nav');
  const t = usePaletteSiteCopy(locale, open);
  const contributed = useContributedActions();
  const [recentIds, setRecentIds] = useState([]);
  // Whether the panel has been asked for at all: until then it is not even
  // rendered, so next/dynamic never starts its download early.
  const [panelWanted, setPanelWanted] = useState(false);

  useEffect(() => whenIdle(() => {
    panel.preload();
    setPanelWanted(true);
  }, 5000), []);

  // Opening reads the visitor's recents fresh (another tab may have run
  // something) and warms the Ask view, the next thing they might reach for.
  useEffect(() => {
    if (!open) return;
    setPanelWanted(true);
    setRecentIds(readRecents());
    if (PALETTE_FLAGS.ask) {
      askChunk.preload();
      fitChunk.preload();
    }
  }, [open]);

  const go = useCallback(
    (href, label) => {
      if (navigate) navigate(href, { label });
      else router.push(href);
    },
    [navigate, router],
  );

  const siteActions = useMemo(() => {
    const copyText = async (text, done) => {
      try {
        await navigator.clipboard.writeText(text);
        toast(done);
      } catch {
        toast(t?.('actions.clipboardUnavailable'));
      }
    };
    return buildSiteActions({
      t,
      pathname,
      projects,
      go,
      copyText,
      openExternal: (url) => window.open(url, '_blank', 'noopener,noreferrer'),
      scrollTop: () =>
        window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' }),
      urls: {
        page: () => window.location.href,
        cv: resumeUrl,
        source: projectGithubUrl,
        email,
      },
    });
  }, [t, pathname, projects, go]);

  // Every command, page first, each remembering itself in Recent when run.
  const actions = useMemo(
    () =>
      [...contributed, ...siteActions].map((a) =>
        a.keepOpen
          ? a
          : {
              ...a,
              perform: () => {
                setRecentIds(pushRecent(a.recentOf ?? a.id));
                a.perform();
              },
            },
      ),
    [contributed, siteActions],
  );

  const recent = useMemo(
    () => (t ? recentActions(recentIds, actions, t('sections.recent')) : []),
    [t, recentIds, actions],
  );

  // A source, labelled from the palette's OWN registry — never from anything
  // the model wrote (issue #41 §4.3). The href is re-checked here as well as
  // on the server: only a site route or a real project page survives, so even
  // a compromised response could not hand the visitor an off-site link.
  // Projects and journey entries arrive with a server-side label (a name, or
  // a title already in the visitor's language); pages, tools and live sources
  // are worded by this palette's catalogue. Unresolvable → {} → dropped.
  const resolveSource = useCallback(
    (source) => {
      const href = source?.href;
      const route = SITE_ROUTES.find((r) => r.href === href);
      const projectId = /^\/projects\/(\d+)$/.exec(href ?? '')?.[1];
      const project = projectId && projects.find((p) => String(p.id) === projectId);
      if (!route && !project) return {};
      const id = source.id ?? '';
      if (id.startsWith('L:') && t) {
        return { label: t(`ask.sourceLabels.${id.slice(2)}`), live: true };
      }
      if (id === 'S:site' && t) return { label: t('ask.sourceLabels.site'), hint: href };
      if (id === 'U:bench' && t) return { label: t('ask.sourceLabels.bench'), hint: href };
      if (id === 'U:stack' && t) return { label: t('ask.sourceLabels.stack'), hint: href };
      if (source.label) return { label: source.label, hint: project ? project.hint : href };
      if (project) return { label: project.name, hint: project.hint };
      return { label: tNav(`routes.${route.navKey}`), hint: href };
    },
    [projects, tNav, t],
  );

  const ask = useMemo(() => {
    if (!PALETTE_FLAGS.ask || !t) return null;
    return {
      section: t('sections.ask'),
      keywords: `${t('keywords.ask')} ask question ai claude`,
      // The question is wrapped in Unicode isolates (FSI … PDI) so an English
      // query inside an Arabic label keeps its own direction — the plain-text
      // equivalent of <bdi>, which a string label cannot carry.
      label: (question) => t('ask.option', { query: `\u2068${question}\u2069` }),
      startLabel: t('ask.start'),
      resumeLabel: (title) => t('ask.resume', { title }),
      suggestions: ['strongest', 'stack', 'experience', 'live'].map((id) => ({
        id,
        label: t(`ask.suggestions.${id}`),
      })),
      fitLabel: t('fit.command'),
      fitKeywords: `${t('keywords.fit')} job description role fit match requirements recruiter`,
      Panel: DeferredAskPanel,
      FitPanel: DeferredFitPanel,
      panelProps: {
        t,
        locale,
        path: pathname,
        resolveSource,
        onNavigate: go,
        shortcutKey: isApplePlatform() ? '⌘' : 'Ctrl',
      },
    };
  }, [t, locale, pathname, resolveSource, go]);

  if (!PALETTE_FLAGS.site) return null;

  return (
    <>
      <PaletteTrigger
        expanded={open}
        onIntent={panel.preload}
        onOpen={(el) => {
          setPanelWanted(true);
          controller.toggle(el);
        }}
      />
      {panelWanted || open ? (
        <DeferredCommandPalette
          actions={actions}
          controller={controller}
          ask={ask}
          recent={recent}
        />
      ) : null}
    </>
  );
}
