import { http, HttpResponse, delay } from 'msw';

import { abstractReputation, githubStatsPayload, sendMailOk } from '../fixtures/api.js';

// MSW handler factories over the shared fixture catalogue (tests/support/fixtures/api.js).
//
// There are deliberately NO default handlers. Every suite states the network it
// expects, so reading a test tells you what it depends on, and the server's
// `onUnhandledRequest: 'error'` catches anything it forgot.
export const defaultHandlers = [];

const ABSTRACT = 'https://emailreputation.abstractapi.com/v1/';
const GITHUB_GRAPHQL = 'https://api.github.com/graphql';

/**
 * `/api/send-mail` as the browser sees it. `record` receives every request, so
 * a component test can assert on the exact body and headers the form sent.
 */
export function sendMailHandler({ status = 200, body = sendMailOk, record } = {}) {
  return http.post('*/api/send-mail', async ({ request }) => {
    if (record) {
      record({
        body: await request.clone().json(),
        headers: Object.fromEntries(request.headers.entries()),
      });
    }
    return HttpResponse.json(body, { status });
  });
}

/** `/api/send-mail` failing at the transport layer (connection reset, offline). */
export const sendMailNetworkError = () =>
  http.post('*/api/send-mail', () => HttpResponse.error());

/** Abstract's reputation API returning one of the canned verdicts. */
export function abstractHandler(verdict = 'deliverable', { status = 200, record } = {}) {
  return http.get(ABSTRACT, ({ request }) => {
    record?.(new URL(request.url));
    return status === 200
      ? HttpResponse.json(abstractReputation[verdict])
      : new HttpResponse(null, { status });
  });
}

/** Abstract hanging past the route's 5-second abort. */
export const abstractHang = () =>
  http.get(ABSTRACT, async () => {
    await delay('infinite');
    return HttpResponse.json({});
  });

/** GitHub GraphQL answering with a status and body, recording each call. */
export function githubGraphQLHandler({ status = 200, body, record } = {}) {
  return http.post(GITHUB_GRAPHQL, async ({ request }) => {
    record?.({
      body: await request.clone().json(),
      authorization: request.headers.get('authorization'),
    });
    return typeof body === 'string'
      ? new HttpResponse(body, { status, headers: { 'content-type': 'text/html' } })
      : HttpResponse.json(body, { status });
  });
}

/** The About page's stats feed, served from the bundled snapshot. */
export const githubStatsApiHandler = (overrides) =>
  http.get('*/api/github-stats', () => HttpResponse.json(githubStatsPayload(overrides)));
