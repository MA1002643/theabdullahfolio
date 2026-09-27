import { afterEach, describe, expect, it, vi } from 'vitest';

import { CONSENT_KEY, CONSENT_VERSION } from '@/lib/privacy/inventory';
import {
  STATUS,
  clearConsent,
  parseConsent,
  readConsent,
  writeConsent,
} from '@/lib/privacy/consentStore';

// ── The consent record (issue #141) ─────────────────────────────────────────
// P2: if it can silently break, it gets a test. This is the most literal
// instance of that rule in the repository — the failure mode is "three analytics
// scripts load for somebody who never agreed", and there is no symptom. The
// browser looks normal. The React tree looks normal. Only a network panel
// nobody is watching could tell.
//
// Every case below is a STRING, because what arrives from `localStorage` is a
// string from a source this module does not control: a previous version of this
// site, a half-finished write, a hand-edited devtools value, an extension. The
// module's single rule is that anything which is not an affirmative, current,
// well-formed grant resolves to `undecided`, and the cases are the ways that
// rule can be got wrong.
//
// Deliberately in the NODE environment, with `window` stubbed only where one is
// needed, rather than opting the file into jsdom. That is what the pure-function
// split in consentStore.js buys: every branch is reachable as a one-line
// assertion over a literal, instead of through a render, a mocked Storage and a
// DOM. (It is also currently the only way that works — the four jsdom suites in
// this directory fail on `window.localStorage.clear` under this vitest/jsdom
// pairing, a pre-existing breakage unrelated to this work.)
//
// ── Do not name the jsdom docblock directive in this file, not even in prose ──
// Vitest scans the whole source for the `@vitest-` environment pragma and does
// not care whether it is inside a comment ABOUT the pragma. An earlier draft of
// the paragraph above quoted it to explain why it was not being used, and that
// quotation silently switched the file to jsdom: `window` then existed, the
// "is undecided on the server" cases below failed, and the only other visible
// symptom was vitest reporting ~600ms of environment setup for a file that
// should report 0. A comment about an environment changed the environment.

/** A minimal, in-memory Storage that behaves like the real one. */
function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
    // Exposed for assertions, not part of the Storage contract.
    _map: map,
  };
}

const withWindow = (storage) => vi.stubGlobal('window', { localStorage: storage });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('parseConsent — anything that is not a real grant is undecided', () => {
  // `it.each` over the table, so a new hostile shape is one row rather than a
  // new copy of the same three assertions.
  const undecidedInputs = [
    ['null (nothing stored)', null],
    ['undefined', undefined],
    ['the empty string', ''],
    ['a number', 1],
    ['an object (not a string — never what storage returns)', { version: 1 }],
    ['truncated JSON', '{"version":1,"analytics":tr'],
    ['not JSON at all', 'granted'],
    ['the JSON literal null', 'null'],
    ['an array', '[{"version":1,"analytics":true}]'],
    ['a bare JSON string', '"granted"'],
    ['a JSON number', '1'],
    ['an older schema version', '{"version":0,"analytics":true}'],
    ['a newer schema version', '{"version":2,"analytics":true}'],
    ['a version that is a string', '{"version":"1","analytics":true}'],
    ['no version at all', '{"analytics":true}'],
    ['no analytics field', '{"version":1,"decidedAt":"2026-09-25T00:00:00.000Z"}'],
    ['analytics as the string "true"', '{"version":1,"analytics":"true"}'],
    ['analytics as the string "false"', '{"version":1,"analytics":"false"}'],
    ['analytics as 1', '{"version":1,"analytics":1}'],
    ['analytics as null', '{"version":1,"analytics":null}'],
  ];

  it.each(undecidedInputs)('reads %s as undecided', (_label, input) => {
    const result = parseConsent(input);
    expect(result.status).toBe(STATUS.UNDECIDED);
    // And never, under any of these, as permission.
    expect(result.analytics).toBe(false);
  });

  it('never throws, whatever it is handed', () => {
    // The contract the whole file rests on. A throw here happens during a render
    // path on every page of the site, so it is not a degraded experience — it is
    // a blank page.
    for (const [, input] of undecidedInputs) {
      expect(() => parseConsent(input)).not.toThrow();
    }
    expect(() => parseConsent(Symbol('x'))).not.toThrow();
  });

  it('reads "false" as DENIED, which is not the same as undecided', () => {
    // The distinction the three-state model exists for. Both send nothing, so a
    // two-state boolean looks correct in a network panel forever — and only
    // `undecided` shows the notice, so collapsing them re-asks somebody who
    // already refused, on every visit. That is the nagging that trains people to
    // click Accept to make a site shut up.
    const result = parseConsent('{"version":1,"analytics":false}');
    expect(result.status).toBe(STATUS.DENIED);
    expect(result.analytics).toBe(false);
    expect(result.status).not.toBe(STATUS.UNDECIDED);
  });

  it('reads a well-formed grant as granted, and carries the date', () => {
    const result = parseConsent(
      '{"version":1,"analytics":true,"decidedAt":"2026-09-25T10:00:00.000Z"}',
    );
    expect(result.status).toBe(STATUS.GRANTED);
    expect(result.analytics).toBe(true);
    expect(result.decidedAt).toBe('2026-09-25T10:00:00.000Z');
  });

  it('keeps a valid decision when only the timestamp is broken', () => {
    // `decidedAt` is a courtesy shown on /privacy, never load-bearing. Throwing
    // the whole decision away over it would re-prompt somebody who HAS decided,
    // which is a worse outcome than not knowing when they did.
    for (const raw of [
      '{"version":1,"analytics":true}',
      '{"version":1,"analytics":true,"decidedAt":null}',
      '{"version":1,"analytics":true,"decidedAt":12345}',
      // A string, but not a date. `typeof` alone let this through, and
      // ConsentStatusPanel printed "Invalid Date" on /privacy.
      '{"version":1,"analytics":true,"decidedAt":"not-a-date"}',
      '{"version":1,"analytics":true,"decidedAt":""}',
    ]) {
      const result = parseConsent(raw);
      expect(result.status).toBe(STATUS.GRANTED);
      expect(result.decidedAt).toBeNull();
    }
  });
});

describe('the version, and what bumping it does', () => {
  it('names the version in the storage key as well as inside the record', () => {
    // Belt and braces, and the belt is the record's `version` field — the key
    // alone would leave a `v2` deploy unable to see that a `v1` answer had ever
    // been given. Asserted so the two cannot drift: a bump that changed only one
    // of them would half-work, which is the worst of the three outcomes.
    expect(CONSENT_KEY).toContain(`v${CONSENT_VERSION}`);
  });

  it('re-prompts rather than granting or denying on a mismatch', () => {
    // The only safe direction, and the reason the field exists. A stored answer
    // is an answer to the disclosure the visitor was SHOWN; once that materially
    // changes, migrating the answer forward would assert agreement to terms they
    // never saw, and mapping it to `denied` would silently suppress a question
    // they are owed. Asymmetric by design: bumping the version can only ever
    // cause everyone to be asked again.
    const nextVersion = parseConsent(
      `{"version":${CONSENT_VERSION + 1},"analytics":true}`,
    );
    const prevVersion = parseConsent(
      `{"version":${CONSENT_VERSION - 1},"analytics":true}`,
    );
    expect(nextVersion.status).toBe(STATUS.UNDECIDED);
    expect(prevVersion.status).toBe(STATUS.UNDECIDED);
  });
});

describe('readConsent', () => {
  it('is undecided on the server, where there is no storage', () => {
    // The SSR default, and it must be this one: the server cannot know a
    // decision, so the first paint is the pre-decision state on both sides of
    // hydration.
    expect(typeof globalThis.window).toBe('undefined');
    expect(readConsent().status).toBe(STATUS.UNDECIDED);
  });

  it('is undecided when storage throws', () => {
    // Safari's private mode throws on access rather than returning null. A
    // supported state, not an error to surface: the site simply asks again,
    // which is the honest behaviour when it genuinely cannot remember.
    withWindow({
      getItem() {
        throw new DOMException('denied');
      },
    });
    expect(readConsent().status).toBe(STATUS.UNDECIDED);
  });

  it('is undecided when the whole localStorage accessor throws', () => {
    // A hardened browser can make the PROPERTY itself throw, before any method
    // is reached — so the try/catch has to wrap the access, not just the call.
    vi.stubGlobal('window', {
      get localStorage() {
        throw new DOMException('blocked');
      },
    });
    expect(readConsent().status).toBe(STATUS.UNDECIDED);
  });

  it('reads a stored decision back', () => {
    withWindow(
      fakeStorage({
        [CONSENT_KEY]: JSON.stringify({
          version: CONSENT_VERSION,
          analytics: true,
          decidedAt: '2026-09-25T10:00:00.000Z',
        }),
      }),
    );
    expect(readConsent()).toEqual({
      status: STATUS.GRANTED,
      analytics: true,
      decidedAt: '2026-09-25T10:00:00.000Z',
    });
  });

  it('ignores a record under a different key', () => {
    withWindow(fakeStorage({ 'ma:consent:v99': '{"version":1,"analytics":true}' }));
    expect(readConsent().status).toBe(STATUS.UNDECIDED);
  });
});

describe('writeConsent', () => {
  it('writes the versioned record and returns the decision', () => {
    const storage = fakeStorage();
    withWindow(storage);

    const result = writeConsent(true);
    expect(result.status).toBe(STATUS.GRANTED);
    expect(result.analytics).toBe(true);

    const stored = JSON.parse(storage.getItem(CONSENT_KEY));
    expect(stored.version).toBe(CONSENT_VERSION);
    expect(stored.analytics).toBe(true);
    // An ISO string, so it is unambiguous and locale-free on the way back out.
    expect(Number.isNaN(Date.parse(stored.decidedAt))).toBe(false);
  });

  it('records a refusal as a real, readable decision', () => {
    // Not as an absence. A refusal that read back as `undecided` would re-ask
    // tomorrow, which is not a refusal.
    const storage = fakeStorage();
    withWindow(storage);
    expect(writeConsent(false).status).toBe(STATUS.DENIED);
    expect(readConsent().status).toBe(STATUS.DENIED);
  });

  it('coerces anything that is not `true` to false', () => {
    // The stored record must only ever hold a real boolean, because
    // `parseConsent` rejects everything else — a write of `'yes'` would produce
    // a record this module then reads as undecided, i.e. a decision that
    // silently did not stick.
    const storage = fakeStorage();
    withWindow(storage);
    for (const input of ['true', 1, {}, null, undefined]) {
      writeConsent(input);
      expect(JSON.parse(storage.getItem(CONSENT_KEY)).analytics).toBe(false);
    }
  });

  it('still honours the decision for this session when the write fails', () => {
    // Quota exceeded, private mode, blocked storage. The visitor answered a
    // question and the answer applies NOW; all that is lost is being asked again
    // next visit. Refusing to act on a click because it could not be persisted
    // would be the wrong trade in the wrong direction.
    withWindow({
      getItem: () => null,
      setItem() {
        throw new DOMException('QuotaExceededError');
      },
    });
    expect(() => writeConsent(true)).not.toThrow();
    expect(writeConsent(true).status).toBe(STATUS.GRANTED);
  });

  it('does not throw on the server', () => {
    expect(typeof globalThis.window).toBe('undefined');
    expect(writeConsent(true).status).toBe(STATUS.GRANTED);
  });
});

describe('clearConsent', () => {
  it('removes the record and returns to undecided', () => {
    const storage = fakeStorage();
    withWindow(storage);
    writeConsent(true);
    expect(storage.getItem(CONSENT_KEY)).not.toBeNull();

    expect(clearConsent().status).toBe(STATUS.UNDECIDED);
    expect(storage.getItem(CONSENT_KEY)).toBeNull();
    expect(readConsent().status).toBe(STATUS.UNDECIDED);
  });

  it('is not the same thing as declining', () => {
    // Declining is an ANSWER and is remembered; clearing is "pretend I was never
    // asked" and brings the notice back. The Decline button must write a real
    // refusal — only a version bump and the debugging path want this.
    const storage = fakeStorage();
    withWindow(storage);
    writeConsent(false);
    expect(readConsent().status).toBe(STATUS.DENIED);
    clearConsent();
    expect(readConsent().status).toBe(STATUS.UNDECIDED);
  });

  it('survives storage that throws', () => {
    withWindow({
      getItem: () => null,
      removeItem() {
        throw new DOMException('denied');
      },
    });
    expect(() => clearConsent()).not.toThrow();
  });
});
