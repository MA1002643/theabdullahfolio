import { usesData } from '@/app/data';

// The UsesTools descriptions /uses hands the client up front (issue #82): the
// curated tiles, which are what the stack plate server-renders. The rest
// arrives with the live crawl (components/uses/useToolCopy.jsx) — all ~100 at
// once put the route over the 8 kB message budget. Shared by the page and
// tests/fitness/i18nBudget.test.js, so the budget is measured on what ships.
export const CURATED_TOOL_COPY = Object.values(usesData.stack)
  .flat()
  .map((tool) => `UsesTools.tools.${tool.slug}`);
