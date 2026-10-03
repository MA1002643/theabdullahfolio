import { describe, expect, it } from 'vitest';

import { makeScrollersFocusable, renderNote } from '@/lib/notes/readNotes';

// Code blocks and tables in a published note are keyboard-reachable (issue #92;
// axe scrollable-region-focusable on /notes/discoverability at 390px).

describe('makeScrollersFocusable', () => {
  it('makes every rendered <pre> and <table> a Tab stop', () => {
    const html = renderNote('# T\n\n```\nnpm run test:all\n```\n\n| a | b |\n|---|---|\n| 1 | 2 |\n');
    expect(html).toContain('<pre tabindex="0">');
    expect(html).toContain('<table tabindex="0">');
  });

  it('never touches a tag that is document CONTENT (marked escapes it)', () => {
    const html = renderNote('# T\n\nWrite `<pre>` or <code>&lt;table&gt;</code> in prose.\n');
    expect(html).not.toContain('tabindex');
  });
});
