import { createTranslator } from 'next-intl';
import { describe, expect, it } from 'vitest';

import { projectsData } from '@/app/data';
import { dataTranslator } from '@/i18n/data';
import {
  localizedProjectMetaDescription,
  projectMetaDescription,
} from '@/lib/seo/projectMeta';
import ProjectDetail from '../../messages/en/ProjectDetail.json';
import Data from '../../messages/en/Data.json';

// The /projects/[id] meta description per locale (issue #82). English must be
// the composed sentence metadataContract.test.js already pins, untouched; a
// non-English locale composes the same facts through ONE template, so these
// cases run the real English template under a foreign locale (the pipeline
// supplies the foreign wording later) and assert the parts that are the
// code's job: the month comes from Intl, the visibility select resolves, and
// the English-only grammar fixes are not applied.

const translators = (locale) => ({
  locale,
  t: createTranslator({ locale, messages: { ProjectDetail }, namespace: 'ProjectDetail' }),
  dataT: dataTranslator(createTranslator({ locale, messages: { Data }, namespace: 'Data' }), locale),
});

describe('localizedProjectMetaDescription', () => {
  it('returns the English sentence byte for byte in English', () => {
    for (const project of projectsData) {
      expect(localizedProjectMetaDescription(project, translators('en'))).toBe(
        projectMetaDescription(project),
      );
    }
  });

  it('formats the start month with Intl in the target locale', () => {
    const project = projectsData.find((p) => p.date);
    const [year, month] = project.date.split('-').map(Number);
    const when = new Intl.DateTimeFormat('fr', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
      new Date(Date.UTC(year, month - 1, 1)),
    );
    const out = localizedProjectMetaDescription(project, translators('fr'));
    expect(out.startsWith(`${project.name} — `)).toBe(true);
    expect(out).toContain(when);
  });

  it('resolves visibility through the ICU select', () => {
    const base = projectsData[0];
    expect(localizedProjectMetaDescription({ ...base, private: true }, translators('de'))).toContain(
      'Private repository',
    );
    expect(localizedProjectMetaDescription({ ...base, private: false }, translators('de'))).toContain(
      'Public repository',
    );
  });

  it('uses the undated template when the record has no date', () => {
    const out = localizedProjectMetaDescription({ ...projectsData[0], date: undefined }, translators('es'));
    expect(out).not.toContain('started');
  });
});
