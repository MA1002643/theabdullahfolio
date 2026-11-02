import { render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import PrivacyNotice from '@/components/privacy/PrivacyNotice';
import PreferenceCentre from '@/components/privacy/PreferenceCentre';
import ConsentStatusPanel from '@/components/privacy/ConsentStatusPanel';
import { CATEGORIES } from '@/lib/privacy/inventory';
import { messagesFor, renderWithIntl } from '../support/intl.jsx';

// The consent surfaces under translation (issue #82). The /privacy POLICY body
// stays English by decision, but the notice that asks, the preference centre
// that answers and the panel that reports the answer are translated — consent
// is only informed in the visitor's language. These cases pin that the English
// reads exactly as before the copy moved into messages/en/Privacy.json, and
// that the parts which must stay in the visitor's language say so in markup.

vi.mock('@/i18n/navigation', () => ({
  // eslint-disable-next-line jsx-a11y/anchor-has-content
  Link: ({ prefetch, ...props }) => <a {...props} />,
}));

const consent = vi.hoisted(() => ({ value: null }));
vi.mock('@/components/privacy/ConsentProvider', () => ({ useConsent: () => consent.value }));

const base = {
  status: 'undecided',
  analytics: false,
  decidedAt: null,
  hydrated: true,
  prefsOpen: false,
  triggerRef: { current: null },
  grant: vi.fn(),
  deny: vi.fn(),
  set: vi.fn(),
  reopen: vi.fn(),
  closePrefs: vi.fn(),
};

beforeEach(() => {
  window.__loaderDone = true;
  consent.value = { ...base };
});
afterEach(() => {
  delete window.__loaderDone;
});

describe('PrivacyNotice', () => {
  it('says exactly what it said before, link inside the sentence', async () => {
    renderWithIntl(<PrivacyNotice />);
    const region = await screen.findByRole('region', { name: 'Privacy notice' }, { timeout: 3000 });
    const copy = region.querySelector('p');
    expect(copy.textContent).toBe(
      'This site keeps a little state on your device so it remembers your ' +
        'preferences, and — only if you allow it — counts which pages get ' +
        'read. No advertising cookies, no tracking, no third-party profiling. ' +
        'Read what that means.',
    );
    // 35 fire-ramp words (the old NOTICE_WORDS), then the link, then a bare
    // full stop — the same structure, so the same gradient, as before.
    expect(copy.querySelectorAll(':scope > span')).toHaveLength(35);
    expect(copy.lastChild.nodeType).toBe(Node.TEXT_NODE);
    expect(copy.lastChild.textContent).toBe('.');
    expect(within(region).getByRole('link', { name: 'Read what that means' })).toHaveAttribute(
      'href',
      '/privacy',
    );
    for (const name of ['Accept', 'Decline', 'Preferences']) {
      expect(within(region).getByRole('button', { name })).toBeInTheDocument();
    }
  });
});

describe('PreferenceCentre', () => {
  it('renders the categories from the catalogue, in the same English as the inventory', () => {
    consent.value = { ...base, prefsOpen: true };
    renderWithIntl(<PreferenceCentre />);
    const dialog = screen.getByRole('dialog', { name: 'Privacy choices' });
    for (const category of CATEGORIES) {
      expect(within(dialog).getByRole('heading', { name: category.name })).toBeInTheDocument();
      expect(within(dialog).getByText(category.detail)).toBeInTheDocument();
    }
    expect(within(dialog).getByRole('switch', { name: 'Allow anonymous analytics' })).toBeInTheDocument();
    expect(dialog).toHaveTextContent(
      'Two categories, because two is the real number. The full detail is on the privacy page.',
    );
  });

  // Pages ship `Privacy.notice` only (the 8 kB budget); the dialog fetches the
  // rest of its locale's file when asked for. Rendered here exactly as a page
  // hands it down, so the copy can only have come from that fetch.
  it('opens in the locale once its copy is fetched, when the page shipped the notice only', async () => {
    const fa = messagesFor('fa');
    const shipped = { ...fa, Privacy: { notice: fa.Privacy.notice } };
    consent.value = { ...base, status: 'denied', prefsOpen: true };
    render(
      <NextIntlClientProvider locale="fa" messages={shipped} timeZone="Europe/London">
        <PreferenceCentre />
      </NextIntlClientProvider>,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    const dialog = await screen.findByRole('dialog', { name: fa.Privacy.prefs.title });
    expect(within(dialog).getByRole('button', { name: fa.Privacy.prefs.declineAll })).toBeInTheDocument();
    expect(dialog).not.toHaveTextContent('Decline all');
  });
});

describe('ConsentStatusPanel', () => {
  it('formats the decision date in the locale and re-establishes the visitor’s language', () => {
    consent.value = { ...base, status: 'granted', analytics: true, decidedAt: '2026-10-25T12:00:00Z' };
    const { container } = renderWithIntl(<ConsentStatusPanel />);
    expect(container.textContent).toContain('You decided this on 25 October 2026.');
    expect(container.querySelector('aside')).toHaveAttribute('lang', 'en');

    const { container: ar } = renderWithIntl(<ConsentStatusPanel />, { locale: 'ar' });
    const aside = ar.querySelector('aside');
    // Inside the English-only policy body, the panel is the visitor's own
    // account, so it carries their lang/dir back...
    expect(aside).toHaveAttribute('lang', 'ar');
    expect(aside).toHaveAttribute('dir', 'rtl');
    // ...and its date is formatted by Intl for Arabic, not hard-coded en-GB.
    // (Digits follow the runtime's CLDR default for `ar`, so the month name is
    // what is asserted.)
    expect(aside.textContent).toMatch(/أكتوبر/);
  });
});
