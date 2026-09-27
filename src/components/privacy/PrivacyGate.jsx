'use client';

// One mount point for the consent UI (issue #141), so the root layout gains a
// single line rather than three and the ordering below cannot be got wrong
// somewhere else.
//
// The two components render in this order deliberately: the notice is `z-[60]`
// and the preference centre `z-[70]`, so the dialog draws over the notice that
// can open it. Source order does not decide that — the z-indices do — but
// keeping the two together means anyone changing one can see the other.
//
// Both render null in the common case (a returning visitor with a stored
// decision and no dialog open), so this costs an empty `<span>` live region and
// nothing else on the overwhelming majority of page views.

import PreferenceCentre from './PreferenceCentre';
import PrivacyNotice from './PrivacyNotice';

export default function PrivacyGate() {
  return (
    <>
      <PrivacyNotice />
      <PreferenceCentre />
    </>
  );
}
