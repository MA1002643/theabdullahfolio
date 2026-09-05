// @vitest-environment jsdom
import { createElement } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TimelineAtlas from '@/components/journey/TimelineAtlas';
import { journeyData } from '@/app/data';

// The atlas's track chips HIGHLIGHT a track: non-matching bars dim, they are
// not disabled (TimelineNode's `dimmed` is the same de-emphasis). A dimmed bar
// therefore stays a jump target for every input. The regression this pins:
// the dimmed class used to carry pointer-events-none, so a mouse or a finger
// could not reach a control the keyboard could still focus and activate — one
// button, two behaviours depending on the input method.

const education = journeyData.find((d) => d.type === 'education');
const career = journeyData.find((d) => d.type === 'career');

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const barFor = (entry) =>
  screen.getByRole('button', {
    name: new RegExp(`^Jump to ${escapeRe(entry.title)}`),
  });

let scrolledOn;
let scrollSpy;

beforeEach(() => {
  // framer's useInView needs an IntersectionObserver; jsdom has none.
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  // jsdom does not implement scrollIntoView — install one that records the
  // element it was called on.
  scrolledOn = null;
  scrollSpy = vi.fn(function record() {
    scrolledOn = this;
  });
  Element.prototype.scrollIntoView = scrollSpy;
});

afterEach(() => {
  // Unmount explicitly: without vitest globals RTL registers no auto-cleanup.
  cleanup();
  vi.unstubAllGlobals();
  delete Element.prototype.scrollIntoView;
  document.body.innerHTML = '';
});

// reduceMotion: the atlas shows without waiting on in-view, and the jump's
// scroll contract becomes `auto` — the deterministic branch to assert on.
function renderAtlas(filter) {
  render(
    createElement(TimelineAtlas, {
      activeYear: career.year,
      filter,
      onFilter: () => {},
      revealed: true,
      reduceMotion: true,
    }),
  );
}

describe('TimelineAtlas — dimmed bars are de-emphasised, not disabled', () => {
  it('the data has both tracks to tell apart', () => {
    expect(education).toBeTruthy();
    expect(career).toBeTruthy();
  });

  it('a dimmed bar keeps pointer events, stays focusable, and still jumps on click', () => {
    // The card the bar jumps to — the page renders it below the atlas.
    const target = document.createElement('div');
    target.id = `jn-${education.id}`;
    target.tabIndex = -1;
    document.body.appendChild(target);

    renderAtlas('career');
    const dimmed = barFor(education);
    const lit = barFor(career);

    // Dimmed is a visual state only…
    expect(dimmed.className).toMatch(/opacity-\[0\.13\]/);
    expect(lit.className).not.toMatch(/opacity-\[0\.13\]/);
    // …never a pointer cut-off: mouse and touch reach what the keyboard can.
    expect(dimmed.className).not.toMatch(/pointer-events-none/);
    expect(dimmed).not.toHaveProperty('disabled', true);
    expect(dimmed.getAttribute('aria-disabled')).toBe(null);

    // Keyboard: a real tab stop.
    dimmed.focus();
    expect(document.activeElement).toBe(dimmed);

    // Pointer: the same jump the lit bars make (Enter on a button is a click
    // in every engine, so one activation path covers both).
    fireEvent.click(dimmed);
    expect(scrollSpy).toHaveBeenCalledTimes(1);
    expect(scrolledOn).toBe(target);
    expect(scrollSpy).toHaveBeenCalledWith({ behavior: 'auto', block: 'center' });
    expect(document.activeElement).toBe(target);
  });

  it('with no track highlighted, nothing is dimmed', () => {
    renderAtlas('all');
    for (const bar of screen.getAllByRole('button', { name: /^Jump to/ })) {
      expect(bar.className).not.toMatch(/opacity-\[0\.13\]|pointer-events-none/);
    }
  });
});
