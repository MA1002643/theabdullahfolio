import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// The API fixture catalogue (issue #92, principle 3: one source of truth per
// concern). Every canned response a test serves lives HERE, and both network
// layers read it:
//
//   • Vitest — tests/support/msw/handlers.js wraps these in MSW handlers.
//   • Playwright — tests/support/network.js serves the same objects through
//     `page.route`.
//
// Two mock systems with two sets of payloads drift: a field renamed in one is
// still served by the other, and a component test passes against a shape the
// browser never sees. One catalogue makes that drift impossible by construction.
//
// Read with fs rather than imported as JSON on purpose: the same module has to
// load under Vitest's node and jsdom environments AND Playwright's own loader,
// and a plain file read is the one mechanism all three agree on.

const readJson = (relative) =>
  JSON.parse(readFileSync(join(process.cwd(), relative), 'utf8'));

/**
 * The `/api/github-stats` payload. Built from the bundled fallback snapshot the
 * route itself serves when GitHub is unreachable, so the fixture is a shape the
 * About page genuinely receives in production, not one invented for tests.
 */
export function githubStatsPayload(overrides = {}) {
  return { ...readJson('src/data/github-stats-fallback.json'), ...overrides };
}

/** An empty-but-valid `/api/github-skills` payload (the /uses spec's EMPTY_PAYLOAD shape). */
export function githubSkillsPayload() {
  return {
    categories: { languages: [], frameworks: [], libraries: [], tools: [], software: [] },
    diff: { added: [], removed: [] },
    fetchedAt: '2026-01-01T00:00:00.000Z',
    _fallback: true,
  };
}

/** A synthetic contact message that passes BOTH the client and server rules. */
export function validContactMessage(overrides = {}) {
  return {
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    subject: 'Analytical engine collaboration',
    message:
      'I have been reading about your work and would love to talk about a possible collaboration next month.',
    ...overrides,
  };
}

/** Abstract Email Reputation API responses, by verdict. */
export const abstractReputation = {
  deliverable: {
    email_deliverability: { status: 'deliverable' },
    email_quality: { is_disposable: false },
  },
  undeliverable: {
    email_deliverability: { status: 'undeliverable' },
    email_quality: { is_disposable: false },
  },
  disposable: {
    email_deliverability: { status: 'deliverable' },
    email_quality: { is_disposable: true },
  },
};

/** The send-mail route's own success body, for stubbing it from the client side. */
export const sendMailOk = { success: true, message: 'Email sent successfully!' };
