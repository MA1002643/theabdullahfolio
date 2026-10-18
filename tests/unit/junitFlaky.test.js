import { describe, expect, it } from 'vitest';

import { flakyTestNames } from '../../scripts/junit-flaky.mjs';

// The run summary's "flaky" list (scripts/test-summary.mjs). A test is flaky
// when Playwright recorded a failed attempt as <flakyFailure>/<flakyError> and
// it then passed; the word "flaky" in a failure message is not that (code
// review: a hard failure was reported as "failed, then passed on retry").

const report = (...cases) => `<?xml version="1.0"?>\n<testsuites><testsuite name="s">${cases.join('\n')}</testsuite></testsuites>`;

describe('flakyTestNames', () => {
  it('names a test with a <flakyFailure> or <flakyError> child', () => {
    const xml = report(
      '<testcase name="retried" classname="a"><flakyFailure message="boom" type="Error"/></testcase>',
      '<testcase name="errored once" classname="a"><flakyError message="boom"/></testcase>',
    );
    expect(flakyTestNames(xml)).toEqual(['retried', 'errored once']);
  });

  it('does not name a hard failure whose message says "flaky"', () => {
    const xml = report(
      '<testcase name="hard fail" classname="a"><failure message="flaky upstream remained unavailable" type="Error"/></testcase>',
    );
    expect(flakyTestNames(xml)).toEqual([]);
  });

  it('ignores the tag inside captured output', () => {
    const xml = report(
      '<testcase name="logs it" classname="a"><system-out><![CDATA[saw <flakyFailure> in a fixture]]></system-out></testcase>',
    );
    expect(flakyTestNames(xml)).toEqual([]);
  });

  it('never attributes a flaky child to the self-closing testcase before it', () => {
    const xml = report(
      '<testcase name="clean pass" classname="a" time="1"/>',
      '<testcase name="really flaky" classname="a"><flakyFailure message="x"/></testcase>',
    );
    expect(flakyTestNames(xml)).toEqual(['really flaky']);
  });

  it('finds nothing in a green report', () => {
    expect(flakyTestNames(report('<testcase name="ok" classname="a"></testcase>'))).toEqual([]);
  });
});
