import { DEFAULT_LOCALE } from './locales';
import { NAMESPACES } from './namespaces';

// Catalogue loader. Server-only in practice: it is called from the request
// config and from IntlScope, both of which run on the server, so the dynamic
// import below is resolved into the server bundle and never shipped.

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * `override` laid over `base`, recursively. Used to fall back to English for
 * any key a catalogue does not have yet: a key missing from `messages/ja/`
 * renders the English string rather than a raw `About.title` placeholder.
 * `npm run i18n:audit` reports every such key, so the fallback is a safety
 * net, never the plan.
 */
export function deepMerge(base, override) {
  if (!isObject(override)) return base;
  const out = { ...base };
  for (const [key, value] of Object.entries(override)) {
    out[key] = isObject(value) && isObject(base?.[key]) ? deepMerge(base[key], value) : value;
  }
  return out;
}

async function loadNamespace(locale, ns) {
  try {
    return (await import(`../../messages/${locale}/${ns}.json`)).default;
  } catch {
    return null;
  }
}

const cache = new Map();

/** Every namespace for a locale, with English filling any gap. */
export async function loadMessages(locale) {
  if (cache.has(locale)) return cache.get(locale);
  const promise = (async () => {
    const entries = await Promise.all(
      NAMESPACES.map(async (ns) => {
        const source = (await loadNamespace(DEFAULT_LOCALE, ns)) ?? {};
        if (locale === DEFAULT_LOCALE) return [ns, source];
        return [ns, deepMerge(source, await loadNamespace(locale, ns))];
      }),
    );
    return Object.fromEntries(entries);
  })();
  cache.set(locale, promise);
  return promise;
}

/**
 * The subset of a catalogue a client provider should receive. Each path is a
 * namespace (`'Uses'`) or a dotted subtree of one (`'Data.journey'`), so a
 * route that renders one slice of a shared namespace ships only that slice
 * (the 8 kB budget). Objects on the way down are COPIED before anything is
 * written into them: `messages` is the loader's cached catalogue, shared by
 * every page of the build, and a picked subtree must never leak into it.
 */
export function pickMessages(messages, paths) {
  const out = {};
  for (const path of paths) {
    const keys = path.split('.');
    const value = keys.reduce((node, key) => node?.[key], messages);
    if (value === undefined) continue;
    let target = out;
    for (const key of keys.slice(0, -1)) {
      target[key] = isObject(target[key]) ? { ...target[key] } : {};
      target = target[key];
    }
    const leaf = keys[keys.length - 1];
    target[leaf] = isObject(value) && isObject(target[leaf])
      ? deepMerge(target[leaf], value)
      : value;
  }
  return out;
}
