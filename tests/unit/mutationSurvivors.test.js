import { describe, expect, it } from 'vitest';

import { noStoreJson, safeBearerEqual } from '@/app/api/_utils/cronAuth';
import { decodeCursor } from '@/lib/guestbook/cursor';

// Cases written to kill specific mutants that survived the first Stryker run
// (issue #92, L10). Each describes a real behaviour the suites never pinned; the
// mutant is named so a future reader knows why the case exists.

const b64 = (text) => Buffer.from(text, 'utf8').toString('base64url');

describe('cronAuth — survivors', () => {
  it('requires the exact "Bearer " scheme prefix (mutant: prefix → "")', () => {
    // With the prefix check emptied, a header that IS the bare secret would
    // compare the whole header against the secret and pass.
    expect(safeBearerEqual('s3cret-value', 's3cret-value')).toBe(false);
    expect(safeBearerEqual('Basic s3cret-value', 's3cret-value')).toBe(false);
    expect(safeBearerEqual('Bearer s3cret-value', 's3cret-value')).toBe(true);
  });

  it('noStoreJson pins Cache-Control: no-store (mutant: headers → {})', async () => {
    const res = noStoreJson({ ok: true }, { status: 401 });
    expect(res.status).toBe(401);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.json()).toEqual({ ok: true });
  });

  it('noStoreJson keeps caller headers alongside it (mutant: merge dropped)', () => {
    const res = noStoreJson({}, { headers: { 'X-Run': 'abc' } });
    expect(res.headers.get('x-run')).toBe('abc');
    expect(res.headers.get('cache-control')).toBe('no-store');
  });
});

describe('decodeCursor — survivors', () => {
  it('rejects a cursor with no time before the separator (mutant: sep <= 0 → sep < 0)', () => {
    expect(decodeCursor(b64(':msg_1_deadbeef'))).toBeNull();
  });

  it('rejects a cursor with no separator at all (mutant: separator check removed)', () => {
    expect(decodeCursor(b64('1700000000000'))).toBeNull();
  });

  it('rejects a time beyond Number.MAX_SAFE_INTEGER (mutant: safe-integer check removed)', () => {
    expect(decodeCursor(b64('9999999999999999:msg_1_deadbeef'))).toBeNull();
  });

  it('anchors the charset at BOTH ends (mutants: ^ or $ dropped)', () => {
    const good = b64('1700000000000:msg_1_deadbeef');
    expect(decodeCursor(good)).toEqual({ t: 1700000000000, id: 'msg_1_deadbeef' });
    expect(decodeCursor(`${good}!`)).toBeNull();
    expect(decodeCursor(`!${good}`)).toBeNull();
  });
});
