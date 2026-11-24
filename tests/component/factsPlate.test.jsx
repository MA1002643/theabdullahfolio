import { renderToString } from 'react-dom/server';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// The overview facts plate's written-ledger entrance (issue #31, owner
// request 2026-11-23): each fact's filament draws hot and burns out while
// the label and the fire-ramped value pour up out of masks. This file pins
// the contract that holds in EVERY mode:
//   - the <dl> semantics survive the masks (aria-label, each <dt> paired
//     with its <dd>, textContent intact, a link keeps its href and rel);
//   - the SERVER markup is masked (translateY(105%)) and the filament is
//     drawn-in from zero (scaleX(0)) and hot, so hydration starts from
//     exactly what was painted and the <noscript> rule has poses to undo;
//   - the ramp rides the MOVING span (`.cs-facts__fill` on the mask inner),
//     never the <dd> above it — the About tilt-card GPU rule;
//   - the filament stays decoration (aria-hidden).
// The landed state under framer's static mode is pinned where the static
// harness lives, tests/component/motionStaticFallback.test.jsx.

vi.mock('@/hooks/useReducedMotion', () => ({ useReducedMotion: () => false }));

const { default: FactsPlate } = await import('@/components/case-study/FactsPlate');

const FACTS = [
  { id: 'role', label: 'Role', value: 'Design & engineering' },
  { id: 'timeline', label: 'Timeline', value: 'Jul 2025 – present' },
  { id: 'stack', label: 'Stack', value: 'Next.js, React, next-intl' },
  { id: 'repository', label: 'Repository', value: 'Public', href: 'https://github.com/MA1002643/theabdullahfolio' },
];

describe('overview facts plate (FactsPlate)', () => {
  it('keeps the definition-list semantics across the masks', () => {
    const { container } = render(<FactsPlate facts={FACTS} label="Project facts" />);
    const dl = container.querySelector('dl');
    expect(dl).toHaveAttribute('aria-label', 'Project facts');
    const items = [...dl.querySelectorAll('.cs-facts__item')];
    expect(items).toHaveLength(4);
    for (const [i, item] of items.entries()) {
      expect(item.querySelector('dt').textContent).toBe(FACTS[i].label);
      expect(item.querySelector('dd').textContent).toBe(FACTS[i].value);
    }
    const link = dl.querySelector('a');
    expect(link).toHaveAttribute('href', FACTS[3].href);
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('keeps the filament decorative and the ramp on the moving span', () => {
    const { container } = render(<FactsPlate facts={FACTS} label="Project facts" />);
    const filaments = [...container.querySelectorAll('.cs-facts__filament')];
    expect(filaments).toHaveLength(4);
    for (const filament of filaments) {
      expect(filament).toHaveAttribute('aria-hidden', 'true');
      expect(filament.textContent).toBe('');
    }
    // The gradient clips the element that translates, never the <dd> above
    // it: a parent background-clip over a moving child is the GPU bug.
    for (const dd of container.querySelectorAll('dd')) {
      expect(dd.querySelector('.cs-mask__inner').classList.contains('cs-facts__fill')).toBe(true);
    }
  });

  it('server-renders every fact masked and every filament undrawn and hot', () => {
    const html = renderToString(<FactsPlate facts={FACTS} label="Project facts" />);
    // Text hidden by transform inside the mask's clip, never by opacity.
    expect(html).toContain('translateY(105%)');
    // The filament waits at zero width, wearing the hot ember a no-JS
    // reader keeps (the noscript rule clears transforms, not colours).
    expect(html).toContain('scaleX(0)');
    expect(html).toContain('rgba(255, 170, 42, 0.9)');
  });
});
