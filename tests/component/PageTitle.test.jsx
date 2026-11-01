import { describe, expect, it } from 'vitest';

import PageTitle from '@/components/PageTitle';
import { renderWithIntl } from '../support/intl.jsx';

// The shared sub-page headline ignites letter by letter, one inline-block span
// per glyph. That is harmless for Latin and fatal for Arabic (issue #82): an
// Arabic letter alone in an inline-block box loses its joining form, so a
// per-letter split renders the title as a row of disconnected letters. These
// cases pin the cut the headline makes, and that the <h1> still carries the
// whole string either way (it is what crawlers index and screen readers read).

const animatedUnits = (h1) =>
  Array.from(h1.querySelectorAll('span[aria-hidden="true"]'))
    .map((s) => s.textContent)
    .filter((t) => t.trim() !== '');
// Word gaps are non-breaking-space spacer spans (they must keep their width
// between inline-block letters), so the text is compared with them folded.
const text = (h1) => h1.textContent.replace(/\u00a0/g, ' ');

describe('PageTitle', () => {
  it('splits an English title into single letters, unchanged', () => {
    const { getByRole } = renderWithIntl(<PageTitle title="ABOUT ME" subtitle="who I am" />);
    const h1 = getByRole('heading', { level: 1, name: 'ABOUT ME' });
    expect(animatedUnits(h1)).toEqual(['A', 'B', 'O', 'U', 'T', 'M', 'E']);
    expect(text(h1)).toBe('ABOUT ME');
  });

  it('keeps each Arabic word whole, so its letters stay joined', () => {
    const { getByRole } = renderWithIntl(<PageTitle title="نبذة عني" />, { locale: 'ar' });
    const h1 = getByRole('heading', { level: 1, name: 'نبذة عني' });
    expect(animatedUnits(h1)).toEqual(['نبذة', 'عني']);
    expect(text(h1)).toBe('نبذة عني');
  });

  it('keeps each Devanagari word whole (conjuncts must not be split)', () => {
    const { getByRole } = renderWithIntl(<PageTitle title="मेरे बारे में" />, { locale: 'hi' });
    const h1 = getByRole('heading', { level: 1 });
    expect(animatedUnits(h1)).toEqual(['मेरे', 'बारे', 'में']);
    expect(h1).toHaveAttribute('aria-label', 'मेरे बारे में');
  });
});
