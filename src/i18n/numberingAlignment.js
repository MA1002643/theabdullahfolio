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
// So the server says which numbering system IT used, on
// `<html data-numbering>`, and a browser that would pick a different one is
// told to use the server's instead. Nothing is hard-coded per language: the
// server's CLDR is the reference, whatever version it is. And a browser that
// already agrees (almost all of them) is left completely alone: the wrappers
// below are only installed when this engine's default actually differs.

const PINNABLE = ['NumberFormat', 'DateTimeFormat', 'RelativeTimeFormat'];

function language(tag) {
  try {
    return new Intl.Locale(tag).language;
  } catch {
    return null;
  }
}

/**
 * `locales` with `-u-nu-<numbering>` added when it asks for the page's own
 * language and does not already choose a numbering system. Anything else (no
 * locale, another language, an explicit `nu`, an `options.numberingSystem`)
 * comes back unchanged.
 *
 * @param {string|string[]|undefined} locales As passed to an `Intl` constructor.
 * @param {object|undefined} options As passed to an `Intl` constructor.
 * @param {{lang: string, numbering: string}} page The document's language and the server's numbering system.
 */
export function pinNumbering(locales, options, page) {
  if (!page?.lang || !page?.numbering || options?.numberingSystem) return locales;
  const pageLanguage = language(page.lang);
  const pin = (tag) => {
    if (typeof tag !== 'string' || /-u(-[a-z0-9]{2,8})*-nu-/i.test(tag)) return tag;
    if (language(tag) !== pageLanguage) return tag;
    try {
      return new Intl.Locale(tag, { numberingSystem: page.numbering }).toString();
    } catch {
      return tag;
    }
  };
  return Array.isArray(locales) ? locales.map(pin) : pin(locales);
}

/** The page's language and the server's numbering system, read from `<html>`. */
export function readPage(doc) {
  const root = doc?.documentElement;
  return { lang: root?.getAttribute('lang') || '', numbering: root?.getAttribute('data-numbering') || '' };
}

/** Whether this engine's own default numbering for the page's language differs from the server's. */
export function needsAlignment(page, IntlImpl = Intl) {
  if (!page.lang || !page.numbering) return false;
  try {
    return new IntlImpl.NumberFormat(page.lang).resolvedOptions().numberingSystem !== page.numbering;
  } catch {
    return false;
  }
}

/**
 * Install the alignment on `win` if (and only if) this engine needs it. The
 * page is re-read on every call, so a client-side switch to another locale is
 * followed. Returns true when it installed.
 */
export function installNumberingAlignment(win) {
  const page = () => readPage(win.document);
  if (!needsAlignment(page(), win.Intl)) return false;

  for (const name of PINNABLE) {
    const Original = win.Intl[name];
    if (typeof Original !== 'function') continue;
    win.Intl[name] = new Proxy(Original, {
      construct: (target, [locales, options]) => new target(pinNumbering(locales, options, page()), options),
      apply: (target, thisArg, [locales, options]) => target.call(thisArg, pinNumbering(locales, options, page()), options),
    });
  }

  const wrapMethod = (proto, method) => {
    const original = proto[method];
    if (typeof original !== 'function') return;
    Object.defineProperty(proto, method, {
      configurable: true,
      writable: true,
      value: function toLocale(locales, options) {
        return original.call(this, pinNumbering(locales, options, page()), options);
      },
    });
  };
  wrapMethod(win.Number.prototype, 'toLocaleString');
  for (const method of ['toLocaleString', 'toLocaleDateString', 'toLocaleTimeString']) {
    wrapMethod(win.Date.prototype, method);
  }
  return true;
}
