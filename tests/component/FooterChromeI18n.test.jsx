import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import ElsewhereTerminal from '@/components/footer/ElsewhereTerminal';
import EmblemSeal from '@/components/loaderWrapper/EmblemSeal';
import FooterIdentity from '@/components/footer/FooterIdentity';
import { columnKey } from '@/components/about/ProjectProgressPopup';
import { LOCALE_CODES } from '@/i18n/locales';
import { messagesFor, renderWithIntl } from '../support/intl.jsx';

// The chrome that used to stay English in every language (issue #82, owner
// review 2026-10-31): the owner's name as the footer masthead, the Elsewhere
// terminal's commands and working directory, and the GitHub Projects column
// names in /about's progress dialog.

vi.mock('@/i18n/navigation', () => ({
  // eslint-disable-next-line jsx-a11y/anchor-has-content
  Link: ({ prefetch, ...props }) => <a {...props} />,
}));
// Reduced motion: the terminal shows its finished session at once.
vi.mock('@/hooks/useReducedMotion', () => ({ useReducedMotion: () => true }));
vi.mock('@/components/footer/useFooterReveal', () => ({ useFooterReveal: () => true }));
// The git-graph CTA fetches the repo's commit count; it is not under test here.
vi.mock('@/components/footer/ProjectGithubCta', () => ({ default: () => null }));

describe('Common.owner — the name, hand-set per locale', () => {
  it.each(LOCALE_CODES)('%s has a given name, a family name and a full name that contains both', (code) => {
    const { owner } = messagesFor(code).Common;
    for (const part of ['given', 'family', 'full']) expect(owner[part]?.trim()).toBeTruthy();
    expect(owner.full).toContain(owner.given);
    expect(owner.full).toContain(owner.family);
  });

  it('is written in the reader’s script where the language has its own', () => {
    expect(messagesFor('ar').Common.owner.full).toBe('محمد عبدالله');
    expect(messagesFor('ja').Common.owner.full).toBe('ムハンマド・アブドゥッラー');
    expect(messagesFor('tr').Common.owner.full).toBe('Muhammed Abdullah');
    expect(messagesFor('en').Common.owner.full).toBe('Muhammad Abdullah');
  });
});

describe('FooterIdentity', () => {
  it('prints the name in the reader’s script', () => {
    renderWithIntl(<FooterIdentity />, { locale: 'ar' });
    expect(screen.getByText('محمد عبدالله')).toBeInTheDocument();
    expect(screen.queryByText('Muhammad Abdullah')).not.toBeInTheDocument();
  });
});

describe('ElsewhereTerminal', () => {
  it('types its commands and working directory in the reader’s language', () => {
    renderWithIntl(<ElsewhereTerminal />, { locale: 'tr' });
    const { terminal } = messagesFor('tr').Footer;
    expect(screen.getByText(terminal.path)).toBeInTheDocument();
    expect(terminal.path).not.toBe('~/elsewhere');
    for (const cmd of Object.values(terminal.cmd)) expect(screen.getByText(cmd)).toBeInTheDocument();
    expect(screen.queryByText('open github')).not.toBeInTheDocument();
  });

  it('starts every link’s accessible name with the command on screen (WCAG 2.5.3)', () => {
    renderWithIntl(<ElsewhereTerminal />, { locale: 'tr' });
    const { cmd } = messagesFor('tr').Footer.terminal;
    for (const command of Object.values(cmd)) {
      const link = screen.getByText(command).closest('a');
      expect(link.getAttribute('aria-label').startsWith(`${command}, `)).toBe(true);
    }
  });

  it('keeps the English session byte for byte', () => {
    renderWithIntl(<ElsewhereTerminal />);
    expect(screen.getByText('~/elsewhere')).toBeInTheDocument();
    expect(screen.getByText('open github')).toBeInTheDocument();
    expect(screen.getByText('open résumé')).toBeInTheDocument();
  });
});

describe('columnKey — GitHub Projects column names', () => {
  it('maps GitHub’s own column names regardless of case and spacing', () => {
    expect(columnKey('In Progress')).toBe('inProgress');
    expect(columnKey('in review')).toBe('inReview');
    expect(columnKey(' Backlog ')).toBe('backlog');
    expect(columnKey('To do')).toBe('todo');
    expect(columnKey('Done')).toBe('done');
  });

  it('leaves a custom column untranslated rather than guessing', () => {
    expect(columnKey('Waiting on client')).toBeNull();
  });

  it.each(LOCALE_CODES)('%s has a label for every mapped column', (code) => {
    const { columns } = messagesFor(code).About.progress;
    for (const name of ['Todo', 'Backlog', 'Ready', 'In progress', 'In review', 'Done', 'No status', 'Blocked', 'On hold']) {
      expect(columns[columnKey(name)]?.trim(), `${code}: ${name}`).toBeTruthy();
    }
  });
});

describe('EmblemSeal — the name engraved on the intro seal', () => {
  const arcs = (container) =>
    [...container.querySelectorAll('textPath')].map((p) => ({
      text: p.textContent,
      tracking: p.closest('text').getAttribute('letter-spacing'),
    }));

  it('keeps the English seal exactly as it was', () => {
    const { container } = renderWithIntl(<EmblemSeal phase="building" reduced />);
    expect(arcs(container)).toEqual([
      { text: 'MUHAMMAD', tracking: '26' },
      { text: 'ABDULLAH', tracking: '26' },
    ]);
  });

  it('engraves the reader’s script, untracked where tracking would break the joins', () => {
    const { container } = renderWithIntl(<EmblemSeal phase="building" reduced />, { locale: 'ar' });
    expect(arcs(container)).toEqual([
      { text: 'محمد', tracking: '0' },
      { text: 'عبدالله', tracking: '0' },
    ]);
  });

  it('uppercases with the locale’s own rules and keeps the tracking for cased scripts', () => {
    const { container } = renderWithIntl(<EmblemSeal phase="building" reduced />, { locale: 'tr' });
    expect(arcs(container)).toEqual([
      { text: 'MUHAMMED', tracking: '26' },
      { text: 'ABDULLAH', tracking: '26' },
    ]);
  });
});
