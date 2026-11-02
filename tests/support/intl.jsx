import { render } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';

// Real catalogues for component tests (issue #82). Components read their copy
// through `useTranslations`, so a test renders them inside a REAL provider with
// the REAL messages — never a mock translator — and asserts on the English the
// visitor actually sees. A test that wants another locale (an RTL case, a
// plural rule) passes `locale` and gets that catalogue with English filling
// any gap, exactly as `src/i18n/messages.js` does at runtime.

const catalogue = (locale) => {
  const files = import.meta.glob('../../messages/*/*.json', { eager: true, import: 'default' });
  const out = {};
  for (const [path, json] of Object.entries(files)) {
    const [, lang, ns] = path.match(/messages\/([^/]+)\/([^/]+)\.json$/);
    if (lang === locale) out[ns] = json;
  }
  return out;
};

const deepMerge = (base, over) => {
  if (!over || typeof over !== 'object') return base;
  const out = { ...base };
  for (const [k, v] of Object.entries(over)) {
    out[k] = v && typeof v === 'object' && !Array.isArray(v) && base?.[k] ? deepMerge(base[k], v) : v;
  }
  return out;
};

export function messagesFor(locale = 'en') {
  const en = catalogue('en');
  return locale === 'en' ? en : deepMerge(en, catalogue(locale));
}

export function IntlWrapper({ children, locale = 'en' }) {
  return (
    <NextIntlClientProvider locale={locale} messages={messagesFor(locale)} timeZone="Europe/London">
      {children}
    </NextIntlClientProvider>
  );
}

/** `render`, inside the real English (or `locale`) catalogue. */
export function renderWithIntl(ui, { locale = 'en', ...options } = {}) {
  return render(ui, {
    wrapper: ({ children }) => <IntlWrapper locale={locale}>{children}</IntlWrapper>,
    ...options,
  });
}
