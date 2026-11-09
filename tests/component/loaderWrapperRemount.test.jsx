import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// The intro loader and a remount in the same page load (issue #200).
//
// <MotionFeatures> remounts its whole subtree when framer's features chunk
// never arrives (tests/component/motionStaticFallback.test.jsx), and the
// loader lives in that subtree. Its "did this visit enter on `/`" decision is
// made on first render, so without a guard a visitor still on the homepage
// would watch the intro a second time.

vi.mock('@/i18n/navigation', () => ({ usePathname: () => '/' }));
vi.mock('next-intl', async (importOriginal) => ({
  ...(await importOriginal()),
  useLocale: () => 'en',
  useTranslations: () => (key) => key,
}));

const { default: LoaderWrapper } = await import('@/components/loaderWrapper');

const overlay = () => document.querySelector('.loader-percent');

afterEach(() => {
  delete window.__loaderDone;
});

describe('LoaderWrapper remount', () => {
  it('plays the intro when the visit enters on the homepage', () => {
    render(
      <LoaderWrapper>
        <p>Page</p>
      </LoaderWrapper>,
    );
    expect(overlay()).not.toBeNull();
  });

  it('does not play it again once this page load has already revealed', () => {
    window.__loaderDone = true;
    render(
      <LoaderWrapper>
        <p>Page</p>
      </LoaderWrapper>,
    );
    expect(overlay()).toBeNull();
    expect(screen.getByText('Page')).toBeVisible();
  });
});
