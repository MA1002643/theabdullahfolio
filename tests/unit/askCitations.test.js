import { describe, expect, it } from 'vitest';
import { createCitationParser, MAX_MARKER } from '@/lib/ask/citations';

// The streaming citation parser's length cutoff (issue #41). A marker longer
// than MAX_MARKER is plain text however the stream is cut. Before the fix the
// cutoff applied only to a marker still waiting for its "]]": the same
// "[[P2" + 50 spaces + "]]" became a citation when it arrived in one delta
// and literal text when the closing brackets came separately.

const isCitable = (id) => id === 'P2';

function run(chunks) {
  const parser = createCitationParser(isCitable);
  const events = [...chunks.flatMap((c) => parser.push(c)), ...parser.end()];
  const merged = [];
  for (const e of events) {
    const last = merged[merged.length - 1];
    if (e.type === 'text' && last?.type === 'text') last.text += e.text;
    else merged.push({ ...e });
  }
  return merged;
}

describe('citation parser — MAX_MARKER cutoff', () => {
  const long = `[[P2${' '.repeat(50)}]]`;

  it('renders an over-long marker as text when delivered whole', () => {
    expect(long.length).toBeGreaterThan(MAX_MARKER);
    expect(run([long])).toEqual([{ type: 'text', text: long }]);
  });

  it('renders the same over-long marker as text when "]]" arrives separately', () => {
    expect(run([long.slice(0, -2), ']]'])).toEqual([{ type: 'text', text: long }]);
    expect(run([long.slice(0, -1), ']'])).toEqual([{ type: 'text', text: long }]);
  });

  it('still cites a padded marker exactly at the cutoff, whole or split', () => {
    const edge = `[[P2${' '.repeat(MAX_MARKER - 6)}]]`;
    expect(edge.length).toBe(MAX_MARKER);
    expect(run([edge])).toEqual([{ type: 'cite', id: 'P2' }]);
    expect(run([edge.slice(0, -2), ']]'])).toEqual([{ type: 'cite', id: 'P2' }]);
    expect(run([edge.slice(0, -1), ']'])).toEqual([{ type: 'cite', id: 'P2' }]);
  });

  it('finds a short marker that starts inside an over-long span', () => {
    const s = `[[${' '.repeat(50)}[[P2]]`;
    const expected = [{ type: 'text', text: `[[${' '.repeat(50)}` }, { type: 'cite', id: 'P2' }];
    expect(run([s])).toEqual(expected);
    expect(run([...s])).toEqual(expected);
  });
});
