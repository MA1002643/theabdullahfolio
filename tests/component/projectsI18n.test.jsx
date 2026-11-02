import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { renderWithIntl } from '../support/intl';
import enQualifications from '../../messages/en/Qualifications.json';

// /projects, /projects/[id] and /qualifications under next-intl (issue #82).
// Each case renders the REAL component inside the REAL catalogue and asserts
// on what the visitor gets: English byte-identical to the pre-i18n literals,
// and under `ar` (an RTL locale whose catalogue falls back to English text)
// the STRUCTURE that has to change — the wheel's mirrored geometry, the
// locale's own digits. Arabic wording is the translation pipeline's job and
// is deliberately not asserted.

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ prefetch: () => {}, push: () => {} }),
  usePathname: () => '/projects',
}));
vi.mock('next/image', () => ({
  // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
  default: ({ fill, priority, placeholder, blurDataURL, sizes, fetchPriority, ...props }) => <img {...props} />,
}));
// The scene loader pulls next/dynamic + the three.js chunk; the cards only
// call its warm-up on hover.
vi.mock('@/components/project-detail/scene-loader', () => ({
  warmProjectScene: () => {},
}));
// TransitionLink is the Stone Passage choreography; a plain anchor is the
// part these tests read.
vi.mock('@/components/pageTransition/TransitionLink', async () => {
  const { forwardRef } = await import('react');
  return {
    default: forwardRef(function TransitionLink({ href, transitionLabel, children, ...props }, ref) {
      return (
        <a ref={ref} href={href} {...props}>
          {children}
        </a>
      );
    }),
  };
});
// Reduced motion: the carousel skips its rAF entrance and lands on its final
// wheel pose on the first render, which is the pose these tests measure.
vi.mock('@/hooks/useReducedMotion', () => ({ useReducedMotion: () => true }));

const { default: ProjectList } = await import('@/components/projects');
const { formatCardDate } = await import('@/components/projects/ProjectLayout');
const { default: Carousel, CARDS } = await import('@/components/qualifications/Carousel');
const { default: ProjectIntro } = await import('@/components/project-detail/project-intro');
const { default: LoadingStatus } = await import('@/components/project-detail/loading-status');
const { default: ScrollHijackCategories } = await import('@/components/shared/ScrollHijackCategories');
const { projectsData } = await import('@/app/data');

describe('/projects listing', () => {
  it('renders the English page copy and tabs unchanged', () => {
    renderWithIntl(<ProjectList projects={projectsData} />);
    expect(screen.getByRole('group', { name: 'Project categories' })).toBeInTheDocument();
    for (const cat of ['All', 'Web', 'AI']) {
      expect(document.querySelector(`[data-category="${cat}"]`)).not.toBeNull();
    }
    expect(screen.getAllByText(projectsData[0].description).length).toBeGreaterThan(0);
    expect(screen.getAllByText(new Date(projectsData[0].date).toDateString()).length).toBeGreaterThan(0);
  });

  it('keeps the English category KEY on the tab when the label is localised', () => {
    renderWithIntl(<ProjectList projects={projectsData} />, { locale: 'ar' });
    // data-category is the filter key the handoff token and counts compare.
    expect(document.querySelector('[data-category="All"]')).not.toBeNull();
    expect(document.querySelector('[data-category="Web"]')).not.toBeNull();
  });
});

describe('card date', () => {
  it('is toDateString() in English, byte for byte', () => {
    for (const p of projectsData) {
      expect(formatCardDate(p.date, 'en')).toBe(new Date(p.date).toDateString());
    }
  });

  // Code points, not a regex literal: these files have been bitten by escape
  // sequences landing as raw bytes. Digits follow CLDR's default numbering for
  // the tag, which for `ar` varies by ICU build; Persian's extended
  // Arabic-Indic digits (U+06F0..U+06F9) do not.
  it('uses the locale’s own month names and digits elsewhere', () => {
    const has = (text, lo, hi) => [...text].some((c) => c.codePointAt(0) >= lo && c.codePointAt(0) <= hi);
    expect(has(formatCardDate('2025-07-20', 'ar'), 0x0600, 0x06ff)).toBe(true);
    expect(has(formatCardDate('2025-07-20', 'fa'), 0x06f0, 0x06f9)).toBe(true);
    expect(formatCardDate('2025-07-20', 'de')).toMatch(/Juli/);
  });
});

describe('/qualifications carousel', () => {
  it('pins every card title to the English catalogue', () => {
    expect(Object.keys(enQualifications.cards)).toHaveLength(CARDS.length);
    for (const card of CARDS) {
      expect(enQualifications.cards[String(card.id)], `cards.${card.id}`).toBe(card.title);
    }
  });

  it('renders the English controls and labels unchanged', () => {
    renderWithIntl(<Carousel />);
    expect(screen.getByRole('button', { name: 'Prev' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Qualification categories' })).toBeInTheDocument();
    const centre = CARDS[Math.floor(CARDS.length / 2)];
    expect(screen.getByRole('link', { name: `Open ${centre.title} in a new tab` })).toBeInTheDocument();
  });

  it('names the sub-category row with one interpolated message', () => {
    renderWithIntl(<Carousel />);
    fireEvent.click(document.querySelector('[data-category="Education"]'));
    expect(screen.getByRole('group', { name: 'Education sub-categories' })).toBeInTheDocument();
  });

  // The card after the centre sits on the reading-END side: right in LTR,
  // left in RTL, with the inward tilt mirrored to match. Found by its
  // certificate link, which every locale shares: the visible title is
  // translated (Arabic has its own), so it cannot locate the card.
  const nextCardTransform = () => {
    const next = CARDS[Math.floor(CARDS.length / 2) + 1];
    let node = document.querySelector(`a[href="${next.img}"]`);
    while (node && !node.style?.transform?.includes('translateX')) node = node.parentElement;
    return node.style.transform;
  };

  it('lays the next card out to the right in LTR', () => {
    renderWithIntl(<Carousel />);
    const transform = nextCardTransform();
    expect(transform).toContain('calc(1 * var(--slot-vh))');
    expect(transform).toContain('rotateY(-20deg)');
  });

  it('mirrors the wheel in RTL', () => {
    renderWithIntl(<Carousel />, { locale: 'ar' });
    const transform = nextCardTransform();
    expect(transform).toContain('calc(-1 * var(--slot-vh))');
    expect(transform).toContain('rotateY(20deg)');
  });
});

describe('ScrollHijackCategories formatLabel', () => {
  it('shows the formatted label but reports the key', () => {
    const onSelect = vi.fn();
    renderWithIntl(
      <ScrollHijackCategories
        categories={['All', 'Web']}
        active="All"
        onSelect={onSelect}
        formatLabel={(cat) => `label:${cat}`}
      />,
    );
    const tab = document.querySelector('[data-category="Web"]');
    expect(tab).toHaveTextContent('label:Web');
    fireEvent.click(tab);
    expect(onSelect).toHaveBeenCalledWith('Web');
  });
});

describe('/projects/[id] intro', () => {
  const links = { name: 'culina', demo: 'https://example.com', source: 'https://github.com/x/culina' };

  // The DOM is the pre-i18n markup exactly (text, then an sr-only span whose
  // text opens with a space). jsdom's name computation trims that span's
  // leading space where a browser keeps it, hence the optional whitespace.
  it('keeps the English link names, sr-only tail included', () => {
    renderWithIntl(<ProjectIntro name="culina" description="AI-powered recipe discovery platform" links={links} />);
    expect(screen.getByRole('navigation', { name: 'culina links' })).toBeInTheDocument();
    console.log('NAMES', screen.getAllByRole('link').map((l) => JSON.stringify(require('dom-accessibility-api').computeAccessibleName(l))));
    expect(screen.getByRole('link', { name: /^Live demo\s?\(opens in a new tab\)$/ })).toHaveAttribute('href', links.demo);
    expect(screen.getByRole('link', { name: /^Source on GitHub\s?\(opens in a new tab\)$/ })).toHaveAttribute(
      'href',
      links.source,
    );
  });

  it('labels the loading fallback', () => {
    renderWithIntl(<LoadingStatus />);
    expect(screen.getByRole('status', { name: 'Loading project' })).toBeInTheDocument();
  });
});
