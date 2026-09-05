import { describe, expect, it } from 'vitest';
import { REFINE_MODES, resolveRefineMode } from '@/lib/refineModes';
import { CONTACT_REFINE_MIN_LEN } from '@/lib/refineLimits';
import { MESSAGE_MAX } from '@/lib/guestbook/validate';

// The mode table is the /api/refine-message contract in data form — these
// tests pin the parts a drive-by edit could silently break: the back-compat
// fallback (the deployed contact form sends no mode), the guestbook bounds
// staying in lock-step with the composer's own field, and the lookup
// refusing inherited object keys off the wire.

describe('resolveRefineMode', () => {
  it('resolves each declared mode to its own contract', () => {
    expect(resolveRefineMode('contact')).toBe(REFINE_MODES.contact);
    expect(resolveRefineMode('guestbook')).toBe(REFINE_MODES.guestbook);
  });

  it('falls back to the contact contract for absent or unknown modes', () => {
    expect(resolveRefineMode(undefined)).toBe(REFINE_MODES.contact);
    expect(resolveRefineMode(null)).toBe(REFINE_MODES.contact);
    expect(resolveRefineMode('')).toBe(REFINE_MODES.contact);
    expect(resolveRefineMode('twitter')).toBe(REFINE_MODES.contact);
    expect(resolveRefineMode(42)).toBe(REFINE_MODES.contact);
    expect(resolveRefineMode({ mode: 'guestbook' })).toBe(REFINE_MODES.contact);
  });

  it('refuses inherited object keys instead of returning prototype junk', () => {
    // A bare REFINE_MODES[mode] would hand back Object.prototype /
    // Function for these — truthy non-contracts that would reach streamText
    // with every budget field undefined.
    for (const hostile of ['__proto__', 'constructor', 'toString', 'hasOwnProperty']) {
      expect(resolveRefineMode(hostile)).toBe(REFINE_MODES.contact);
    }
  });
});

describe('REFINE_MODES contracts', () => {
  it('every mode carries a complete budget', () => {
    for (const [name, cfg] of Object.entries(REFINE_MODES)) {
      expect(cfg.system, name).toBeTypeOf('string');
      expect(cfg.system.length, name).toBeGreaterThan(100);
      expect(cfg.minLen, name).toBeTypeOf('number');
      expect(cfg.maxLen, name).toBeGreaterThan(cfg.minLen);
      expect(cfg.maxOutputTokens, name).toBeGreaterThan(0);
      expect(cfg.tag, name).toMatch(/^feature:/);
    }
  });

  it('keeps the guestbook bounds in lock-step with the composer field', () => {
    expect(REFINE_MODES.guestbook.maxLen).toBe(MESSAGE_MAX);
    // The composer's affordance floor (REFINE_MIN_LEN = 12) must clear this,
    // so the UI never offers a request the API would 400.
    expect(REFINE_MODES.guestbook.minLen).toBeLessThanOrEqual(12);
    // The prompt must state the surface's own cap and single-line rule.
    expect(REFINE_MODES.guestbook.system).toContain(String(MESSAGE_MAX));
    expect(REFINE_MODES.guestbook.system).toMatch(/single line|no line breaks/i);
    expect(REFINE_MODES.guestbook.system).toMatch(/never add links/i);
  });

  it('keeps the contact contract exactly as the deployed form expects', () => {
    expect(REFINE_MODES.contact.minLen).toBe(20);
    // …and that floor is the ONE constant MessageRefine's default affordance
    // floor reads too (refineLimits.js), so the UI can never offer a request
    // this gate would 400 — they had drifted to 24 and 20 (code review).
    expect(REFINE_MODES.contact.minLen).toBe(CONTACT_REFINE_MIN_LEN);
    expect(REFINE_MODES.contact.maxLen).toBe(2000);
    expect(REFINE_MODES.contact.maxOutputTokens).toBe(400);
    expect(REFINE_MODES.contact.tag).toBe('feature:contact-refine');
  });

  it('gives each surface its own gateway cost tag', () => {
    const tags = Object.values(REFINE_MODES).map((m) => m.tag);
    expect(new Set(tags).size).toBe(tags.length);
  });
});
