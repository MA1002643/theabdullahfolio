import { renderToString } from 'react-dom/server';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// The chapter heading's molten entrance (issue #31, owner request
// 2026-11-22): words rise out of per-word masks wearing the gold→ember ramp
// and cool to the solid title accent. This file pins the contract that holds
// in EVERY mode:
//   - the heading's semantics survive the word splitting (one <h2>, the id
//     the chapter's aria-labelledby names, tabIndex -1 for palette jumps,
//     and textContent identical to the title, gaps included);
//   - the SERVER markup is masked and molten (translateY(105%), the hot
//     ramp), so hydration starts from exactly what was painted;
//   - the numeral stays decoration (aria-hidden).
// The landed, cooled end state under framer's static mode is pinned where
// the static harness lives, tests/component/motionStaticFallback.test.jsx.

vi.mock('@/hooks/useReducedMotion', () => ({ useReducedMotion: () => false }));

const { default: ChapterHeading } = await import('@/components/case-study/ChapterHeading');

describe('chapter heading (ChapterHeading)', () => {
  it('keeps the heading semantics across the word masks', () => {
    render(<ChapterHeading id="chapter-walkthrough-title" text="How a visit works" number="03" />);
    // By level, not name: jsdom's accname join drops the gap text nodes that
    // real engines keep (the live Chromium tree reads "How a visit works").
    const h2 = screen.getByRole('heading', { level: 2 });
    expect(h2.id).toBe('chapter-walkthrough-title');
    expect(h2.tabIndex).toBe(-1);
    // Gaps live OUTSIDE the masks, so the accessible name and copied text
    // keep their spaces exactly.
    expect(h2.textContent).toBe('How a visit works');
    expect(h2.querySelectorAll('.cs-mask__inner')).toHaveLength(4);
  });

  it('renders the numeral as decoration, outside the heading', () => {
    const { container } = render(<ChapterHeading id="t" text="Overview" number="01" />);
    const num = container.querySelector('.cs-chapter__num');
    expect(num).toHaveAttribute('aria-hidden', 'true');
    expect(num.textContent).toBe('01');
    expect(num.querySelector('.cs-mask')).not.toBeNull();
  });

  it('server-renders every word masked and molten, so hydration repaints nothing', () => {
    const html = renderToString(<ChapterHeading id="t" text="How a visit works" number="02" />);
    // Masked: below its own line box, hidden by the mask's overflow clip.
    expect(html).toContain('translateY(105%)');
    expect(html).not.toContain('opacity:0');
    // Molten: the per-word ramp is inline in the markup (pure CSS, so a
    // no-JS reader sees hot words, never invisible ones)…
    expect(html).toContain('background-clip:text');
    expect(html).toContain('rgb(255, 210, 125)');
    // …darkening to the ramp's ember end on the last word, which is the
    // same stop the cool resolves to (#ff6d05, --cs-accent by construction).
    expect(html).toContain('rgb(255, 109, 5) 100%');
  });
});
