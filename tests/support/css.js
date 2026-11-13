/**
 * The DOM's own serialisation of a CSS value.
 *
 * An inline style reads back in CSSOM's canonical form, not as written:
 * since jsdom 31 `inset(0 0% 0 0)` reads `inset(0px 0% 0px 0px)`, a `calc()`
 * nested in `max()` loses its `calc`, and `translate(4px, 0px)` reads
 * `translate(4px)`. A test that pins the authored string breaks on every
 * jsdom that tightens its serialiser (#208), although the rendered value is
 * the same. Compare against `cssValue(prop, authored)` instead: it runs the
 * expected value through the same serialiser as the one under test.
 *
 * Needs a DOM (component tests, or a unit test that renders into jsdom).
 */
export function cssValue(property, value) {
  const probe = document.createElement('div');
  probe.style.setProperty(property, value);
  const out = probe.style.getPropertyValue(property);
  if (!out) throw new Error(`cssValue: the DOM rejected ${property}: ${value}`);
  return out;
}
