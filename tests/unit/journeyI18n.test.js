// @vitest-environment jsdom
import { createElement } from 'react';
import { cleanup, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TimelineAtlas from '@/components/journey/TimelineAtlas';
import TimelineNode from '@/components/journey/TimelineNode';
import { journeyData } from '@/app/data';
import { createTranslator } from 'next-intl';
import { messagesFor, renderWithIntl } from '../support/intl';

// /journey in another language (issue #82). These assert STRUCTURE —
// direction, digits, the plural messages — and take any words from the
// catalogue itself, never typed in, so a retranslation cannot break them. `fa` is the
// probe locale: it is right-to-left AND its CLDR default numbering system is
// extended Arabic-Indic, so one render exercises both halves. (`ar` would not
// do for the digits: current CLDR gives bare `ar` Western digits.)

const NOW = new Date('2026-10-18T12:00:00Z');

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

const persianYear = (y) =>
  new Intl.NumberFormat('fa', { useGrouping: false }).format(y);

function renderAtlas(locale) {
  renderWithIntl(
    createElement(TimelineAtlas, {
      activeYear: journeyData[0].year,
      filter: 'all',
      onFilter: () => {},
      revealed: true,
      reduceMotion: true,
      formatYear: locale === 'fa' ? persianYear : String,
    }),
    { locale },
  );
}

const bars = () =>
  screen.getAllByRole('button').filter((b) => b.classList.contains('ja-bar'));

describe('TimelineAtlas — right-to-left', () => {
  it('runs the time axis from the right edge: bars are placed by `right`, never `left`', () => {
    renderAtlas('fa');
    const all = bars();
    expect(all.length).toBe(journeyData.length);
    all.forEach((bar) => {
      expect(bar.style.right).not.toBe('');
      expect(bar.style.left).toBe('');
    });
  });

  it('keeps English byte-for-byte on `left`, as the atlas always wrote it', () => {
    renderAtlas('en');
    bars().forEach((bar) => {
      expect(bar.style.left).not.toBe('');
      expect(bar.style.right).toBe('');
    });
  });

  it('prints the axis years in the locale’s digits, ungrouped', () => {
    renderAtlas('fa');
    const first = Math.min(...journeyData.map((d) => Number(d.start.slice(0, 4))));
    expect(screen.getByText(persianYear(first))).toBeTruthy();
    // No "2,026"-style grouping separator anywhere on the axis.
    document.querySelectorAll('.ja-axis').forEach((el) => {
      expect(el.textContent).not.toMatch(/[,٬]/);
    });
  });

  it('formats the zoom readout as a locale percentage', () => {
    renderAtlas('fa');
    const pct = new Intl.NumberFormat('fa', { style: 'percent' }).format(1);
    // The fa catalogue's sentence around the locale's percentage.
    const t = createTranslator({ locale: 'fa', messages: messagesFor('fa'), namespace: 'Journey' });
    expect(screen.getByRole('status').textContent).toBe(t('atlas.zoom.status', { pct }));
    expect(screen.getByRole('status').textContent).not.toContain('Grid zoom');
  });
});

describe('TimelineAtlas — the plural messages', () => {
  it('counts each lane with the catalogue’s plural, in English as before', () => {
    renderAtlas('en');
    for (const type of ['career', 'education', 'milestone']) {
      const n = journeyData.filter((d) => d.type === type).length;
      if (!n) continue;
      expect(screen.getAllByText(n === 1 ? '1 entry' : `${n} entries`).length).toBeGreaterThan(0);
    }
  });
});

describe('TimelineNode — tenure', () => {
  // A closed entry's tenure is computed from start/end alone, so it renders on
  // the server pass and needs no clock.
  const closed = journeyData.find((d) => d.end && d.id);
  const node = (milestone, locale = 'en') =>
    renderWithIntl(
      createElement(
        'ol',
        null,
        createElement(TimelineNode, {
          milestone,
          isLeft: false,
          isEraStart: true,
          revealed: true,
          reduceMotion: true,
          dimmed: false,
        }),
      ),
      { locale },
    );
  const months = (ym) => {
    const [y, m] = ym.split('-').map(Number);
    return y * 12 + (m - 1);
  };

  it('reads "N yr(s) M mo" in English, exactly the old hand-built form', () => {
    const total = months(closed.end) - months(closed.start) + 1;
    const y = Math.floor(total / 12);
    const m = total % 12;
    const legacy = !y
      ? `${m} mo`
      : `${y} yr${y > 1 ? 's' : ''}${m ? ` ${m} mo` : ''}`;
    node(closed);
    expect(screen.getByText(legacy)).toBeTruthy();
  });

  it('mirrors the card into the RTL column: logical margin, no physical one', () => {
    node(closed, 'fa');
    const card = document.querySelector('.journey-lift').parentElement;
    expect(card.className).toContain('ms-12');
    expect(card.className).not.toMatch(/\bml-12\b/);
  });
});
