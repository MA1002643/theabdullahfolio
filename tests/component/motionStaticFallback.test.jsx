import { act, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { cssValue } from '../support/css.js';
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
const { default: EraRail } = await import('@/components/journey/EraRail');
const { RevealWord } = await import('@/components/about');
const { default: Chapter } = await import('@/components/case-study/chapters/Chapter');
const { default: FactsPlate } = await import('@/components/case-study/FactsPlate');
const { Rise } = await import('@/components/case-study/reveal');
const { default: StatementFill } = await import('@/components/case-study/StatementFill');
const { default: ChapterIndex } = await import('@/components/case-study/ChapterIndex');
const { default: HeroMedia } = await import('@/components/case-study/HeroMedia');
const { default: Notes } = await import('@/components/case-study/chapters/Notes');
const { motionValue } = actual;

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
    expect(screen.getByText('Inherited').style.clipPath).toBe(
      cssValue('clip-path', 'inset(0 0% 0 0)'),
    );
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

  // Motion values in `style` are read once per render and never written in
  // static mode: an effect made only of them has to come from props there.
  it('shows the /about paragraph’s scroll-scrubbed words instead of freezing them at 0', () => {
    const progress = motionValue(0);
    render(
      <MotionFeatures>
        <p>
          {['Architect', 'of', 'Enchantment'].map((word, i) => (
            <RevealWord key={word} index={i} total={3} progress={progress} range={[i / 3, (i + 1) / 3]}>
              {word}
            </RevealWord>
          ))}
        </p>
      </MotionFeatures>,
    );
    // Before giving up, the scrub holds them at 0 until the reader scrolls.
    expect(screen.getByText('Architect').style.opacity).toBe('0');
    giveUp();
    for (const word of ['Architect', 'of', 'Enchantment']) {
      expect(screen.getByText(word).style.opacity).toBe('1');
    }
  });

  it('turns the /journey dial with the elected era, so tabbable years stay on its arc', () => {
    const years = [2026, 2025, 2024, 2023, 2022, 2021];
    const props = { years, visible: true, progress: motionValue(0), height: 1000, anchors: [], reduceMotion: false };
    const ui = (active) => (
      <MotionFeatures>
        <EraRail {...props} active={active} />
      </MotionFeatures>
    );
    const view = renderWithIntl(ui(2026));
    giveUp();
    view.rerender(ui(2022));

    // The interactive face: the rotor carries the elected era's angle.
    const nav = screen.getByRole('navigation');
    const rotor = nav.querySelector('[style*="rotate"]');
    expect(rotor.style.transform).toBe(`rotate(${(2026 - 2022) * 11.5}deg)`);

    // The elected year sits on the needle at full strength, and every label
    // is lit for the CURRENT angle, not the one the dial first rendered at:
    // a tabbable year is one the dial is showing.
    const buttons = within(nav).getAllByRole('button');
    const active = buttons.find((b) => b.getAttribute('aria-current') === 'true');
    const labelOf = (button) => button.parentElement.parentElement;
    expect(labelOf(active).style.opacity).toBe('1');
    const tabbable = buttons.filter((b) => b.tabIndex === 0);
    expect(tabbable.length).toBeGreaterThan(1);
    for (const button of tabbable) {
      const year = years[buttons.indexOf(button)];
      const away = Math.abs(year - 2022) * 11.5;
      const expected = Math.max(0.12, Math.min(1, 1.08 - away / 52));
      expect(Number(labelOf(button).style.opacity)).toBeCloseTo(expected);
    }
    // 2026, where the dial first rendered, is now dim and out of reach.
    expect(buttons[0].tabIndex).toBe(-1);
    expect(Number(labelOf(buttons[0]).style.opacity)).toBeLessThan(0.5);
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

  // ── The /projects/[id] case study (issue #31) ─────────────────────────────
  it('reveals a case-study chapter’s heading and body when it enters the viewport', async () => {
    window.IntersectionObserver = SeeingObserver;
    renderWithIntl(
      <MotionFeatures>
        <Chapter anchor="chapter-overview" title="Overview">
          <Rise as="p" order={1}>
            Chapter body
          </Rise>
        </Chapter>
      </MotionFeatures>,
    );
    giveUp();
    await act(async () => {});
    const section = screen.getByRole('region', { name: 'Overview' });
    expect(transparent(section)).toEqual([]);
    expect(screen.getByText('Chapter body')).toBeVisible();
  });

  it('lands the chapter heading cooled to the title ember when the features never arrive', async () => {
    window.IntersectionObserver = SeeingObserver;
    renderWithIntl(
      <MotionFeatures>
        <Chapter anchor="chapter-walkthrough" title="How a visit works" number="03">
          <Rise as="p" order={1}>
            Body
          </Rise>
        </Chapter>
      </MotionFeatures>,
    );
    giveUp();
    await act(async () => {});
    // By level, not name: jsdom's accname join drops the gap text nodes that
    // real engines keep (the live Chromium tree reads "How a visit works").
    const heading = screen.getByRole('heading', { level: 2 });
    expect(heading.textContent).toBe('How a visit works');
    const words = [...heading.querySelectorAll('.cs-mask__inner')];
    expect(words.map((w) => w.textContent)).toEqual(['How', 'a', 'visit', 'works']);
    for (const word of words) {
      // Risen: never left at the masked translateY(105%) pose.
      expect(word.style.transform).not.toContain('105%');
      // Cooled: the flat accent gradient, whose FIRST stop no molten slice
      // shares (the ramp only reaches #ff6d05 at a bottom stop).
      expect(word.style.backgroundImage).toContain('rgb(255, 109, 5) 0%');
    }
  });

  it('lands the facts plate written, its filaments burnt out, when the features never arrive', async () => {
    window.IntersectionObserver = SeeingObserver;
    renderWithIntl(
      <MotionFeatures>
        <Chapter anchor="chapter-overview" title="Overview">
          <FactsPlate
            label="Project facts"
            facts={[
              { id: 'role', label: 'Role', value: 'Design & engineering' },
              { id: 'timeline', label: 'Timeline', value: 'Jul 2025 – present' },
            ]}
          />
        </Chapter>
      </MotionFeatures>,
    );
    giveUp();
    await act(async () => {});
    const plate = document.querySelector('dl');
    expect(plate.style.opacity).toBe('1');
    // Every mask's inner span risen: never left at translateY(105%).
    const inners = [...plate.querySelectorAll('.cs-mask__inner')];
    expect(inners).toHaveLength(4);
    for (const inner of inners) expect(inner.style.transform).not.toContain('105%');
    expect(screen.getByText('Design & engineering')).toBeVisible();
    // The filaments at their end state: drawn (scaleX 1 renders as `none`)
    // and burnt out to the transparent end colour, never frozen hot.
    for (const filament of plate.querySelectorAll('.cs-facts__filament')) {
      expect(filament.style.transform).toBe('none');
      expect(filament.style.backgroundColor).toBe('rgba(255, 170, 42, 0)');
    }
  });

  it('paints the problem statement at full colour instead of freezing it muted', () => {
    render(
      <MotionFeatures>
        <StatementFill text="Most portfolios are brochures." />
      </MotionFeatures>,
    );
    giveUp();
    const words = [...document.querySelectorAll('.cs-statement span[style]')];
    expect(words.length).toBeGreaterThan(0);
    // #f4f4f4, never the #8a8a8a a frozen scroll value would hold.
    for (const w of words) expect(w.style.color).toBe('rgb(244, 244, 244)');
  });

  it('lands the craft notes readable, their rules drawn, when the features never arrive', async () => {
    window.IntersectionObserver = SeeingObserver;
    renderWithIntl(
      <MotionFeatures>
        <Notes
          anchor="chapter-notes"
          title="Craft notes"
          number="06"
          counters={['01', '02']}
          readLabel="Read the note"
          items={[
            {
              id: 'lazy-motion',
              title: 'Motion that is allowed to arrive late',
              body: 'The animation engine left every first load.',
              href: '/notes/discoverability',
            },
            {
              id: 'testing',
              title: 'A test plan that is published',
              body: 'Ten layers, written down.',
              href: '/notes/testing',
            },
          ]}
        />
      </MotionFeatures>,
    );
    giveUp();
    // The static remount resets each card's entered latch; SeeingObserver
    // reports in a microtask, so flush before reading the poses.
    await act(async () => {});
    // By class, not accessible name: jsdom's accname join drops the gap text
    // nodes between the heading's word masks (see the chapter-heading case).
    const section = document.querySelector('.cs-notes');
    // No card, numeral, title, body or link may stay at the entrance's
    // opacity-0 pose (the decorative drift is off in static mode).
    expect(transparent(section)).toEqual([]);
    expect(
      screen.getByRole('heading', { level: 3, name: 'Motion that is allowed to arrive late' }),
    ).toBeVisible();
    // The drawn hairlines at their end state (scaleX 1 renders as `none`),
    // never frozen at the scaleX(0) server pose.
    const rules = [...section.querySelectorAll('.cs-notes__rule')];
    expect(rules).toHaveLength(2);
    for (const rule of rules) expect(rule.style.transform).toBe('none');
    // The animated link still names its note for assistive tech (WCAG 2.5.3
    // wiring survives m.create).
    const links = screen.getAllByRole('link', { name: 'Read the note' });
    expect(links[0]).toHaveAttribute('aria-describedby', 'chapter-notes-lazy-motion');
  });

  it('reveals the chapter rail’s rows after the fallback instead of freezing them hidden', async () => {
    window.IntersectionObserver = SeeingObserver;
    const chapters = [
      { type: 'overview', anchor: 'chapter-overview', title: 'Overview' },
      { type: 'stack', anchor: 'chapter-stack', title: 'Built with' },
    ];
    renderWithIntl(
      <MotionFeatures>
        <ChapterIndex
          chapters={chapters}
          labels={{ nav: 'Chapters', close: 'Close', positions: ['Chapter 1 of 2', 'Chapter 2 of 2'] }}
        />
      </MotionFeatures>,
    );
    // The rail's entered latch fires (SeeingObserver), but with no features
    // the rows hold their risen-from server pose until the loader gives up.
    await act(async () => {});
    giveUp();
    // The static remount resets the latch; its observer reports in a
    // microtask, so flush once more before reading the poses.
    await act(async () => {});
    const nav = screen.getByRole('navigation', { name: 'Chapters' });
    // Static mode renders every row and the indicator at the shown target:
    // nothing in the rail may stay at the entrance's opacity-0 pose.
    expect(transparent(nav)).toEqual([]);
  });

  it('opens the case study’s chapter sheet visibly after the fallback', () => {
    const chapters = [
      { type: 'overview', anchor: 'chapter-overview', title: 'Overview' },
      { type: 'stack', anchor: 'chapter-stack', title: 'Built with' },
    ];
    renderWithIntl(
      <MotionFeatures>
        <ChapterIndex
          chapters={chapters}
          labels={{ nav: 'Chapters', close: 'Close', positions: ['Chapter 1 of 2', 'Chapter 2 of 2'] }}
        />
      </MotionFeatures>,
    );
    giveUp();
    act(() => screen.getByRole('button', { name: /Chapter 1 of 2/ }).click());
    const dialog = screen.getByRole('dialog', { name: 'Chapters' });
    expect(dialog.style.transform).not.toContain('100%');
    expect(transparent(dialog.parentElement)).toEqual([]);
  });

  it('settles the hero media into its framed card rather than freezing a scroll value', () => {
    // The page's geometry: a 1384px full-bleed frame, a 1200px column probe,
    // an 860px media box (jsdom measures 0 without this).
    const widthSpy = vi
      .spyOn(Element.prototype, 'clientWidth', 'get')
      .mockImplementation(function clientWidth() {
        if (this.classList.contains('cs-hero__probe')) return 1200;
        if (this.classList.contains('cs-bleed')) return 1384;
        return 0;
      });
    const heightSpy = vi
      .spyOn(HTMLElement.prototype, 'offsetHeight', 'get')
      .mockImplementation(function offsetHeight() {
        return this.classList.contains('cs-hero-media') ? 860 : 0;
      });
    try {
      const { container } = render(
        <MotionFeatures>
          <HeroMedia src="/projects/theabdullahfolio/hero.webp" alt="The home page" width={1600} height={1000} />
        </MotionFeatures>,
      );
      giveUp();
      // M2's still contract: static mode renders the framed END state as
      // plain values — scaled into the column, page pulled up by the gap —
      // never a scroll-linked value frozen at its first reading.
      const box = container.querySelector('.cs-hero-media');
      const target = 1200 / 1384;
      expect(parseFloat(box.style.transform.replace('scale(', ''))).toBeCloseTo(target, 4);
      expect(parseFloat(box.style.marginBottom)).toBeCloseTo(-((1 - target) * 860), 1);
    } finally {
      widthSpy.mockRestore();
      heightSpy.mockRestore();
    }
  });
});
