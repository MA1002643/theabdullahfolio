'use client';

// The footer's privacy small print (issue #141): a link to the policy, and the
// control that reopens the choice.
//
// ── Why here and not in the Manifest departures board ───────────────────────
// footer-data.js's `quickLinks` records the site's information architecture, and
// the note on it says plainly that a page missing from the index reads as a page
// that does not exist. That is right for /uses, /notes and /cv — and /privacy is
// a different kind of page. It is small print: the thing you go looking for
// rather than the thing you are invited to explore, and putting it on the
// departures board would promote it above /guestbook while pushing a real
// destination further down a list that is already nine rows long.
//
// So it lives in the meta row, which is where a reader's eye already goes for
// this class of link — beside the copyright, under everything else.
//
// ── Two controls, because they are two different requests ───────────────────
// "Privacy" and "Privacy choices" are not the same affordance and collapsing
// them would fail one of the two visitors:
//
//   • A LINK to the document, for somebody who wants to know what the site does.
//     A real <a> with a real href, so it is crawlable, middle-clickable and
//     copy-linkable.
//   • A BUTTON that reopens the preference centre, for somebody who has already
//     decided and wants to change it. A button rather than a link because it
//     navigates nowhere — it opens a dialog on the page you are standing on,
//     and dressing that as a link would lie to a keyboard user about what Enter
//     is going to do.
//
// #141 requires the decision be revocable from the footer; this is that
// requirement, and the revocation takes effect immediately (see
// ConsentedAnalytics).

import TransitionLink from '@/components/pageTransition/TransitionLink';
import { useConsent } from '@/components/privacy/ConsentProvider';
import { cn } from '@/lib/utils';

import { FlapItem } from './metaRevealMotion';

// Matches the meta row's copyright treatment — uppercase, wide-tracked, tiny —
// so the small print reads as one block rather than as a link cluster bolted
// under it. Deliberately NOT the ember orange the copyright uses: these are
// interactive and the copyright is not, and giving them the same colour would
// make the whole row look clickable.
const LINK_CLASS =
  'rounded-sm uppercase tracking-[0.18em] text-[#8f8f8f] transition-colors hover:text-[#ffaa2a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff6d05] focus-visible:ring-offset-2 focus-visible:ring-offset-night-950';

/**
 * @param {object} props
 * @param {boolean} props.revealMode Whether the parent is running the
 *   Split-Flap Cascade. When it is, each control is wrapped in a `FlapItem` so
 *   it joins the ripple as ONE tick rather than per-glyph — a link split into
 *   per-character spans would still work, but the text is the accessible name
 *   here and SplitFlapText's `sr-only` copy trick does not apply inside an
 *   interactive element. Under reduced motion the parent fades plainly and these
 *   render bare.
 */
export default function FooterPrivacyLinks({ revealMode }) {
  const { reopen } = useConsent();

  const wrap = (node, key) =>
    revealMode ? <FlapItem key={key}>{node}</FlapItem> : node;

  return (
    <span
      className="flex items-center gap-2.5 text-[0.66rem]"
      style={{ lineHeight: 1.6 }}
    >
      {wrap(
        <TransitionLink
          href="/privacy"
          transitionLabel="Privacy"
          className={cn(LINK_CLASS, 'hover-swap')}
        >
          Privacy
        </TransitionLink>,
        'policy',
      )}
      {wrap(
        <span aria-hidden="true" className="text-[#8a8a8a]">
          ·
        </span>,
        'sep',
      )}
      {wrap(
        <button type="button" onClick={reopen} className={LINK_CLASS}>
          Privacy choices
        </button>,
        'choices',
      )}
    </span>
  );
}
