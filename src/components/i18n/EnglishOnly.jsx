import { getLocale, getTranslations } from 'next-intl/server';
import { DEFAULT_LOCALE } from '@/i18n/locales';

/**
 * An English-only island inside a translated page (issue #82): the engineering
 * notes and the privacy policy body.
 *
 * `lang="en" dir="ltr"` on the wrapper is the accessibility half — without it
 * an Arabic screen-reader voice reads English prose with Arabic phonetics, and
 * an RTL document would right-align a left-to-right text. The notice above it
 * is the honesty half: a visitor who chose Japanese is told, in Japanese, why
 * this part is not, rather than wondering whether the translation broke.
 *
 * Server Component, so the notice costs no client JavaScript. In English it
 * renders the bare wrapper and nothing else.
 */
export default async function EnglishOnly({ children, className = '', as: Tag = 'div' }) {
  const locale = await getLocale();
  if (locale === DEFAULT_LOCALE) {
    return <Tag className={className}>{children}</Tag>;
  }
  const t = await getTranslations('Locale');
  return (
    <>
      <p
        role="note"
        className="mx-auto mb-6 w-full max-w-3xl rounded-lg border border-[#ffcd5b33] bg-black/30 px-4 py-3 text-sm leading-relaxed text-[#d4d4d4]"
      >
        <span className="font-mono text-xs uppercase tracking-[0.14em] text-[#ffaa2a]">
          {t('englishOnly.label')}
        </span>{' '}
        · {t('englishOnly.body')}
      </p>
      <Tag lang="en" dir="ltr" className={className}>
        {children}
      </Tag>
    </>
  );
}
