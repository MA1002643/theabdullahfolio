import { getTranslations } from 'next-intl/server';
import { dataTranslator } from './data';

/** Server Component counterpart of `useDataT`. */
export async function getDataT(locale) {
  const t = await getTranslations({ locale, namespace: 'Data' });
  return dataTranslator(t, locale);
}
