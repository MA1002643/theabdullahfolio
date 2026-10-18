/**
 * Names of the tests a Playwright JUnit report records as flaky: failed, then
 * passed on retry. Used by scripts/test-summary.mjs; a module of its own so
 * tests/unit/junitFlaky.test.js can import it without running the summary.
 *
 * Playwright writes each failed attempt of a test that passed in the end as a
 * <flakyFailure> or <flakyError> child of its <testcase> (only with the junit
 * reporter's `includeRetries`, which playwright.config.mjs turns on). Those
 * ELEMENTS are the signal. Matching the word "flaky" anywhere in the testcase
 * body, as this used to, also matched a plain failure whose message or captured
 * log said it (`<failure message="flaky upstream remained unavailable"/>`), and
 * reported a test that never passed as one that passed on retry (code review).
 *
 * CDATA is removed first, so captured stdout that happens to print the tag
 * cannot count either.
 */
export function flakyTestNames(xml) {
  const body = xml.replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '');
  const names = [];
  // A self-closing <testcase …/> has no children, so it cannot be flaky, and
  // must not start a match: the scan would run on into the NEXT testcase and
  // name the wrong test. The scan also stops at the next <testcase.
  for (const [, name, selfClosing, children] of body.matchAll(
    /<testcase\b[^>]*?\bname="([^"]*)"[^>]*?(\/?)>((?:(?!<\/testcase>|<testcase\b)[\s\S])*)/g,
  )) {
    if (!selfClosing && /<flaky(?:Failure|Error)\b/.test(children)) names.push(name);
  }
  return names;
}
