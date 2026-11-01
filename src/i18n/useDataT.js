import { useMemo } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { dataTranslator } from './data';

/**
 * Client/shared hook: the `Data` translator bound to the active locale, ready
 * for `localizeProject`, `localizeJourneyEntry` and friends in ./data.js.
 */
export function useDataT() {
  const t = useTranslations('Data');
  const locale = useLocale();
  return useMemo(() => dataTranslator(t, locale), [t, locale]);
}
