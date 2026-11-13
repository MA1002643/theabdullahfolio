// The sitewide palette's own commands (issue #41) — pure, like
// buildUsesActions: every side effect arrives in `deps`, so the unit suite can
// hand in spies and check exactly what each command does.
//
//   Navigate  every route in SITE_ROUTES except the page you are on
//   Projects  every project, from the server-built list (lib/palette/projects)
//   Actions   copy link · open CV · view source · copy email · back to top
//
// `t` is the deferred PaletteSite translator. Until its chunk is in (it is
// fetched in idle time, long before a hand reaches ⌘K), `t` is null and only
// Navigate is offered: those labels come from the global Nav catalogue.

import { routeActions, routesExcept } from './routes';

export function buildSiteActions({
  t,
  pathname,
  projects = [],
  go,
  copyText,
  openExternal,
  scrollTop,
  urls,
}) {
  const navigate = routeActions(routesExcept(pathname), go);
  if (!t) return navigate;

  const projectSection = t('sections.projects');
  const projectActions = projects
    .filter((p) => `/projects/${p.id}` !== pathname)
    .map((p) => ({
      id: `project-${p.id}`,
      label: p.name,
      hint: p.hint,
      section: projectSection,
      keywords: `${p.keywords} ${t('keywords.projects')} project`,
      perform: () => go(`/projects/${p.id}`, p.name),
    }));

  const section = t('sections.actions');
  const keywords = (key) => `${t(`keywords.${key}`)} ${ENGLISH_KEYWORDS[key]}`;
  const actions = [
    {
      id: 'copy-link',
      label: t('actions.copyLink'),
      section,
      keywords: keywords('copyLink'),
      perform: () => copyText(urls.page(), t('actions.linkCopied')),
    },
    {
      id: 'open-cv',
      label: t('actions.openCv'),
      hint: 'PDF',
      section,
      keywords: keywords('openCv'),
      perform: () => openExternal(urls.cv),
    },
    {
      id: 'view-source',
      label: t('actions.viewSource'),
      hint: 'github.com',
      section,
      keywords: keywords('viewSource'),
      perform: () => openExternal(urls.source),
    },
    urls.email
      ? {
          id: 'copy-email',
          label: t('actions.copyEmail'),
          hint: urls.email,
          section,
          keywords: keywords('copyEmail'),
          perform: () => copyText(urls.email, t('actions.emailCopied')),
        }
      : null,
    {
      id: 'back-to-top',
      label: t('actions.backToTop'),
      section,
      keywords: keywords('backToTop'),
      perform: scrollTop,
    },
  ].filter(Boolean);

  return [...navigate, ...projectActions, ...actions];
}

// English search terms kept beside the translated ones, so an English query
// finds the command from any locale (the routeActions convention).
const ENGLISH_KEYWORDS = {
  copyLink: 'copy link url share clipboard',
  openCv: 'cv resume résumé pdf download',
  viewSource: 'source code github repo repository',
  copyEmail: 'email mail address contact clipboard',
  backToTop: 'scroll top up beginning',
};
