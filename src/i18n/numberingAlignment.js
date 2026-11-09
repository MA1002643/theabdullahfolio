// Keep the browser's digits in step with the server's (issue #198).
//
// Which digits a language uses by default is CLDR data, and CLDR changes. Arabic
// is the live case: current CLDR gives plain `ar` Western digits ("11"), while
// older ICU builds still give Arabic-Indic ("١١"). The server formats with
// Node's bundled ICU, and most browsers ship a current one too (Chromium,
// Firefox, Apple's WebKit). Linux WebKit, though (GNOME Web and every other
// WebKitGTK/WPE browser, and Playwright's Linux WebKit), uses the operating
// system's ICU, which can be years older. There, every number on an `/ar` page
// hydrated differently from the HTML it arrived in. React threw #418 and
// re-rendered the whole tree on the client.
//
// `intlTag()` cannot fix this alone, because the catalogue formats its own
// numbers: `{count, number}` and plural `#` go through next-intl with the plain
// route locale, and next-intl exposes no hook for formatter options.
//
// So the server writes down which numbering system IT uses for EVERY site
// language, on `<html data-numbering="ar:latn de:latn …">`, and a browser that
// would pick a different one for any of them is told to use the server's
// instead. Nothing is hard-coded per language: the server's CLDR is the
// reference, whatever version it is. And a browser that already agrees on every
// language (almost all of them) is left completely alone: the wrappers below
// are only installed when this engine's default actually differs somewhere.
//
// Every language, not just the page's: the decision is taken ONCE, before
// hydration (src/instrumentation-client.js), and a language switch is a soft
// navigation (useLocaleSwitch) that never runs it again. The new locale's
// formatters are also created during the render, BEFORE React commits the new
// `<html lang>`, so nothing read from the document at that moment can be
// trusted to name the new locale. With the whole table known up front, a
// pinned tag depends only on the tag itself: the page's state is never read.

const PINNABLE = ['NumberFormat', 'DateTimeFormat', 'RelativeTimeFormat'];

function language(tag) {
  try {
    return new Intl.Locale(tag).language;
  } catch {
    return null;
  }
}

/**
 * The server's side of the table: `lang:numbering` for each tag, by language,
 * space-separated, for `<html data-numbering>`.
 *
 * @param {string[]} tags The site's locale tags.
 */
export function serverNumbering(tags, IntlImpl = Intl) {
  const pairs = new Map();
  for (const tag of tags) {
    const lang = language(tag);
    if (!lang || pairs.has(lang)) continue;
    pairs.set(lang, new IntlImpl.NumberFormat(tag).resolvedOptions().numberingSystem);
  }
  return [...pairs].map(([lang, nu]) => `${lang}:${nu}`).join(' ');
}

/** `<html data-numbering>` back into a language → numbering map. Malformed pairs are dropped. */
export function parseNumbering(attr) {
  const table = new Map();
  for (const pair of (attr || '').split(/\s+/)) {
    const [lang, nu] = pair.split(':');
    if (/^[a-z]{2,8}$/i.test(lang || '') && /^[a-z0-9]{3,8}$/i.test(nu || '')) table.set(lang.toLowerCase(), nu);
  }
  return table;
}

/**
 * The languages where this engine's own default numbering differs from the
 * server's: only these are ever pinned. Empty on an engine that agrees.
 */
export function disagreements(table, IntlImpl = Intl) {
  const out = new Map();
  for (const [lang, nu] of table) {
    try {
      if (new IntlImpl.NumberFormat(lang).resolvedOptions().numberingSystem !== nu) out.set(lang, nu);
    } catch {
      // A language this engine cannot format at all has nothing to align.
    }
  }
  return out;
}

/**
 * `locales` with `-u-nu-<numbering>` added to each tag whose language is in
 * `pins` and that does not already choose a numbering system. Anything else (no
 * locale, another language, an explicit `nu`, an `options.numberingSystem`)
 * comes back unchanged.
 *
 * @param {string|string[]|undefined} locales As passed to an `Intl` constructor.
 * @param {object|undefined} options As passed to an `Intl` constructor.
 * @param {Map<string, string>} pins Language → the server's numbering system.
 */
export function pinNumbering(locales, options, pins) {
  if (!pins?.size || options?.numberingSystem) return locales;
  const pin = (tag) => {
    if (typeof tag !== 'string' || /-u(-[a-z0-9]{2,8})*-nu-/i.test(tag)) return tag;
    const nu = pins.get(language(tag));
    if (!nu) return tag;
    try {
      return new Intl.Locale(tag, { numberingSystem: nu }).toString();
    } catch {
      return tag;
    }
  };
  return Array.isArray(locales) ? locales.map(pin) : pin(locales);
}

/**
 * Install the alignment on `win` if (and only if) this engine disagrees with
 * the server on some site language. Returns true when it installed.
 */
export function installNumberingAlignment(win) {
  const table = parseNumbering(win.document?.documentElement?.getAttribute('data-numbering'));
  const pins = disagreements(table, win.Intl);
  if (!pins.size) return false;

  for (const name of PINNABLE) {
    const Original = win.Intl[name];
    if (typeof Original !== 'function') continue;
    win.Intl[name] = new Proxy(Original, {
      construct: (target, [locales, options]) => new target(pinNumbering(locales, options, pins), options),
      apply: (target, thisArg, [locales, options]) => target.call(thisArg, pinNumbering(locales, options, pins), options),
    });
  }

  const wrapMethod = (proto, method) => {
    const original = proto[method];
    if (typeof original !== 'function') return;
    Object.defineProperty(proto, method, {
      configurable: true,
      writable: true,
      value: function toLocale(locales, options) {
        return original.call(this, pinNumbering(locales, options, pins), options);
      },
    });
  };
  wrapMethod(win.Number.prototype, 'toLocaleString');
  for (const method of ['toLocaleString', 'toLocaleDateString', 'toLocaleTimeString']) {
    wrapMethod(win.Date.prototype, method);
  }
  return true;
}
