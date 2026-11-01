import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import DecipherEmail from '@/components/footer/DecipherEmail';
import HoverText from '@/components/footer/HoverText';
import { SplitFlapText } from '@/components/footer/metaRevealMotion';
import DidYouMean from '@/components/not-found/DidYouMean';
import { renderWithIntl } from '../support/intl.jsx';

vi.mock('@/i18n/navigation', () => ({
  // eslint-disable-next-line jsx-a11y/anchor-has-content
  Link: ({ prefetch, ...props }) => <a {...props} />,
}));

// The footer's per-glyph motions — the split-flap copyright cascade and the
// hover roll on every index row — and the 404's "did you mean" line, under
// translation (issue #82). The animated glyphs are decorative; the real text
// is one sr-only copy, so these read both halves.

describe('SplitFlapText', () => {
  it('flips English per letter, words kept apart by a real space', () => {
    const { container } = render(<SplitFlapText text="© 2026 Muhammad Abdullah" />);
    expect(screen.getByText('© 2026 Muhammad Abdullah')).toHaveClass('sr-only');
    const words = container.querySelectorAll(':scope > span > span[aria-hidden="true"]');
    expect(Array.from(words, (w) => w.textContent)).toEqual(['©', '2026', 'Muhammad', 'Abdullah']);
    expect(words[2].children).toHaveLength('Muhammad'.length);
  });

  it('flips an Arabic word as ONE tick, keeping its letters joined', () => {
    const { container } = render(<SplitFlapText text="الصوت مفعّل" />);
    const words = container.querySelectorAll(':scope > span > span[aria-hidden="true"]');
    expect(Array.from(words, (w) => w.children.length)).toEqual([1, 1]);
    expect(words[0].textContent).toBe('الصوت');
  });
});

describe('HoverText', () => {
  it('rolls English letter by letter and Urdu word by word', () => {
    const { container: en } = render(<HoverText text="About" />);
    expect(en.querySelectorAll('.hover-text__char')).toHaveLength(5);
    const { container: ur } = render(<HoverText text="میرے بارے" />);
    const faces = Array.from(ur.querySelectorAll('.hover-text__face'), (f) => f.textContent);
    expect(faces).toEqual(['میرے', ' ', 'بارے']);
  });
});

describe('DidYouMean', () => {
  it('reads as one English sentence with the route as its link', () => {
    renderWithIntl(<DidYouMean suggestion={{ href: '/projects', label: 'Projects' }} />);
    const link = screen.getByRole('link', { name: 'Projects' });
    expect(link).toHaveAttribute('href', '/projects');
    expect(link.closest('p')).toHaveTextContent(/^Did you mean Projects\?$/);
  });
});

describe('per-glyph text in a right-to-left page', () => {
  // Each glyph is an inline-block, and inline-blocks are bidi-neutral: without
  // a direction of their own they follow the page, so an Arabic footer printed
  // "CV" as "VC" and the email address backwards. jsdom does no layout, so
  // this pins the attribute that makes the browser order them.
  it('lets a hover label take its direction from its own script', () => {
    const { container } = render(<HoverText text="CV" />);
    expect(container.querySelector('.hover-text')).toHaveAttribute('dir', 'auto');
  });

  it('keeps the email address left to right in every locale', () => {
    const { container } = render(
      <div dir="rtl">
        <DecipherEmail text="someone@example.com" active={false} />
      </div>,
    );
    expect(container.querySelector('.hover-text--decipher')).toHaveAttribute('dir', 'ltr');
  });
});
