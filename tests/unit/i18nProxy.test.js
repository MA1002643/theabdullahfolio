import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';

import proxy, { config } from '@/proxy';

// The request proxy (issue #82). Its whole policy, pinned:
//   • English URLs are served as they always were (an internal rewrite to the
//     `en` segment, invisible to the visitor);
//   • `/en/...` redirects to the unprefixed URL, so English has one URL;
//   • the browser's Accept-Language NEVER redirects anyone;
//   • an EXPLICIT choice (the NEXT_LOCALE cookie) does, on document requests
//     only, with a temporary status.

const request = (path, { cookie, acceptLanguage, dest = 'document' } = {}) => {
  const headers = new Headers();
  if (cookie) headers.set('cookie', cookie);
  if (acceptLanguage) headers.set('accept-language', acceptLanguage);
  if (dest) headers.set('sec-fetch-dest', dest);
  return new NextRequest(new URL(path, 'https://ma.codes'), { headers });
};

const location = (res) => res.headers.get('location');
const rewrite = (res) => res.headers.get('x-middleware-rewrite');

describe('proxy — English is untouched', () => {
  it('serves /about from the en segment without redirecting', () => {
    const res = proxy(request('/about'));
    expect(location(res)).toBeNull();
    expect(rewrite(res)).toMatch(/\/en\/about$/);
  });

  it('serves / from the en segment', () => {
    const res = proxy(request('/'));
    expect(location(res)).toBeNull();
    expect(rewrite(res)).toMatch(/\/en\/?$/);
  });

  it('redirects /en/about to /about (one English URL)', () => {
    const res = proxy(request('/en/about'));
    expect(new URL(location(res)).pathname).toBe('/about');
  });
});

describe('proxy — no implicit language redirects', () => {
  it.each(['ar,en;q=0.5', 'ja-JP', 'es-ES,es;q=0.9'])(
    'Accept-Language %s does not redirect /about',
    (acceptLanguage) => {
      expect(location(proxy(request('/about', { acceptLanguage })))).toBeNull();
    },
  );

  it('never writes the locale cookie on its own', () => {
    const res = proxy(request('/ar/about'));
    expect(res.headers.get('set-cookie') ?? '').not.toMatch(/NEXT_LOCALE/);
  });

  it('serves a prefixed URL in its own locale', () => {
    expect(location(proxy(request('/ar/about')))).toBeNull();
  });
});

describe('proxy — an explicit choice is honoured', () => {
  it('sends a visitor who chose Arabic from /about to /ar/about, temporarily', () => {
    const res = proxy(request('/about?x=1', { cookie: 'NEXT_LOCALE=ar' }));
    expect(res.status).toBe(307);
    const target = new URL(location(res));
    expect(target.pathname).toBe('/ar/about');
    expect(target.search).toBe('?x=1');
  });

  it('maps / to the locale root', () => {
    expect(new URL(location(proxy(request('/', { cookie: 'NEXT_LOCALE=ja' })))).pathname).toBe('/ja');
  });

  it('does not redirect background router requests', () => {
    expect(location(proxy(request('/about', { cookie: 'NEXT_LOCALE=ar', dest: 'empty' })))).toBeNull();
  });

  it('ignores an English or unknown cookie value', () => {
    expect(location(proxy(request('/about', { cookie: 'NEXT_LOCALE=en' })))).toBeNull();
    expect(location(proxy(request('/about', { cookie: 'NEXT_LOCALE=xx' })))).toBeNull();
  });

  it('leaves an already-prefixed URL alone', () => {
    expect(location(proxy(request('/ja/about', { cookie: 'NEXT_LOCALE=ar' })))).toBeNull();
  });
});

describe('proxy matcher', () => {
  const [pattern] = config.matcher;
  const matches = (path) => new RegExp(`^${pattern}$`).test(path);

  it.each(['/', '/about', '/ar/projects/3', '/ogham', '/apiary'])('runs on page path %s', (path) => {
    expect(matches(path)).toBe(true);
  });

  it.each([
    '/api/work-status',
    '/og/home',
    '/_next/static/x.js',
    '/sitemap.xml',
    '/Muhammad_Abdullah_CV.pdf',
    '/_vercel/insights',
  ])('skips %s', (path) => {
    expect(matches(path)).toBe(false);
  });
});
