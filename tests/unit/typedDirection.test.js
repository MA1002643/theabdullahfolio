import { describe, expect, it } from 'vitest';
import { applyTypedDirection } from '@/components/contact/typedDirection';

// The contact fields' direction rule (issue #82): typed text takes the given
// direction, an empty field takes none (and so inherits the page's).
const el = (value = '') => {
  const attrs = new Map();
  return {
    value,
    setAttribute: (k, v) => attrs.set(k, v),
    removeAttribute: (k) => attrs.delete(k),
    dir: () => attrs.get('dir') ?? null,
  };
};

describe('applyTypedDirection', () => {
  it('gives a field with text, and its overlay, the typed direction', () => {
    for (const dir of ['auto', 'ltr']) {
      const field = el('نام');
      const overlay = el();
      applyTypedDirection(field, overlay, dir);
      expect([field.dir(), overlay.dir()]).toEqual([dir, dir]);
    }
  });

  it('leaves an empty field, and its overlay, with no dir so both inherit the page', () => {
    const field = el('');
    const overlay = el();
    applyTypedDirection(field, overlay, 'auto');
    expect([field.dir(), overlay.dir()]).toEqual([null, null]);
  });

  it('removes the direction again when the field is cleared', () => {
    const field = el('Abdullah');
    const overlay = el();
    applyTypedDirection(field, overlay, 'ltr');
    field.value = '';
    applyTypedDirection(field, overlay, 'ltr');
    expect([field.dir(), overlay.dir()]).toEqual([null, null]);
  });

  it('sets nothing when the field declares no typed direction', () => {
    const field = el('Abdullah');
    const overlay = el();
    applyTypedDirection(field, overlay, undefined);
    expect([field.dir(), overlay.dir()]).toEqual([null, null]);
  });
});
