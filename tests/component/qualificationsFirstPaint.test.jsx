import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { IntlWrapper } from '../support/intl';

// The /qualifications centre certificate in the server HTML (CI, 2026-11-08).
//
// The centre certificate is the route's preloaded LCP image on a phone (issue
// #55). The carousel used to render EVERY card at its entrance pose, sunk and
// at opacity 0, until a double rAF after hydration started the ripple. Chrome
// judges an image at its first paint, so a certificate that had already
// downloaded (any warm or fast visit, and CI) painted invisibly and was never
// counted: the LCP fell to a paragraph, the preload bought nothing, and
// tests/perf/image-loading.spec.js failed on every run. A visitor without
// JavaScript saw no card at all.
//
// A server render is exactly that first state: no effects run, so the
// entrance never starts. The centre card must already be at rest and opaque;
// its neighbours keep the entrance pose they ripple out of.

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ prefetch: () => {}, push: () => {} }),
  usePathname: () => '/qualifications',
}));
vi.mock('next/image', () => ({
  // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
  default: ({ fill, preload, priority, placeholder, blurDataURL, sizes, fetchPriority, ...props }) => <img {...props} />,
}));
// Motion ON: the entrance is what is under test.
vi.mock('@/hooks/useReducedMotion', () => ({ useReducedMotion: () => false }));

const { default: Carousel, CARDS } = await import('@/components/qualifications/Carousel');

// The positioned card wrapper around a certificate link: the nearest ancestor
// that carries the wheel transform.
const cardFor = (root, card) => {
  let node = root.querySelector(`a[href="${card.img}"]`);
  while (node && !node.style?.transform?.includes('translateX')) node = node.parentElement;
  return node;
};

describe('/qualifications carousel, first paint (server HTML)', () => {
  const root = document.createElement('div');
  root.innerHTML = renderToString(
    <IntlWrapper locale="en">
      <Carousel />
    </IntlWrapper>,
  );
  const centreIndex = Math.floor(CARDS.length / 2);

  it('renders the centre certificate at rest and fully opaque, before any script runs', () => {
    const centre = cardFor(root, CARDS[centreIndex]);
    expect(centre, 'centre card wrapper').not.toBeNull();
    expect(centre.style.opacity).toBe('1');
    expect(centre.style.transform).not.toContain('scale(0.5)');
    expect(centre.style.transform).toContain('scale(1)');
    // Its title banner rests with it.
    expect(centre.querySelector('.qual-banner').style.opacity).toBe('1');
  });

  it('keeps the neighbours in the entrance pose they ripple out of', () => {
    const next = cardFor(root, CARDS[centreIndex + 1]);
    expect(next, 'next card wrapper').not.toBeNull();
    expect(next.style.opacity).toBe('0');
    expect(next.style.transform).toContain('scale(0.5)');
  });
});
