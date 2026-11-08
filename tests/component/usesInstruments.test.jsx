import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import InstrumentsPlate from '@/components/uses/InstrumentsPlate';
import { renderWithIntl } from '../support/intl';

// The /uses meter tiles' accessible names (CI, 2026-11-08). Each tile carried
// an aria-label with the FINAL figure while its visible digits read 0 (server
// HTML) or a value mid-climb, so the visible text was not part of the name:
// axe's label-content-name-mismatch failed /uses whenever it scanned before
// the count settled. The tiles are now named from their content: an sr-only
// final figure, the label, the note and the new-tab warning.

const facts = {
  instruments: {
    unit: { suites: 124, cases: 1391 },
    e2e: { suites: 22, cases: 421 },
    apiRoutes: 22,
    apiMethods: { GET: 13, POST: 8, DELETE: 1 },
  },
};

describe('Instruments plate tiles', () => {
  it('names each tile from its content, never an aria-label', () => {
    renderWithIntl(<InstrumentsPlate facts={facts} />);
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(3);
    for (const link of links) expect(link).not.toHaveAttribute('aria-label');
  });

  it('puts the final figure, label, note and new-tab warning in the name, whatever the digits show', () => {
    renderWithIntl(<InstrumentsPlate facts={facts} />);
    // The visible digits start at 0 before the count-up; the name does not.
    const link = screen.getByRole('link', {
      // Ungrouped, as every plate figure is (useUsesFormat).
      name: /^124 Vitest suites 1391 test cases · Vitest \(opens the folder on GitHub in a new tab\)$/,
    });
    expect(link).toBeTruthy();
    expect(
      screen.getByRole('link', { name: /^22 API routes route handlers · 13 GET · 8 POST · 1 DELETE / }),
    ).toBeTruthy();
  });
});
