import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// The hero media's scroll settle (issue #31, M2). The image lays out at the
// article's full width and settles into the content column: scale down,
// corners in, and the same progress pulls the page up by the height the
// shrink frees (a transform never changes layout, so without the margin the
// first chapter would start a (1 − target) × height hole too low).
//
// The geometry under test: the settle TARGET is measured from the
// `.cs-hero__probe` column twin (the page's own CSS), never from a width
// restated in JS — the defect this file pins is the settle computing a
// target of 1 (a scroll animation wired to nothing) because the old measure
// read a parent that was the column itself.

let reduced = false;
let isStatic = false;
vi.mock('@/hooks/useReducedMotion', () => ({ useReducedMotion: () => reduced }));
vi.mock('@/components/motion/useStaticMotion', () => ({ useStaticMotion: () => isStatic }));
vi.mock('@/lib/webglSupport', () => ({ canCreateWebGL: () => false }));

const { default: HeroMedia } = await import('@/components/case-study/HeroMedia');

const MEDIA = {
  src: '/projects/theabdullahfolio/hero.webp',
  alt: 'The home page still',
  width: 1600,
  height: 1000,
};

// The measured page: a 1384px article (frame), a 1200px column (probe), and
// an 860px-tall media box. target = 1200/1384, gap = (1 − target) × 860.
const FRAME = 1384;
const COLUMN = 1200;
const HEIGHT = 860;
const TARGET = COLUMN / FRAME;
const GAP = (1 - TARGET) * HEIGHT;

/** jsdom measures everything at 0; serve the page's real geometry. */
const installGeometry = () => {
  vi.spyOn(Element.prototype, 'clientWidth', 'get').mockImplementation(function clientWidth() {
    if (this.classList.contains('cs-hero__probe')) return COLUMN;
    if (this.classList.contains('cs-bleed')) return FRAME;
    return 0;
  });
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function offsetHeight() {
    return this.classList.contains('cs-hero-media') ? HEIGHT : 0;
  });
};

const mediaBox = (container) => container.querySelector('.cs-hero-media');

afterEach(() => {
  reduced = false;
  isStatic = false;
  vi.restoreAllMocks();
});

describe('hero media settle (HeroMedia)', () => {
  it('reduced motion renders the framed end state as plain values', () => {
    installGeometry();
    reduced = true;
    const { container, getByAltText } = render(<HeroMedia {...MEDIA} />);
    expect(getByAltText('The home page still')).toBeInTheDocument();
    const box = mediaBox(container);
    // The settled card: column-wide, corners in, page pulled up by the gap.
    expect(parseFloat(box.style.transform.replace('scale(', ''))).toBeCloseTo(TARGET, 4);
    expect(parseFloat(box.style.borderRadius)).toBeCloseTo(16 / TARGET, 2);
    expect(parseFloat(box.style.marginBottom)).toBeCloseTo(-GAP, 1);
    expect(box.style.marginBottom).toMatch(/px$/);
  });

  it('static mode (features never arrived) renders the same framed end state', () => {
    installGeometry();
    isStatic = true;
    const { container } = render(<HeroMedia {...MEDIA} />);
    const box = mediaBox(container);
    expect(parseFloat(box.style.transform.replace('scale(', ''))).toBeCloseTo(TARGET, 4);
    expect(parseFloat(box.style.borderRadius)).toBeCloseTo(16 / TARGET, 2);
    expect(parseFloat(box.style.marginBottom)).toBeCloseTo(-GAP, 1);
  });

  it('at scroll 0 the moving style is the server markup: full bleed, untouched', () => {
    installGeometry();
    const { container } = render(<HeroMedia {...MEDIA} />);
    const box = mediaBox(container);
    // Even after measurement (target 0.867, gap 114), progress is 0: nothing
    // may move before the visitor scrolls, or hydration would jump the LCP.
    expect(['', 'none', 'scale(1)']).toContain(box.style.transform);
    expect(['', '0', '0px']).toContain(box.style.borderRadius);
    expect(parseFloat(box.style.marginBottom) || 0).toBe(0);
  });

  it('unmeasurable geometry stays at full bleed instead of scaling to nothing', () => {
    // No geometry installed: every width reads 0 (display: none, jsdom).
    reduced = true;
    const { container } = render(<HeroMedia {...MEDIA} />);
    const box = mediaBox(container);
    expect(['', 'none', 'scale(1)']).toContain(box.style.transform);
    expect(parseFloat(box.style.marginBottom) || 0).toBe(0);
  });
});
