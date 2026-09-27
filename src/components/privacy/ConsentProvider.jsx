'use client';

// Consent state for the whole app (issue #141).
//
// ── The three rules this component exists to keep ───────────────────────────
//
// 1. IT RENDERS THE SAME THING ON THE SERVER AND ON THE FIRST CLIENT PAINT.
//    The decision lives in `localStorage`, which does not exist during the
//    server render, so reading it during render is a hydration mismatch waiting
//    for its first returning visitor — and it would be an INVISIBLE one in
//    development, because a developer with no stored record renders `undecided`
//    on both sides and sees nothing wrong. The site already carries one known
//    reduced-motion mismatch class on the sub-pages; #141's acceptance criteria
//    say not to add another. So: state starts `undecided`, an effect reads
//    storage, and `hydrated` says whether that has happened yet.
//
// 2. NOTHING DOWNSTREAM CAN SEE A GRANT BEFORE IT IS REAL. Consumers get
//    `analytics: false` until the effect has run, so the analytics boundary
//    cannot mount a script during the pre-hydration window on the strength of a
//    default. `hydrated` is exposed separately for the UI that needs to know the
//    difference between "no decision" and "not read yet" — the notice must not
//    flash in for the visitor who decided months ago.
//
// 3. A DECISION IS THE SAME IN EVERY TAB. Two tabs open, decline in one: the
//    other must stop too. `localStorage` fires a `storage` event in the other
//    tabs of the origin, so honouring it is nearly free, and NOT honouring it
//    means the site keeps measuring somebody who has just refused — in a tab
//    they can see. That is the kind of detail nobody tests and everybody would
//    consider a bug if they noticed it.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { CONSENT_KEY } from '@/lib/privacy/inventory';
import {
  STATUS,
  parseConsent,
  readConsent,
  writeConsent,
} from '@/lib/privacy/consentStore';

const ConsentContext = createContext(null);

/**
 * Consent state and the four things you can do to it.
 *
 * @returns {{
 *   status: string,          // 'undecided' | 'granted' | 'denied'
 *   analytics: boolean,      // false until hydrated, always
 *   decidedAt: string|null,
 *   hydrated: boolean,
 *   grantEpoch: number,      // increments on each move INTO granted; see ConsentedAnalytics
 *   prefsOpen: boolean,
 *   triggerRef: React.RefObject<Element|null>, // what to hand focus back to
 *   grant: () => void,
 *   deny: () => void,
 *   set: (allow: boolean) => void,
 *   reopen: () => void,
 *   closePrefs: () => void,
 * }}
 */
export function useConsent() {
  const value = useContext(ConsentContext);
  if (value === null) {
    // A hard throw rather than a permissive default. The plausible default here
    // is `analytics: false`, which fails SAFE and fails SILENTLY — a consumer
    // accidentally rendered outside the provider would quietly never measure
    // anything and never say why. Given the provider sits in the root layout,
    // being outside it is a wiring mistake, and a wiring mistake should be loud.
    throw new Error(
      'useConsent must be used inside <ConsentProvider> (mounted in src/app/layout.js).',
    );
  }
  return value;
}

export default function ConsentProvider({ children }) {
  const [decision, setDecision] = useState({
    status: STATUS.UNDECIDED,
    analytics: false,
    decidedAt: null,
  });
  const [hydrated, setHydrated] = useState(false);
  const [prefsOpen, setPrefsOpen] = useState(false);

  // Counts transitions INTO granted, and nothing else. It is appended to the GA4 script ids so a
  // re-grant after a revoke actually re-executes the inline tags: Next caches
  // inline `<Script>` by `id` for the life of the document, so remounting the
  // same ids is a no-op and `window.gtag` — deleted on revoke — would never come
  // back. See ConsentedAnalytics for the teardown this pairs with.
  const [grantEpoch, setGrantEpoch] = useState(0);

  // The status currently applied, mirrored in a ref so `apply` can compare the
  // incoming decision against it without reading state inside an updater —
  // StrictMode may run an updater twice, and a bump there would double-count.
  const statusRef = useRef(STATUS.UNDECIDED);

  // Every decision change goes through here, so the epoch rule lives in one
  // place: bump only on a TRANSITION into granted. Re-writing a record that is
  // already granted — Accept pressed again, or another tab re-accepting, which
  // changes nothing but `decidedAt` — must not bump, or GA4 remounts under new
  // ids and runs its inline config a second time for the same page.
  const apply = useCallback((next) => {
    const wasGranted = statusRef.current === STATUS.GRANTED;
    statusRef.current = next.status;
    setDecision(next);
    if (next.status === STATUS.GRANTED && !wasGranted) {
      setGrantEpoch((n) => n + 1);
    }
  }, []);

  // Rule 1: the read happens here, never in render.
  //
  // Sets the ref directly rather than via `apply`: a grant found on load is the
  // FIRST mount, and epoch 0's ids have never been used, so there is nothing to
  // re-execute.
  useEffect(() => {
    const stored = readConsent();
    statusRef.current = stored.status;
    setDecision(stored);
    setHydrated(true);
  }, []);

  // Rule 3: follow the decision across tabs.
  useEffect(() => {
    const onStorage = (event) => {
      // Ignore every other key on the origin, and ignore the `key: null` event
      // browsers fire for `localStorage.clear()` — which is not this module's
      // doing and whose `newValue` is null anyway, so it would parse to
      // `undecided` and silently re-prompt.
      if (event.key !== CONSENT_KEY) return;
      // A grant arriving from another tab has to bump the epoch here too, or
      // this tab mounts GA4 with an id it has already used and the inline tag
      // never runs — `apply` does that, and only when this tab was not
      // already granted.
      apply(parseConsent(event.newValue));
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [apply]);

  const set = useCallback((allow) => {
    apply(writeConsent(allow));
    // Closing the preference centre on a decision is the right default: the
    // dialog exists to make a choice and the choice has been made. Leaving it
    // open would make the visitor dismiss the same surface twice.
    setPrefsOpen(false);
  }, [apply]);

  const grant = useCallback(() => set(true), [set]);
  const deny = useCallback(() => set(false), [set]);

  // Whatever had focus when the dialog was opened, so it can be handed back on
  // close — the WAI-ARIA dialog requirement, and the one people skip.
  //
  // Captured here from `document.activeElement` rather than passed down as a ref
  // from each trigger, because there are already two triggers (the notice's
  // Preferences button and the footer's Privacy choices link) and they live in
  // different trees with no common ancestor below this provider. Threading a ref
  // from each would mean every future trigger has to remember to do it, and the
  // one that forgets drops focus to `<body>` silently. Reading the active element
  // cannot be forgotten.
  const triggerRef = useRef(null);

  // `reopen` opens the PREFERENCE CENTRE, not the notice, and the distinction is
  // deliberate. The notice is a first-impression device — it explains the site
  // to somebody who has not seen it. A person clicking "Privacy choices" in the
  // footer has already read it and wants the switch; sending them back to the
  // introduction would be making them read the pitch again to reach the control.
  const reopen = useCallback(() => {
    const active = document.activeElement;
    // `<body>` is what `activeElement` reports for a mouse click on an element
    // that does not take focus, and focusing it later would be a no-op that
    // looks like a restore. Storing null instead lets the dialog skip the
    // restore honestly.
    triggerRef.current = active && active !== document.body ? active : null;
    setPrefsOpen(true);
  }, []);
  const closePrefs = useCallback(() => setPrefsOpen(false), []);

  const value = useMemo(
    () => ({
      status: decision.status,
      // Rule 2. Belt and braces: `decision.analytics` is already false before
      // the effect runs, and this makes the pre-hydration guarantee true by
      // construction rather than by the initial state happening to be right.
      analytics: hydrated && decision.analytics,
      decidedAt: decision.decidedAt,
      hydrated,
      grantEpoch,
      prefsOpen,
      triggerRef,
      grant,
      deny,
      set,
      reopen,
      closePrefs,
    }),
    [decision, hydrated, grantEpoch, prefsOpen, grant, deny, set, reopen, closePrefs],
  );

  // Renders `children` and nothing else — no wrapper element. A provider that
  // introduced a DOM node would change the layout of every page on the site for
  // a concern that has no visual presence of its own.
  return (
    <ConsentContext.Provider value={value}>{children}</ConsentContext.Provider>
  );
}
