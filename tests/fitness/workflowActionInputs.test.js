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
// would have been greeted by nothing, and no check would have said so.
//
// The table pins the inputs each listed action declares at the major the
// workflows use, copied from that tag's action.yml. It is hermetic (no fetch at
// test time), so a bump to an action in the table fails here until someone
// reads the new action.yml and updates the row.

const DECLARED_INPUTS = {
  'actions/first-interaction@v3': ['issue_message', 'pr_message', 'repo_token'],
  'actions/labeler@v7': [
    'repo-token',
    'configuration-path',
    'sync-labels',
    'dot',
    'pr-number',
  ],
};

/** Every `uses:` step in a workflow, with the keys of its `with:` block. */
function steps(source) {
  const lines = source.split('\n');
  const out = [];
  lines.forEach((line, i) => {
    const m = line.match(/^(\s*)(?:-\s+)?uses:\s*([^\s#]+)/);
    if (!m) return;
    const stepIndent = m[1].length;
    const keys = [];
    let inWith = false;
    let withIndent = -1;
    for (let j = i + 1; j < lines.length; j++) {
      const next = lines[j];
      if (!next.trim() || next.trim().startsWith('#')) continue;
      const indent = next.match(/^\s*/)[0].length;
      if (indent <= stepIndent && !/^\s*with:/.test(next)) break;
      if (/^\s*-\s/.test(next) && indent <= stepIndent) break;
      if (/^\s*with:\s*$/.test(next)) {
        inWith = true;
        withIndent = indent;
        continue;
      }
      if (inWith) {
        if (indent <= withIndent) break;
        const key = next.match(/^\s*([A-Za-z0-9_-]+):/);
        if (key && indent === withIndent + 2) keys.push(key[1]);
      }
    }
    out.push({ uses: m[2], keys, line: i + 1 });
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
    const firstInteraction = all.find((s) => s.uses.startsWith('actions/first-interaction@'));
    expect(firstInteraction?.keys.length).toBeGreaterThan(0);
  });

  it('pins every major of a listed action that a workflow uses', () => {
    const unpinned = workflows
      .flatMap((w) => w.steps.map((s) => ({ ...s, file: w.file })))
      .filter((s) => {
        const name = s.uses.split('@')[0];
        const listed = Object.keys(DECLARED_INPUTS).some((k) => k.split('@')[0] === name);
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
