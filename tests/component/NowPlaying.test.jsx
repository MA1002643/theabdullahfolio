import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import NowPlaying from '@/components/spotify/NowPlaying';

// The Now Playing card's Escape (issue #92). Escape is shared: anything that
// acts on it claims it (src/lib/escapeKey.js), and the privacy notice declines
// analytics on a press nobody claimed. The card claims it when Escape collapses
// its expanded console.
//
// It used to do that only in its non-link form (a disclosure button). When a
// track has a Spotify URL the card is an <a>, and that branch had no key
// handler, so Escape on the focused, expanded link was claimed by nobody, and
// with the privacy notice open it declined analytics instead of collapsing the
// console (code review). jsdom reports no hover, so the hover hint never opens
// here: the "hint already dismissed" case, where the card is the only owner.
//
// `fireEvent` returns false when a handler called preventDefault(), which is
// exactly what claimEscape() does, so its return value IS the claim.

vi.mock('next/navigation', () => ({ usePathname: () => '/' }));
vi.mock('next/image', () => ({
  // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
  default: ({ fill, priority, placeholder, blurDataURL, sizes, ...props }) => <img {...props} />,
}));

const nowPlaying = vi.hoisted(() => ({ value: null }));
vi.mock('@/components/spotify/useNowPlaying', () => ({ useNowPlaying: () => nowPlaying.value }));

const play = (trackUrl) => {
  nowPlaying.value = {
    loading: false,
    data: {
      isPlaying: true,
      progressMs: 30_000,
      durationMs: 180_000,
      accent: '#ff6d05',
      track: {
        id: 't1',
        title: 'Song',
        artist: 'Artist',
        album: 'Album',
        albumArt: 'https://i.scdn.co/image/abc',
        trackUrl,
      },
    },
  };
};

const card = () => screen.getByLabelText(/now playing: Song by Artist/);

afterEach(() => {
  nowPlaying.value = null;
});

describe('NowPlaying Escape', () => {
  describe('as a link (the track has a Spotify URL)', () => {
    it('claims Escape and collapses the expanded console', () => {
      play('https://open.spotify.com/track/t1');
      render(<NowPlaying />);
      expect(card().tagName).toBe('A');
      act(() => card().focus());
      expect(card()).toHaveAttribute('aria-expanded', 'true');

      const unclaimed = fireEvent.keyDown(card(), { key: 'Escape' });
      expect(unclaimed).toBe(false);
      expect(card()).toHaveAttribute('aria-expanded', 'false');
      expect(card()).toHaveFocus();
    });

    it('leaves Escape unclaimed once collapsed, so the privacy notice still gets it', () => {
      play('https://open.spotify.com/track/t1');
      render(<NowPlaying />);
      act(() => card().focus());
      fireEvent.keyDown(card(), { key: 'Escape' });
      expect(fireEvent.keyDown(card(), { key: 'Escape' })).toBe(true);
    });

    it('keeps Enter and Space the link’s own', () => {
      play('https://open.spotify.com/track/t1');
      render(<NowPlaying />);
      act(() => card().focus());
      expect(fireEvent.keyDown(card(), { key: 'Enter' })).toBe(true);
      expect(fireEvent.keyDown(card(), { key: ' ' })).toBe(true);
      expect(card()).toHaveAttribute('aria-expanded', 'true');
    });
  });

  describe('as a disclosure button (no Spotify URL)', () => {
    it('still claims Escape when it collapses', () => {
      play(null);
      render(<NowPlaying />);
      expect(card()).toHaveAttribute('role', 'button');
      fireEvent.keyDown(card(), { key: 'Enter' });
      expect(card()).toHaveAttribute('aria-expanded', 'true');
      expect(fireEvent.keyDown(card(), { key: 'Escape' })).toBe(false);
      expect(card()).toHaveAttribute('aria-expanded', 'false');
    });
  });
});
