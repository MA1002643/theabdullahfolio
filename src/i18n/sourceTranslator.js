import { createTranslator } from 'next-intl';
import About from '../../messages/en/About.json';

// English translators for PURE modules (issue #82).
//
// A few utilities build user-facing sentences without being React components
// — the /about "what changed" diffs are the case in point. They take a `t` so a
// component can hand in the reader's translator, and default to the English
// one here, so a caller that predates #82 (or a unit test) still gets exactly
// the English it always got, rendered from the same catalogue every other
// language is translated from.
export const englishAbout = createTranslator({
  locale: 'en',
  messages: { About },
  namespace: 'About',
});
