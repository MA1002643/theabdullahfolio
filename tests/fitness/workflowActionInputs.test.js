import { describe, expect, it } from 'vitest';

import { read, walk } from '../support/source.js';

// A workflow that passes an input the action does not declare is not an error.
// GitHub logs "Unexpected input" as a warning, runs the step anyway, and the
// step quietly does less than it says.
//
// That was Dependabot PR #181 (actions/first-interaction v1 → v3). v3 renamed
// every input from kebab-case to snake_case (`issue-message` → `issue_message`),
// and the bump changed only the version. The job still went green, because an
// action with no message has nothing to post. Every first-time contributor
// would have been greeted by nothing, and no check would have said so. (The
// step has since replaced that action with its own `gh` call: v3 also greeted
// every Dependabot PR as a first contribution.)
//
// The table pins the inputs each listed action declares at the major the
// workflows use, copied from that tag's action.yml. It is hermetic (no fetch at
// test time), so a bump to an action in the table fails here until someone
// reads the new action.yml and updates the row.

const DECLARED_INPUTS = {
  'actions/labeler@v7': [
    'repo-token',
    'configuration-path',
    'sync-labels',
    'dot',
    'pr-number',
  ],
};

/**
 * Every `uses:` step in a workflow, with the keys of its `with:` block.
 * A step's own keys (`name`, `id`, `if`, `uses`, `with`) share one indent,
 * in any order. The step ends at the first line indented less than that,
 * which is also where the next `- ` item begins.
 */
function steps(source) {
  const lines = source.split('\n');
  const out = [];
  lines.forEach((line, i) => {
    const m = line.match(/^(\s*)(-\s+)?uses:\s*([^\s#]+)/);
    if (!m) return;
    const keyIndent = m[1].length + (m[2] ? m[2].length : 0);
    // Walk back to the step's start too: `with:` may come before `uses:`.
    let start = i;
    if (!m[2]) {
      while (start > 0) {
        const prev = lines[start - 1];
        if (!prev.trim() || prev.trim().startsWith('#')) {
          start -= 1;
          continue;
        }
        const indent = prev.match(/^\s*/)[0].length;
        if (/^\s*-\s/.test(prev) && indent + 2 === keyIndent) {
          start -= 1;
          break;
        }
        if (indent < keyIndent) break;
        start -= 1;
      }
    }
    const keys = [];
    let inWith = false;
    for (let j = start; j < lines.length; j++) {
      if (j === i) {
        inWith = false;
        continue;
      }
      const next = lines[j];
      if (!next.trim() || next.trim().startsWith('#')) continue;
      const dash = next.match(/^(\s*)-\s+/);
      const indent =
        dash && j === start ? dash[1].length + 2 : next.match(/^\s*/)[0].length;
      if (j > start && indent < keyIndent) break;
      if (indent === keyIndent) {
        inWith = /^\s*(?:-\s+)?with:\s*$/.test(next);
        continue;
      }
      if (inWith && indent === keyIndent + 2) {
        const key = next.match(/^\s*([A-Za-z0-9_-]+):/);
        if (key) keys.push(key[1]);
      }
    }
    out.push({ uses: m[3], keys, line: i + 1 });
  });
  return out;
}

const workflows = walk('.github/workflows', /\.ya?ml$/).map((file) => ({
  file,
  steps: steps(read(file)),
}));

describe('workflow steps pass only the inputs their action declares', () => {
  it('finds the steps it is judging (the parse is not blind)', () => {
    const all = workflows.flatMap((w) => w.steps);
    const labeler = all.find((s) => s.uses.startsWith('actions/labeler@'));
    expect(labeler?.keys).toEqual(
      expect.arrayContaining(['repo-token', 'configuration-path']),
    );
  });

  it('reads a with: block past sibling keys, in either order (code review)', () => {
    // `if:` or `id:` between `uses:` and `with:` used to end the step early,
    // so its inputs went unchecked.
    const yaml = [
      'steps:',
      '  - name: a',
      '    uses: actions/labeler@v7',
      '    if: always()',
      '    id: label',
      '    with:',
      '      sync_labels: true',
      '  - with:',
      '      bogus: 1',
      '    uses: actions/labeler@v7',
      '  - run: echo',
      '    with:',
      '      not-this-step: 1',
    ].join('\n');
    expect(steps(yaml)).toEqual([
      { uses: 'actions/labeler@v7', keys: ['sync_labels'], line: 3 },
      { uses: 'actions/labeler@v7', keys: ['bogus'], line: 10 },
    ]);
  });

  it('pins every major of a listed action that a workflow uses', () => {
    const unpinned = workflows
      .flatMap((w) => w.steps.map((s) => ({ ...s, file: w.file })))
      .filter((s) => {
        const name = s.uses.split('@')[0];
        const listed = Object.keys(DECLARED_INPUTS).some(
          (k) => k.split('@')[0] === name,
        );
        return listed && !DECLARED_INPUTS[s.uses];
      })
      .map((s) => `${s.file}:${s.line} ${s.uses}`);
    expect(
      unpinned,
      'This action moved to a major the table does not know. Read its action.yml at that tag and update DECLARED_INPUTS.',
    ).toEqual([]);
  });

  it('never passes an undeclared input', () => {
    const unknown = workflows.flatMap((w) =>
      w.steps
        .filter((s) => DECLARED_INPUTS[s.uses])
        .flatMap((s) =>
          s.keys
            .filter((k) => !DECLARED_INPUTS[s.uses].includes(k))
            .map((k) => `${w.file}:${s.line} ${s.uses} → ${k}`),
        ),
    );
    expect(unknown).toEqual([]);
  });
});
