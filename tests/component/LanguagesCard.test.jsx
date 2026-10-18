import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import LanguagesCard from '@/components/about/LanguagesCard';

// The /about languages list (issue #92). Each row is the trigger for a
// per-language repository breakdown, but only when there IS a breakdown: a
// language with no public repos and no private aggregate is a plain statistic.
// Every row used to carry role="button" and tabIndex 0, so a statistic was
// announced as a disabled button and still took a Tab stop. Only the rows that
// can open something are controls; the rest keep their informational semantics.

const DATA = [
  { language: 'JavaScript', percentage: '60.00', color: '#f1e05a', repos: [{ name: 'site', percentage: 100 }] },
  { language: 'Go', percentage: '30.00', color: '#00add8', repos: [], privateRepos: { count: 2 } },
  { language: 'Shell', percentage: '10.00', color: '#89e051', repos: [] },
];

function rowFor(container, name) {
  const row = [...container.querySelectorAll('[data-lang-row]')].find((el) => el.textContent.includes(name));
  if (!row) throw new Error(`no row for ${name}`);
  return row;
}

describe('LanguagesCard rows', () => {
  it('exposes button semantics only on rows that open a breakdown', () => {
    const { container } = render(<LanguagesCard data={DATA} />);

    for (const name of ['JavaScript', 'Go']) {
      const row = rowFor(container, name);
      expect(row.getAttribute('role'), name).toBe('button');
      expect(row.getAttribute('tabindex'), name).toBe('0');
      expect(row.getAttribute('aria-haspopup'), name).toBe('true');
    }

    const stat = rowFor(container, 'Shell');
    expect(stat.hasAttribute('role')).toBe(false);
    expect(stat.hasAttribute('aria-disabled')).toBe(false);
    expect(stat.hasAttribute('aria-haspopup')).toBe(false);
    expect(stat.getAttribute('tabindex')).toBe('-1');
  });
});
