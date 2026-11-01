import { readFileSync } from 'node:fs';
import path from 'node:path';

import { IntlMessageFormat } from 'intl-messageformat';
import { createTranslator } from 'next-intl';
import { describe, expect, it } from 'vitest';
import {
  WORK_STATES,
  buildHeadline,
  buildMessage,
  buildSecondaryMessage,
  describeHeadline,
  describeMessage,
  describeSecondaryMessage,
  isMessageDescriptor,
} from '@/utils/workSignal';

// The live header's English sentences, pinned byte for byte (issue #82).
//
// Every expected string below was copied from the output of the template-
// literal implementation BEFORE the sentences moved into
// messages/en/LiveHeader.json. That move made `buildMessage` render an ICU
// descriptor through `createTranslator`, so the English the API serves (and
// the AI refiner is handed as its baseline) is now produced by the same
// template every other locale words. If a catalogue edit changes so much as a
// space or a dash, this file fails before a visitor sees it.
//
// One case per branch of buildMessage / buildSecondaryMessage / buildHeadline,
// with the plural edges (0, 1, many) wherever a count reaches a noun.

const top = (number, title) => [{ type: 'issue', number, title }];
const signal = (over) => ({
  state: WORK_STATES.IDLE,
  activePrs: 0,
  activeIssues: 0,
  recentPushes: 0,
  topItems: [],
  shippedItems: [],
  projectInProgressCount: 0,
  recentlyShippedCount: 0,
  ...over,
});

const FALLBACK =
  'New features are being released very soon. This website is actively under development.';

describe('buildMessage — English, pinned', () => {
  it.each([
    ['idle', signal({}), FALLBACK],
    ['an unknown state', signal({ state: 'mystery' }), FALLBACK],

    // SHIPPING without item details: the count alone.
    [
      'shipping, no items, 0',
      signal({ state: WORK_STATES.SHIPPING, recentlyShippedCount: 0 }),
      'Just shipped 0 updates to this website.',
    ],
    [
      'shipping, no items, 1',
      signal({ state: WORK_STATES.SHIPPING, recentlyShippedCount: 1 }),
      'Just shipped 1 update to this website.',
    ],
    [
      'shipping, no items, many',
      signal({ state: WORK_STATES.SHIPPING, recentlyShippedCount: 4 }),
      'Just shipped 4 updates to this website.',
    ],
    [
      'shipping, null items',
      signal({ state: WORK_STATES.SHIPPING, recentlyShippedCount: 2, shippedItems: null }),
      'Just shipped 2 updates to this website.',
    ],
    // SHIPPING with the newest shipped item named.
    [
      'shipping one named item',
      signal({
        state: WORK_STATES.SHIPPING,
        recentlyShippedCount: 1,
        shippedItems: [{ number: 12, title: '  Fix the nav  ' }],
      }),
      'Just shipped #12 Fix the nav.',
    ],
    [
      'shipping two, one named',
      signal({
        state: WORK_STATES.SHIPPING,
        recentlyShippedCount: 2,
        shippedItems: [{ number: 12, title: 'Fix the nav' }],
      }),
      'Just shipped #12 Fix the nav (and 1 more).',
    ],
    [
      'shipping many, one named',
      signal({
        state: WORK_STATES.SHIPPING,
        recentlyShippedCount: 5,
        shippedItems: [{ number: 1234, title: 'Ship <b>it</b> {now}' }],
      }),
      'Just shipped #1234 Ship <b>it</b> {now} (and 4 more).',
    ],

    // LIVE.
    [
      'live, pushes + focus',
      signal({ state: WORK_STATES.LIVE, recentPushes: 3, topItems: top(5, 'Orbit tip') }),
      'Live update: shipping changes right now — currently focused on #5 Orbit tip.',
    ],
    [
      'live, pushes only',
      signal({ state: WORK_STATES.LIVE, recentPushes: 1 }),
      'Live update: shipping new changes to this website right now.',
    ],
    [
      'live, no pushes, focus',
      signal({ state: WORK_STATES.LIVE, topItems: top(7, 'Header') }),
      'Active work happening right now — currently focused on #7 Header.',
    ],
    [
      'live, nothing',
      signal({ state: WORK_STATES.LIVE }),
      'Active work happening right now.',
    ],
    [
      'live, focus with an empty title',
      signal({ state: WORK_STATES.LIVE, topItems: top(8, null) }),
      'Active work happening right now — currently focused on #8 .',
    ],

    // IN_PROGRESS — the project board.
    [
      'board, 1, no focus',
      signal({ state: WORK_STATES.IN_PROGRESS, projectInProgressCount: 1 }),
      'Actively working on 1 task.',
    ],
    [
      'board, many, focus',
      signal({
        state: WORK_STATES.IN_PROGRESS,
        projectInProgressCount: 3,
        topItems: top(82, 'Multilingual support'),
      }),
      'Actively working on 3 tasks — currently focused on #82 Multilingual support.',
    ],
    // IN_PROGRESS — PRs and issues.
    [
      'prs + issues, 1/1',
      signal({ state: WORK_STATES.IN_PROGRESS, activePrs: 1, activeIssues: 1 }),
      'Work in progress on 1 pull request and 1 open task.',
    ],
    [
      'prs + issues, many, focus',
      signal({
        state: WORK_STATES.IN_PROGRESS,
        activePrs: 2,
        activeIssues: 9,
        topItems: top(3, 'Cache'),
      }),
      'Work in progress on 2 pull requests and 9 open tasks — currently focused on #3 Cache.',
    ],
    [
      'prs only, 1',
      signal({ state: WORK_STATES.IN_PROGRESS, activePrs: 1 }),
      'Work in progress on 1 pull request.',
    ],
    [
      'prs only, many, focus',
      signal({ state: WORK_STATES.IN_PROGRESS, activePrs: 4, topItems: top(10, 'A') }),
      'Work in progress on 4 pull requests — currently focused on #10 A.',
    ],
    [
      'issues only, 1',
      signal({ state: WORK_STATES.IN_PROGRESS, activeIssues: 1 }),
      'Work in progress on 1 open task.',
    ],
    [
      'issues only, many, focus',
      signal({ state: WORK_STATES.IN_PROGRESS, activeIssues: 6, topItems: top(11, 'B') }),
      'Work in progress on 6 open tasks — currently focused on #11 B.',
    ],
    [
      'in progress, defensive fallback',
      signal({ state: WORK_STATES.IN_PROGRESS }),
      'Work is in progress on this website.',
    ],

    // PLANNING.
    [
      'planning, focus',
      signal({ state: WORK_STATES.PLANNING, activeIssues: 2, topItems: top(4, 'Plan it') }),
      'Planning the next improvements — currently focused on #4 Plan it.',
    ],
    [
      'planning, nothing',
      signal({ state: WORK_STATES.PLANNING }),
      'Planning the next improvements.',
    ],
  ])('%s', (_label, input, expected) => {
    expect(buildMessage(input)).toBe(expected);
  });
});

describe('buildSecondaryMessage — English, pinned', () => {
  it('is null outside SHIPPING', () => {
    expect(
      buildSecondaryMessage(
        signal({ state: WORK_STATES.LIVE, projectInProgressCount: 2, topItems: top(1, 'x') }),
      ),
    ).toBeNull();
  });

  it('is null with nothing on the board', () => {
    expect(
      buildSecondaryMessage(signal({ state: WORK_STATES.SHIPPING, topItems: top(1, 'x') })),
    ).toBeNull();
  });

  it('is null with no focus item', () => {
    expect(
      buildSecondaryMessage(signal({ state: WORK_STATES.SHIPPING, projectInProgressCount: 2 })),
    ).toBeNull();
    expect(
      buildSecondaryMessage(
        signal({ state: WORK_STATES.SHIPPING, projectInProgressCount: 2, topItems: null }),
      ),
    ).toBeNull();
  });

  it.each([
    [1, 'Actively working on 1 task — currently focused on #9 Footer.'],
    [3, 'Actively working on 3 tasks — currently focused on #9 Footer.'],
  ])('board of %i', (count, expected) => {
    expect(
      buildSecondaryMessage(
        signal({
          state: WORK_STATES.SHIPPING,
          projectInProgressCount: count,
          topItems: top(9, 'Footer'),
        }),
      ),
    ).toBe(expected);
  });
});

describe('buildHeadline — English, pinned', () => {
  it.each([
    [WORK_STATES.SHIPPING, 'Just shipped'],
    [WORK_STATES.LIVE, 'Live development in progress'],
    [WORK_STATES.IN_PROGRESS, 'Work in progress'],
    [WORK_STATES.PLANNING, 'Planning the next improvements'],
    [WORK_STATES.IDLE, 'Maintenance ongoing'],
    ['mystery', 'Maintenance ongoing'],
  ])('%s', (state, expected) => {
    expect(buildHeadline(signal({ state }))).toBe(expected);
  });
});

// ── The descriptors themselves (issue #82) ──────────────────────────────────
// /api/work-status ships these to every non-English header, which words them
// from its own catalogue. So beyond the English pin above: every descriptor
// must name a message that exists, carry only the plain values ICU can take,
// and survive being worded by a DIFFERENT locale's plural rules.

const en = JSON.parse(
  readFileSync(path.join(process.cwd(), 'messages/en/LiveHeader.json'), 'utf8'),
);
const lookup = (key) => key.split('.').reduce((node, part) => node?.[part], en);

const BRANCHES = [
  signal({}),
  signal({ state: WORK_STATES.SHIPPING, recentlyShippedCount: 3 }),
  signal({
    state: WORK_STATES.SHIPPING,
    recentlyShippedCount: 1,
    shippedItems: [{ number: 12, title: 'A' }],
  }),
  signal({
    state: WORK_STATES.SHIPPING,
    recentlyShippedCount: 4,
    shippedItems: [{ number: 12, title: 'A' }],
  }),
  signal({ state: WORK_STATES.LIVE, recentPushes: 1, topItems: top(5, 'B') }),
  signal({ state: WORK_STATES.LIVE, recentPushes: 1 }),
  signal({ state: WORK_STATES.LIVE }),
  signal({ state: WORK_STATES.IN_PROGRESS, projectInProgressCount: 2 }),
  signal({ state: WORK_STATES.IN_PROGRESS, activePrs: 1, activeIssues: 2 }),
  signal({ state: WORK_STATES.IN_PROGRESS, activePrs: 1 }),
  signal({ state: WORK_STATES.IN_PROGRESS, activeIssues: 1 }),
  signal({ state: WORK_STATES.IN_PROGRESS }),
  signal({ state: WORK_STATES.PLANNING, topItems: top(4, 'C') }),
];

describe('message descriptors', () => {
  it('name a message that exists, with JSON-safe primitive values', () => {
    const described = [
      ...BRANCHES.map(describeMessage),
      describeSecondaryMessage(
        signal({ state: WORK_STATES.SHIPPING, projectInProgressCount: 2, topItems: top(9, 'D') }),
      ),
    ];
    for (const d of described) {
      expect(isMessageDescriptor(d), d.key).toBe(true);
      expect(typeof lookup(d.key), d.key).toBe('string');
      for (const value of Object.values(d.values)) {
        expect(['string', 'number']).toContain(typeof value);
      }
      // Survives the JSON round trip the API puts it through.
      expect(JSON.parse(JSON.stringify(d))).toEqual(d);
    }
  });

  it('keeps issue numbers as strings, so no locale ever groups "#1234"', () => {
    const d = describeMessage(
      signal({ state: WORK_STATES.PLANNING, topItems: top(1234, 'Big') }),
    );
    expect(d.values.number).toBe('1234');
  });

  it('every LiveHeader message parses as ICU', () => {
    const walk = (node, prefix = '') =>
      Object.entries(node).flatMap(([k, v]) =>
        typeof v === 'string' ? [[`${prefix}${k}`, v]] : walk(v, `${prefix}${k}.`),
      );
    for (const [key, message] of walk(en)) {
      expect(() => new IntlMessageFormat(message, 'en'), key).not.toThrow();
    }
  });

  it('words a descriptor under another locale, title isolated in <bdi>', () => {
    // `ar` has six plural categories; the English messages fall back to
    // `other` for the ones they do not name, which is the guarantee a machine
    // translation inherits until it adds its own forms.
    const t = createTranslator({
      locale: 'ar',
      messages: { LiveHeader: en },
      namespace: 'LiveHeader',
    });
    const d = describeSecondaryMessage(
      signal({ state: WORK_STATES.SHIPPING, projectInProgressCount: 3, topItems: top(82, 'i18n') }),
    );
    const worded = t.markup(d.key, { ...d.values, bdi: (c) => `<bdi>${c}</bdi>` });
    expect(worded).toContain('<bdi>#82 i18n</bdi>');
  });

  it('rejects anything that is not a message descriptor', () => {
    for (const bad of [
      null,
      undefined,
      'message.idle',
      { key: 'headline.idle', values: {} },
      { key: 'message.idle' },
      { key: 'message.idle', values: [] },
      { key: 'message.idle; drop', values: {} },
    ]) {
      expect(isMessageDescriptor(bad)).toBe(false);
    }
  });

  it('describes the headline by state', () => {
    expect(describeHeadline(signal({ state: WORK_STATES.LIVE }))).toEqual({
      key: 'headline.live',
      values: {},
    });
    expect(describeHeadline(signal({ state: 'mystery' })).key).toBe('headline.idle');
  });
});
