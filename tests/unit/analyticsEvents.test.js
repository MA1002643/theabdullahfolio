import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ASSISTANT_REFERRERS,
  EVENTS,
  EVENT_PARAMS,
  isAssistantReferrer,
  trackEvent,
} from '@/lib/seo/analytics';

// ── Contracts that must survive the GA4 mount ───────────────────────────────
// GA4 is not mounted (blocked on #141), so every one of these paths is dormant
// today. That is exactly why they need pinning now: the moment #141 mounts a
// tag, `trackEvent` stops being a no-op and starts sending hits to Google, and
// the two properties that matter most are the ones nothing currently exercises.
//
//   • The consent gate is STRUCTURAL. There is no flag — `gtag` simply does not
//     exist on `window` until consent has mounted the tag. A future refactor
//     that "helpfully" queues events for later, or that adds a second condition
//     to the gate, would send pre-consent hits and no test would notice.
//
//   • An unknown event name must be REJECTED, never forwarded. GA4 has no
//     schema: it creates an event the first time it sees the name, so a typo
//     does not error — it silently registers a new event that collects a
//     trickle of traffic while the one you meant stays at zero.
//
// `trackEvent` must also never throw. A contact-form submission has to complete
// whether or not its analytics call worked.

const REAL_NODE_ENV = process.env.NODE_ENV;

/** Put a `window.gtag` in place, as a consented GA4 mount would. */
function mountGtag(implementation = vi.fn()) {
  globalThis.window = { gtag: implementation };
  return implementation;
}

afterEach(() => {
  delete globalThis.window;
  process.env.NODE_ENV = REAL_NODE_ENV;
  vi.restoreAllMocks();
});

describe('trackEvent — the consent gate', () => {
  it('returns false on the server, where there is no window at all', () => {
    // The vitest environment is node, so this is the real SSR condition rather
    // than a simulation of it.
    expect(typeof window).toBe('undefined');
    expect(trackEvent(EVENTS.CV_DOWNLOAD, { source_route: '/' })).toBe(false);
  });

  it('returns false in the browser before consent has mounted a tag', () => {
    // A client render with no `gtag` — every visit, until #141's flow grants.
    globalThis.window = {};
    expect(trackEvent(EVENTS.PALETTE_OPEN, { trigger: 'keyboard' })).toBe(
      false,
    );
  });

  it('sends the event once a gtag exists, and reports that it did', () => {
    const gtag = mountGtag();

    const sent = trackEvent(EVENTS.PROJECT_OPEN, {
      project_id: 3,
      project_name: 'plenary',
      category: 'System',
    });

    expect(sent).toBe(true);
    expect(gtag).toHaveBeenCalledTimes(1);
    // GA4's call shape: ('event', <name>, <params>). The WIRE name, not the key.
    expect(gtag).toHaveBeenCalledWith('event', 'project_open', {
      project_id: 3,
      project_name: 'plenary',
      category: 'System',
    });
  });

  it('defaults params to an empty object rather than passing undefined', () => {
    const gtag = mountGtag();
    expect(trackEvent(EVENTS.CONTACT_SUBMIT)).toBe(true);
    expect(gtag).toHaveBeenCalledWith('event', 'contact_submit', {});
  });
});

describe('trackEvent — unknown names are rejected, not forwarded', () => {
  it('refuses a name that is not in the EVENTS map, without calling gtag', () => {
    const gtag = mountGtag();
    vi.spyOn(console, 'error').mockImplementation(() => {});

    // The realistic bug: a plausible typo of a real event.
    expect(trackEvent('project_opened', { project_id: 1 })).toBe(false);
    expect(
      gtag,
      'forwarding an unknown name would create a phantom GA4 event',
    ).not.toHaveBeenCalled();
  });

  it('names the offending string and the file to fix, in development', () => {
    mountGtag();
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    trackEvent('made_up_event');

    expect(error).toHaveBeenCalledTimes(1);
    expect(error.mock.calls[0][0]).toContain('made_up_event');
    expect(error.mock.calls[0][0]).toContain('src/lib/seo/analytics.js');
  });

  it('stays silent in production, but still refuses', () => {
    process.env.NODE_ENV = 'production';
    const gtag = mountGtag();
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(trackEvent('made_up_event')).toBe(false);
    expect(gtag).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it('rejects non-string names without throwing', () => {
    mountGtag();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    for (const bad of [undefined, null, 42, {}, ['project_open']]) {
      expect(trackEvent(bad)).toBe(false);
    }
  });
});

describe('trackEvent — never breaks the interaction that triggered it', () => {
  it('returns false instead of propagating when gtag throws', () => {
    // A blocked, half-initialised or ad-blocker-stubbed tag. The submission
    // that triggered this must still complete.
    const gtag = mountGtag(
      vi.fn(() => {
        throw new Error('gtag blew up');
      }),
    );

    expect(() => trackEvent(EVENTS.CONTACT_SUCCESS)).not.toThrow();
    expect(trackEvent(EVENTS.CONTACT_SUCCESS)).toBe(false);
    expect(gtag).toHaveBeenCalled();
  });

  it('returns false when gtag is present but is not callable', () => {
    // Ad blockers and consent shims leave odd shapes behind.
    globalThis.window = { gtag: 'not a function' };
    expect(trackEvent(EVENTS.SOUND_TOGGLE, { state: 'on' })).toBe(false);
  });
});

describe('trackEvent — expected parameters', () => {
  it('warns about a missing expected param but still sends the event', () => {
    // A missing dimension is worth less than the event itself, so this must
    // never become a rejection.
    const gtag = mountGtag();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const sent = trackEvent(EVENTS.REFINE_USED, { mode: 'concise' });

    expect(sent).toBe(true);
    expect(gtag).toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('length_delta');
  });

  it('says nothing when every expected param is present', () => {
    mountGtag();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    trackEvent(EVENTS.REFINE_USED, { mode: 'concise', length_delta: -42 });

    expect(warn).not.toHaveBeenCalled();
  });
});

describe('trackEvent — a malformed params bag cannot take the call site down', () => {
  // The default parameter fires for `undefined` and nothing else, so `null` —
  // what a call site passes whenever its params come from something that can
  // return one — reached the validation below intact, and `null['mode']` threw
  // out of a function documented as never throwing.
  //
  // Two things kept it hidden. It needs an event that DECLARES params, since
  // the two with an empty list filter over nothing and never index. And it is
  // development-only: production skips the check and hands the null to `gtag`
  // inside the try. So it fired in the browser of whoever was mid-interaction,
  // breaking the click rather than the reporting it was for.
  const MALFORMED = [
    ['null', null],
    ['a string', 'concise'],
    ['a number', 42],
    ['a boolean', true],
    ['an array', ['concise', -42]],
  ];

  it.each(MALFORMED)('does not throw when params is %s', (_label, bad) => {
    mountGtag();
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    // REFINE_USED, specifically: it declares `mode` and `length_delta`, so the
    // validation actually indexes the bag. An event with no expected params
    // passes this whatever it is handed, which is why the original defect
    // survived a suite that exercised one.
    expect(() => trackEvent(EVENTS.REFINE_USED, bad)).not.toThrow();
  });

  it('sends the event anyway, with the normalised object', () => {
    const gtag = mountGtag();
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Still true, not false: the event is worth more than the dimensions, and
    // dropping it would trade a reporting gap for a bigger reporting gap.
    expect(trackEvent(EVENTS.REFINE_USED, null)).toBe(true);
    // `{}`, never `null` — a null third argument is not a payload GA4 can read.
    expect(gtag).toHaveBeenCalledWith('event', 'refine_used', {});
  });

  it('names the cause as well as the symptom, in development', () => {
    mountGtag();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    trackEvent(EVENTS.REFINE_USED, null);

    const messages = warn.mock.calls.map(([message]) => message).join('\n');
    // The symptom alone ("missing mode, length_delta") sends whoever reads it
    // hunting for the params that were passed — which is why the cause is said
    // separately.
    expect(messages).toContain('params must be an object');
    expect(messages).toContain('null');
    expect(messages).toContain('length_delta');
  });

  it('stays silent in production, and still sends {}', () => {
    process.env.NODE_ENV = 'production';
    const gtag = mountGtag();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(trackEvent(EVENTS.REFINE_USED, null)).toBe(true);
    expect(gtag).toHaveBeenCalledWith('event', 'refine_used', {});
    expect(warn).not.toHaveBeenCalled();
  });

  it('leaves a well-formed bag exactly as given', () => {
    // The normalisation must not become a copy or a filter: GA4 receives what
    // the call site meant to send, object identity included.
    const gtag = mountGtag();
    const params = { mode: 'concise', length_delta: -42 };

    trackEvent(EVENTS.REFINE_USED, params);

    expect(gtag.mock.calls[0][2]).toBe(params);
  });
});

describe('the event taxonomy itself', () => {
  it('gives every event a unique wire name', () => {
    // The check the module header promises. A copy-paste duplicate would make
    // two call sites indistinguishable in the reports — and, unlike a typo,
    // would look completely correct in review.
    const names = Object.values(EVENTS);
    expect(new Set(names).size, `duplicate wire name in EVENTS`).toBe(
      names.length,
    );
  });

  it('is frozen, so a call site cannot add a name at runtime', () => {
    expect(Object.isFrozen(EVENTS)).toBe(true);
    expect(Object.isFrozen(EVENT_PARAMS)).toBe(true);
    expect(Object.isFrozen(ASSISTANT_REFERRERS)).toBe(true);
  });

  it('declares expected params for every event, and for nothing else', () => {
    // A param list keyed to an event that no longer exists is dead
    // documentation; an event with no entry silently skips the warning.
    expect(Object.keys(EVENT_PARAMS).sort()).toEqual(
      Object.values(EVENTS).sort(),
    );
  });

  it('uses GA4 snake_case for every wire name', () => {
    for (const name of Object.values(EVENTS)) {
      expect(name, `${name} is not snake_case`).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });
});

describe('isAssistantReferrer', () => {
  it('matches a known host exactly', () => {
    expect(isAssistantReferrer('chatgpt.com')).toBe(true);
    expect(isAssistantReferrer('claude.ai')).toBe(true);
  });

  it('matches a full referrer URL, reading only its host', () => {
    expect(isAssistantReferrer('https://chatgpt.com/c/abc-123')).toBe(true);
    expect(isAssistantReferrer('https://www.perplexity.ai/search?q=x')).toBe(
      true,
    );
  });

  it('matches a subdomain of a known host', () => {
    expect(isAssistantReferrer('chat.chatgpt.com')).toBe(true);
    expect(isAssistantReferrer('https://eu.claude.ai/chat')).toBe(true);
  });

  it('does not match the parent domain of a listed host', () => {
    // The reason this is suffix-on-a-dot-boundary against an explicit list
    // rather than eTLD+1 matching: `gemini.google.com` is an assistant,
    // `google.com` is ordinary organic search, and folding the two together
    // would put all of Google Search into the assistant channel.
    expect(isAssistantReferrer('google.com')).toBe(false);
    expect(isAssistantReferrer('https://www.google.com/search?q=x')).toBe(
      false,
    );
    expect(isAssistantReferrer('gemini.google.com')).toBe(true);
  });

  it('does not match a host that merely ends with the same letters', () => {
    // No dot boundary — `notchatgpt.com` is somebody else entirely.
    expect(isAssistantReferrer('notchatgpt.com')).toBe(false);
    expect(isAssistantReferrer('myclaude.ai')).toBe(false);
  });

  it('does not match a look-alike that only starts with a known host', () => {
    expect(isAssistantReferrer('chatgpt.com.evil.example')).toBe(false);
    expect(isAssistantReferrer('https://claude.ai.phish.example/x')).toBe(
      false,
    );
  });

  it('reads the host, not the rest of the URL', () => {
    // A query string naming an assistant does not make the referrer one.
    expect(isAssistantReferrer('https://example.com/?ref=chatgpt.com')).toBe(
      false,
    );
    expect(isAssistantReferrer('https://example.com/chatgpt.com')).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(isAssistantReferrer('ChatGPT.com')).toBe(true);
    expect(isAssistantReferrer('https://CLAUDE.AI/chat')).toBe(true);
  });

  it('returns false for empty, missing or non-string input', () => {
    // `document.referrer` is '' on a direct visit, which is the common case.
    expect(isAssistantReferrer('')).toBe(false);
    expect(isAssistantReferrer(undefined)).toBe(false);
    expect(isAssistantReferrer(null)).toBe(false);
    expect(isAssistantReferrer(42)).toBe(false);
  });

  it('recognises every host on the published list', () => {
    // The list is exported for #141's channel group and quoted in docs/seo.md
    // and the W6 report, so an entry the matcher cannot match would be a lie in
    // three places at once.
    for (const host of ASSISTANT_REFERRERS) {
      expect(isAssistantReferrer(host), `${host} is listed but unmatched`).toBe(
        true,
      );
      expect(isAssistantReferrer(`https://${host}/somewhere`)).toBe(true);
    }
  });
});
