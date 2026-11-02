import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import nav from '../../messages/en/Nav.json';
import privacy from '../../messages/en/Privacy.json';
import { SITE_ROUTES } from '@/components/commandPalette/routes';
import { ROUTES as NOT_FOUND_ROUTES } from '@/components/not-found/routes';
import { ROUTE_LABELS } from '@/components/pageTransition/constants';
import { formatPlayedAgo } from '@/components/spotify/format';
import { CATEGORIES } from '@/lib/privacy/inventory';

// Seams between the sitewide chrome and the message catalogue (issue #82).

describe('Privacy.categories', () => {
  // The preference centre reads category copy from the catalogue so consent
  // is asked in the visitor's language, but src/lib/privacy/inventory.js stays
  // the ONLY source of what the policy says (CLAUDE.md §2). So the English
  // catalogue must be a verbatim copy: an inventory edit fails here until the
  // catalogue — and with it every translation's source hash — follows.
  it('mirrors the inventory word for word, one entry per category', () => {
    expect(Object.keys(privacy.categories).sort()).toEqual(CATEGORIES.map((c) => c.id).sort());
    for (const c of CATEGORIES) {
      expect(privacy.categories[c.id]).toEqual({ name: c.name, summary: c.summary, detail: c.detail });
    }
  });
});

describe('Nav.routes', () => {
  // Three surfaces name a route through `Nav.routes.<key>` — the Ember Passage
  // label, the palette's Navigate group and the 404's chips. A key with no
  // message would render the raw key on screen.
  it('has a message for every route key the chrome uses', () => {
    const keys = [
      ...Object.values(ROUTE_LABELS),
      ...SITE_ROUTES.map((r) => r.navKey),
      ...NOT_FOUND_ROUTES.map((r) => r.navKey),
    ];
    for (const key of keys) expect(nav.routes[key], key).toEqual(expect.any(String));
  });

  it('names each route exactly as its English label did', () => {
    for (const r of [...SITE_ROUTES, ...NOT_FOUND_ROUTES]) expect(nav.routes[r.navKey]).toBe(r.label);
  });
});

describe('formatPlayedAgo', () => {
  const NOW = Date.parse('2026-10-25T12:00:00Z');
  const ago = (ms) => new Date(NOW - ms).toISOString();
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => vi.useRealTimers());

  it('keeps the compact English form byte for byte', () => {
    expect(formatPlayedAgo(ago(10_000))).toBe('just now');
    expect(formatPlayedAgo(ago(60_000), 'en')).toBe('1 min ago');
    expect(formatPlayedAgo(ago(3 * 60_000), 'en')).toBe('3 mins ago');
    expect(formatPlayedAgo(ago(3600_000), 'en')).toBe('1 hr ago');
    expect(formatPlayedAgo(ago(3 * 86400_000), 'en')).toBe('3 days ago');
  });

  it('uses the platform’s relative time for every other locale', () => {
    const es = new Intl.RelativeTimeFormat('es', { style: 'short', numeric: 'auto' });
    expect(formatPlayedAgo(ago(3 * 60_000), 'es')).toBe(es.format(-3, 'minute'));
    expect(formatPlayedAgo(ago(10_000), 'es')).toBe(es.format(0, 'second'));
    expect(formatPlayedAgo(ago(3 * 86400_000), 'ar')).toBe(
      new Intl.RelativeTimeFormat('ar', { style: 'short', numeric: 'auto' }).format(-3, 'day'),
    );
  });
});
