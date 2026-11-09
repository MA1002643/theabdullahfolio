import { act, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithIntl } from '../support/intl.jsx';

// The terminal fallback for framer's features chunk (issue #200).
//
// LazyMotion has no error path, and the loader never rejects, so a chunk that
// is gone for good (a deploy removed it) used to leave every `m.*` entrance at
// its `initial` style for the visit: page content at opacity 0, despite a page
// that hydrated. Once the loader gives up (src/lib/motion/loadFeatures.js),
// <MotionFeatures> remounts its subtree in framer's static mode
// (`MotionConfig isStatic` + a presence that blocks the initial animation),
// where every `m.*` renders from its props alone, on every render, with no
// renderer.
//
// Run against the REAL `m` (the suite maps `m` to `motion`,
// tests/support/motionDouble.js), a loader whose chunk never arrives, and the
// real components the review named: a gated headline, a gated plate, a dialog
// behind a nested <AnimatePresence>, and a guestbook card.

const actual = await vi.importActual('framer-motion');
const { m } = actual;

const loader = vi.hoisted(() => {
  const listeners = new Set();
  const load = () => new Promise(() => {});
  load.onGiveUp = (listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };
  load.giveUp = () => listeners.forEach((listener) => listener());
  load.reset = () => listeners.clear();
  return load;
});
vi.mock('@/lib/motion/loadFeatures', () => ({ loadMotionFeatures: loader, loadLayoutFeatures: loader }));

// The real components below render `m` from the mocked module; give them the
// real lazy `m`, so they depend on the provider exactly as on the site.
vi.mock('framer-motion', async (importOriginal) => importOriginal());

const consent = vi.hoisted(() => ({ value: null }));
vi.mock('@/components/privacy/ConsentProvider', () => ({ useConsent: () => consent.value }));
vi.mock('@/i18n/navigation', () => ({
  // eslint-disable-next-line jsx-a11y/anchor-has-content
  Link: ({ prefetch, ...props }) => <a {...props} />,
  usePathname: () => '/about',
}));

const { default: MotionFeatures, LayoutMotionFeatures } = await import('@/components/motion/MotionFeatures');
const { AnimatePresence } = await import('@/components/motion/AnimatePresence');
const { default: PageTitle } = await import('@/components/PageTitle');
const { default: Plate } = await import('@/components/uses/Plate');
const { default: PreferenceCentre } = await import('@/components/privacy/PreferenceCentre');
const { default: MessageCard } = await import('@/components/guestbook/MessageCard');

// An observer that reports every target in view, so a viewport gate opens.
class SeeingObserver {
  constructor(callback) {
    this.callback = callback;
  }
  observe(target) {
    queueMicrotask(() =>
      this.callback([{ target, isIntersecting: true, intersectionRatio: 1, boundingClientRect: {} }], this),
    );
  }
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}

let originalObserver;
beforeEach(() => {
  loader.reset();
  originalObserver = window.IntersectionObserver;
});
afterEach(() => {
  window.IntersectionObserver = originalObserver;
  delete window.__loaderDone;
});

const giveUp = () => act(() => loader.giveUp());
/** Every element under `root` that carries an inline opacity of 0. */
const transparent = (root) => [...root.querySelectorAll('[style]')].filter((el) => el.style.opacity === '0');

function Page() {
  return (
    <>
      <m.h1 initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        Title
      </m.h1>
      <m.ul initial="hidden" animate="shown" variants={{ hidden: { opacity: 0 }, shown: { opacity: 1 } }}>
        <m.li variants={{ hidden: { clipPath: 'inset(0 100% 0 0)' }, shown: { clipPath: 'inset(0 0% 0 0)' } }}>
          Inherited
        </m.li>
      </m.ul>
      <m.p initial={{ opacity: 0 }} animate={{ opacity: [0, 0.4, 0.9] }}>
        Keyframes
      </m.p>
      <m.p initial={{ opacity: 0 }} whileInView={{ opacity: 1 }}>
        In view
      </m.p>
    </>
  );
}

describe('motion static fallback', () => {
  it('holds the initial style while the features are only late', () => {
    render(
      <MotionFeatures>
        <Page />
      </MotionFeatures>,
    );
    expect(screen.getByRole('heading', { name: 'Title' }).style.opacity).toBe('0');
  });

  it('shows every entrance at its final state once the loader gives up', () => {
    render(
      <MotionFeatures>
        <Page />
      </MotionFeatures>,
    );
    giveUp();

    const title = screen.getByRole('heading', { name: 'Title' });
    expect(title.style.opacity).toBe('1');
    expect(title.style.transform).toBe('none');
    expect(screen.getByText('Inherited').style.clipPath).toBe('inset(0 0% 0 0)');
    // The LAST keyframe, not the first.
    expect(screen.getByText('Keyframes').style.opacity).toBe('0.9');
    // No animate target: no seeded style, so the CSS default (visible).
    expect(screen.getByText('In view').style.opacity).toBe('');
    expect(title).toBeVisible();
  });

  it('follows a gate that opens after the fallback, with no renderer', () => {
    function Gated() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Reveal
          </button>
          <m.p initial={{ opacity: 0 }} animate={{ opacity: open ? 1 : 0 }}>
            Gated
          </m.p>
        </>
      );
    }
    render(
      <MotionFeatures>
        <Gated />
      </MotionFeatures>,
    );
    giveUp();
    expect(screen.getByText('Gated').style.opacity).toBe('0');
    act(() => screen.getByRole('button', { name: 'Reveal' }).click());
    expect(screen.getByText('Gated').style.opacity).toBe('1');
  });

  it('reveals the real PageTitle once the intro loader has lifted', async () => {
    renderWithIntl(
      <MotionFeatures>
        <PageTitle title="ABOUT ME" subtitle="who I am" />
      </MotionFeatures>,
    );
    giveUp();
    const h1 = screen.getByRole('heading', { level: 1, name: 'ABOUT ME' });
    // Held by its reveal gate until the loader lifts, as on the site.
    expect(transparent(h1).length).toBeGreaterThan(0);
    await act(async () => {
      window.__loaderDone = true;
      window.dispatchEvent(new Event('loaderdone'));
    });
    expect(transparent(h1)).toEqual([]);
    expect(h1).toBeVisible();
  });

  it('reveals a real /uses Plate when it enters the viewport', async () => {
    window.IntersectionObserver = SeeingObserver;
    window.__loaderDone = true;
    renderWithIntl(
      <MotionFeatures>
        <Plate slug="bench" ordinal="01" eyebrow="Bench" title="The bench" provenance="Measured">
          <p>Plate body</p>
        </Plate>
      </MotionFeatures>,
    );
    giveUp();
    await act(async () => {});
    const plate = screen.getByRole('heading', { name: 'The bench' }).closest('section');
    expect(transparent(plate)).toEqual([]);
    expect(plate.querySelector('.uses-rule').style.transform).not.toContain('scaleX(0)');
  });

  it('covers content mounted after the fallback, outside an AnimatePresence', () => {
    function Later() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Open
          </button>
          {open && (
            <m.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              Opened
            </m.div>
          )}
        </>
      );
    }
    render(
      <MotionFeatures>
        <Later />
      </MotionFeatures>,
    );
    giveUp();
    act(() => screen.getByRole('button', { name: 'Open' }).click());
    expect(screen.getByText('Opened').style.opacity).toBe('1');
  });

  it('shows a dialog opened later inside a nested AnimatePresence, and removes it at once', () => {
    const error = vi.spyOn(console, 'error');
    function Dialogs() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen((v) => !v)}>
            Toggle
          </button>
          <AnimatePresence>
            {open && (
              <m.div key="dialog" role="dialog" aria-label="Late" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
                Late
              </m.div>
            )}
          </AnimatePresence>
          <AnimatePresence mode="popLayout" initial={false}>
            <m.span key={open ? 'on' : 'off'} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              {open ? 'On' : 'Off'}
            </m.span>
          </AnimatePresence>
        </>
      );
    }
    render(
      <MotionFeatures>
        <Dialogs />
      </MotionFeatures>,
    );
    giveUp();
    const toggle = () => act(() => screen.getByRole('button', { name: 'Toggle' }).click());

    toggle();
    expect(screen.getByRole('dialog', { name: 'Late' }).style.opacity).toBe('1');
    expect(screen.getByText('On').style.opacity).toBe('1');

    toggle();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByText('On')).toBeNull();
    expect(screen.getByText('Off').style.opacity).toBe('1');
    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
  });

  it('opens the real preference centre visibly after the fallback', () => {
    consent.value = {
      status: 'undecided',
      analytics: false,
      decidedAt: null,
      hydrated: true,
      prefsOpen: false,
      triggerRef: { current: null },
      grant: vi.fn(),
      deny: vi.fn(),
      set: vi.fn(),
      reopen: vi.fn(),
      closePrefs: vi.fn(),
    };
    const { rerender } = renderWithIntl(
      <MotionFeatures>
        <PreferenceCentre />
      </MotionFeatures>,
    );
    giveUp();
    consent.value = { ...consent.value, prefsOpen: true };
    rerender(
      <MotionFeatures>
        <PreferenceCentre />
      </MotionFeatures>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Privacy choices' });
    expect(transparent(document.body)).toEqual([]);
    expect(within(dialog).getByRole('switch', { name: 'Allow anonymous analytics' })).toBeVisible();
  });

  it('renders the guestbook wall’s cards when the layout chunk fails', async () => {
    window.IntersectionObserver = SeeingObserver;
    const message = {
      id: 'm1',
      author: { provider: 'github', username: 'ada', name: 'Ada' },
      message: 'Hello from the wall',
      createdAt: '2026-11-01T12:00:00Z',
      reactions: {},
    };
    renderWithIntl(
      <MotionFeatures>
        <LayoutMotionFeatures>
          <ul>
            <AnimatePresence>
              <MessageCard key={message.id} message={message} index={0} staggered now={Date.parse('2026-11-09T00:00:00Z')} />
            </AnimatePresence>
          </ul>
        </LayoutMotionFeatures>
      </MotionFeatures>,
    );
    giveUp();
    await act(async () => {});
    const card = screen.getByText('Hello from the wall').closest('li');
    expect(card.style.opacity).toBe('1');
    // The depth blur is motion values alone, frozen without a renderer: off.
    expect(card.style.filter).toBe('');
  });

  it('applies to the layout provider on its own', () => {
    render(
      <LayoutMotionFeatures>
        <m.div layout initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          Card
        </m.div>
      </LayoutMotionFeatures>,
    );
    giveUp();
    expect(screen.getByText('Card').style.opacity).toBe('1');
  });
});
