// The privacy inventory (issue #141) — ONE description of everything this site
// collects, and the only one.
//
// ── Why this is a module and not a page of prose ─────────────────────────────
// A privacy policy is the one document on a site that is legally required to be
// TRUE and structurally guaranteed to go stale. It describes behaviour spread
// across forty files, it is written once, and nothing in a normal codebase can
// notice when the behaviour moves out from under it. The failure is silent and
// it is published: a policy that omits a storage key added last month is not an
// out-of-date document, it is a false statement to every visitor who reads it.
//
// This repository has already decided how it treats that class of defect. The
// sitemap is generated from a route registry rather than hand-listed, and
// `tests/unit/sitemapDrift.test.js` walks the filesystem and fails CI when a
// page exists with no entry (P1/P2 in docs/seo.md). The same reasoning applies
// here with more force, because a stale sitemap costs crawl budget and a stale
// privacy policy costs the truth.
//
// So: this module is the source, `/privacy` renders it, the preference centre
// reads its categories, and `tests/unit/privacyInventory.test.js` walks `src/`
// for browser-storage keys and fails when one is not disclosed below. Adding a
// `localStorage` key to this site now requires disclosing it, by construction.
//
// ── What this file is NOT ───────────────────────────────────────────────────
// It is not legal advice and it does not pretend to be a compliance framework.
// It is an honest engineering inventory, written by auditing the tree, which is
// the part a developer can actually guarantee.
//
// ── Voice ───────────────────────────────────────────────────────────────────
// First person, plain, specific. Every `detail` string below is published
// verbatim on /privacy, so it is written to be read by a person rather than
// assembled from the vendor-boilerplate phrasebook. Where a figure appears it
// is one that can be checked against the file named beside it.

// ── The stored decision ─────────────────────────────────────────────────────

/**
 * Where a visitor's consent decision lives.
 *
 * `localStorage`, not `sessionStorage`, and that is a requirement rather than a
 * default: a decision that evaporated with the tab would re-prompt the same
 * person on every visit, which is the behaviour that trains people to click
 * whatever makes the panel go away.
 *
 * Namespaced and VERSIONED from the first commit. The version is not
 * decoration — it is the only mechanism by which a future disclosure change can
 * re-ask the visitors it affects without re-asking everyone. Bumping it
 * invalidates every stored decision, so it is bumped when what the visitor
 * agreed TO has materially changed, and not when this file is merely reworded.
 */
export const CONSENT_KEY = 'ma:consent:v1';

/** The schema version stored inside the record. See `CONSENT_KEY`. */
export const CONSENT_VERSION = 1;

// ── Consent categories ──────────────────────────────────────────────────────

/**
 * The categories the preference centre renders, in order.
 *
 * TWO of them, and the shortness of this list is the design.
 *
 * Consent UI conventionally presents eight to twelve toggles over a vendor
 * list, which reads as thoroughness and functions as attrition: a person
 * confronted with twelve switches takes the one action that dismisses the
 * dialog. The number here is not a simplification of a longer list — it is the
 * real number, because the audit below found exactly one surface that genuinely
 * needs asking about. Offering a real binary is both more honest and more
 * usable than offering a real maze.
 *
 * `gated: false` means always on and NOT presented as a choice. Presenting an
 * un-toggleable switch is a lie about who is in control; the essential row is
 * shown, explained, and visibly fixed.
 */
export const CATEGORIES = [
  {
    id: 'essential',
    name: 'Essential',
    gated: false,
    summary: 'Always on. Kept on your device, and never sent anywhere.',
    detail:
      'The site remembers a few things locally so it behaves like a site you have ' +
      'used before — an unsent message survives a refresh, the intro plays once, ' +
      'a dismissed hint stays dismissed. All of it is written to your own ' +
      'browser and read back by your own browser. None of it is transmitted to ' +
      'me, and none of it is used to recognise you.',
  },
  {
    id: 'analytics',
    name: 'Analytics',
    gated: true,
    defaultOn: false,
    summary:
      'Off unless you turn it on. Counts which pages get read — never who read them.',
    detail:
      'Three measurement scripts, treated as one decision because they answer ' +
      'one question: which pages are worth keeping. None of them sets an ' +
      'advertising cookie, none builds a profile, and none is loaded at all ' +
      'until you say yes — not loaded-and-idle, not loaded-and-denied. Before a ' +
      'decision, your browser makes no request to any of them.',
  },
];

/** The one gated category's id, so consumers stop spelling the string. */
export const ANALYTICS_CATEGORY = 'analytics';

// ── What the analytics category actually controls ───────────────────────────

/**
 * The three scripts behind the analytics toggle.
 *
 * Named individually on the policy page rather than summarised as "analytics",
 * because "we use analytics" is the sentence that tells a reader nothing. A
 * person deciding whether to allow this deserves to know whose servers are
 * involved.
 */
export const ANALYTICS_SURFACES = [
  {
    name: 'Vercel Web Analytics',
    processor: 'Vercel Inc.',
    collects:
      'Page path, referrer, country-level location, device class. Cookieless — ' +
      'no identifier is stored on your device.',
    source: 'src/components/privacy/ConsentedAnalytics.jsx',
  },
  {
    name: 'Vercel Speed Insights',
    processor: 'Vercel Inc.',
    collects:
      'Core Web Vitals samples (how fast a page painted, how much it shifted, ' +
      'how quickly it answered your first tap) attached to a route, not a person.',
    source: 'src/components/privacy/ConsentedAnalytics.jsx',
  },
  {
    name: 'Google Analytics 4',
    processor: 'Google LLC',
    collects:
      'Cookieless pings under Consent Mode v2 with all four consent signals ' +
      'denied: page path, referrer, coarse geography, device class, and a fixed ' +
      'list of interaction events. Because nothing is stored on your device, ' +
      'there is no identifier tying two visits together — which costs me the ' +
      'ability to count returning readers, and is the right trade.',
    source: 'src/components/analytics/GoogleAnalytics.jsx',
  },
];

// ── Cookies ─────────────────────────────────────────────────────────────────

/**
 * Every cookie this site can set.
 *
 * ── The correction that makes this section exist ────────────────────────────
 * Issue #141 was written when the honest answer was "none", and said so: its
 * first conclusion was that calling the panel a cookie banner would be
 * factually wrong because the site set no cookies at all. That was true when it
 * was written and stopped being true when the guestbook (#40) brought Auth.js
 * v5. Shipping the original copy would have printed "No cookies" on a site that
 * sets several — `COOKIE_COUNT` below is the current number, derived rather
 * than written here, so this paragraph cannot go stale the next time it moves.
 *
 * The consent conclusion survives the correction — every cookie below is
 * strictly necessary for a feature the visitor deliberately asked for, and none
 * requires consent under PECR's own exemption for exactly that case. What does
 * not survive is the blanket denial. So the notice says what is true and more
 * specific: no advertising cookies, no tracking cookies, and the only cookies
 * here are the sign-in session — set if, and only if, you choose to sign in.
 *
 * Names as `next-auth@5` sets them. It prefixes them `__Secure-` over HTTPS,
 * which production is; the bare names are what you see on localhost.
 */
export const COOKIES = [
  {
    name: 'authjs.session-token',
    setWhen: 'You sign in to the guestbook',
    purpose:
      'Holds your session as an encrypted JSON Web Token. It carries your ' +
      'display name, avatar URL and an account identifier, and it is what lets ' +
      'the wall know an entry is yours.',
    lifetime: 'Until it expires or you sign out',
  },
  {
    name: 'authjs.csrf-token',
    setWhen: 'You sign in to the guestbook',
    purpose:
      'Stops another site from making an authentication request in your name ' +
      '(cross-site request forgery).',
    lifetime: 'Session',
  },
  {
    name: 'authjs.callback-url',
    setWhen: 'You sign in to the guestbook',
    purpose: 'Remembers which page to return you to after the sign-in round-trip.',
    lifetime: 'Session',
  },
  {
    name: 'authjs.pkce.code_verifier, authjs.state',
    setWhen: 'During the sign-in handshake only',
    purpose:
      'The PKCE verifier and state parameter that make the OAuth exchange ' +
      'tamper-evident. Both are consumed the moment you come back.',
    lifetime: 'A few minutes',
  },
];

/**
 * How many cookies this site can set — which is NOT `COOKIES.length`.
 *
 * The rows above are grouped by what a reader needs to understand, and the PKCE
 * pair shares one row because it shares one purpose and one lifetime: naming
 * them apart would print the same sentence twice. So four rows describe five
 * cookies, and the number /privacy states is the number of cookies rather than
 * the number of cards it drew.
 *
 * Derived here, from the only list of them, because a count typed into the
 * page's prose is the exact defect CLAUDE.md warns about — and this one had
 * already gone wrong once by the time anybody looked.
 */
export const COOKIE_COUNT = COOKIES.reduce(
  (total, cookie) => total + cookie.name.split(',').length,
  0,
);

// ── Third parties ───────────────────────────────────────────────────────────

/**
 * Everything that receives data because of something a visitor did.
 *
 * Distinguished from `ANALYTICS_SURFACES` on purpose: these are not gated,
 * because each one is the thing the visitor asked for. Sending a contact form
 * requires sending the contact form. What is owed here is disclosure, not a
 * toggle — a toggle that could refuse the contact form's own mail delivery
 * would be theatre.
 */
export const PROCESSORS = [
  {
    name: 'Vercel',
    role: 'Hosting and delivery',
    detail:
      'Serves every page. Like any web server it processes your IP address and ' +
      'user agent to answer the request; those are handled by Vercel under its ' +
      'own terms and I neither see nor store them.',
    initiated: 'Always — it is how the page reaches you',
  },
  {
    name: 'Vercel AI Gateway',
    role: 'Message refinement',
    detail:
      'If you press Refine on the contact form, the text you have typed is sent ' +
      'to a language model to be rewritten and sent straight back. This is the ' +
      'one place your own words leave this origin without you pressing Send, ' +
      'which is why the button says what it does before you press it and why ' +
      'this row exists. Nothing is stored: the request is answered and gone.',
    initiated: 'Only when you press Refine',
    source: 'src/app/api/refine-message/route.js',
  },
  {
    name: 'GitHub / Google',
    role: 'Sign-in',
    detail:
      'If you sign the guestbook, you authenticate with one of them and it ' +
      'returns your display name, avatar URL and an account identifier. I never ' +
      'receive your password, and I request nothing beyond your public profile.',
    initiated: 'Only when you choose to sign in',
    source: 'src/auth.js',
  },
  {
    name: 'Upstash (Redis)',
    role: 'Data store',
    detail:
      'Holds guestbook entries, the live "here now" counter and the ' +
      'rate-limit counters that keep the wall usable.',
    initiated: 'When you post, react, or view the guestbook',
    source: 'src/lib/guestbook/redisDriver.js',
  },
  {
    name: 'A mail provider, over SMTP',
    role: 'Contact form delivery',
    detail:
      'A submitted contact form is delivered to my inbox as an email. The ' +
      'name, address and message you typed travel in it, because that is what ' +
      'sending a message means.',
    initiated: 'Only when you press Send',
    source: 'src/app/api/send-mail/route.js',
  },
];

// ── Data held server-side ───────────────────────────────────────────────────

/**
 * What exists on a server after a visit, and for how long.
 *
 * Retention is stated per row because "we retain data as long as necessary" is
 * the single least informative sentence in the genre. Where the answer is a
 * real interval it is named; where it is indefinite, it says indefinite and
 * says how to end it.
 */
export const SERVER_DATA = [
  {
    what: 'Your guestbook entry',
    contains:
      'Display name, GitHub username (GitHub sign-ins only), avatar URL, an ' +
      'account identifier, your message, an optional drawn signature, and the ' +
      'time you posted.',
    retention:
      'Indefinitely — it is a public wall and the point is that it persists. ' +
      'Email me and I will remove yours.',
    visibility:
      'Public. The account identifier is the one field that is never returned ' +
      'to anyone, including you.',
    source: 'src/app/api/guestbook/route.js',
  },
  {
    what: 'Live presence',
    contains:
      'A random identifier your browser mints for the tab, with no connection ' +
      'to your account or your address.',
    retention: 'About two minutes, then the key expires on its own.',
    visibility: 'Aggregated into a single number: how many people are here now.',
    source: 'src/lib/guestbook/presence.js',
  },
  {
    what: 'Rate-limit counters',
    contains:
      'Your IP address, SHA-256 hashed. The hash is the key; the address itself ' +
      'is never written down.',
    retention: 'Minutes — each counter carries a short expiry.',
    visibility: 'Nobody. It exists to stop one person flooding the wall.',
    source: 'src/lib/guestbook/ratelimit.js',
  },
  {
    what: 'Refine throttle',
    contains:
      'Your IP address, in memory only, in the server instance that handled ' +
      'the request.',
    retention:
      'Not stored at all. It lives in a variable and disappears when the ' +
      'instance does.',
    visibility: 'Nobody.',
    source: 'src/app/api/refine-message/route.js',
  },
  {
    what: 'A contact message',
    contains: 'The name, email address and message you submitted.',
    retention:
      'It is an email in my inbox. It stays until I delete it, like any ' +
      'other email you would send me.',
    visibility: 'Me.',
    source: 'src/app/api/send-mail/route.js',
  },
];

// ── Device-local storage ────────────────────────────────────────────────────

/**
 * Category labels for the storage table. Grouping keeps a fifteen-row table
 * readable without hiding any of it — the alternative was summarising, and a
 * summarised list is one nobody can check.
 */
export const STORAGE_GROUPS = {
  consent: 'Your privacy choice',
  contact: 'Contact form',
  guestbook: 'Guestbook',
  interface: 'Interface state',
  freshness: "What's changed since your last visit",
  cache: 'Cached data',
};

/**
 * Every key this site writes to `localStorage` or `sessionStorage`.
 *
 * ── This list is enforced, not maintained ──────────────────────────────────
 * `tests/unit/privacyInventory.test.js` finds storage call sites across `src/`,
 * resolves each key expression to the literal it stores under, and fails CI on
 * any key missing from this array. That is the whole reason the inventory is
 * code: the list cannot fall behind the site without the build going red.
 *
 * `prefix: true` marks a key whose stored name has a variable suffix — the
 * guestbook's per-account draft slots are `guestbook:draft:v2:<account>`, one
 * per signed-in account, because a single browser-wide slot handed one person's
 * unsent message to whoever signed in next (see draftKey.js). The test matches
 * these by prefix.
 *
 * Every `purpose` here is published on /privacy verbatim, so each is written as
 * a reason rather than a restatement of the key's name.
 */
export const STORAGE_KEYS = [
  {
    key: CONSENT_KEY,
    kind: 'localStorage',
    group: 'consent',
    purpose:
      'Your answer to the privacy notice, and when you gave it. This one exists ' +
      'so the site stops asking.',
  },

  {
    key: 'contact:draft:v1',
    kind: 'localStorage',
    group: 'contact',
    purpose:
      'What you have typed into the contact form so far, so a refresh or a ' +
      'mis-tap does not lose it.',
  },
  {
    key: 'contact:queue:v1',
    kind: 'localStorage',
    group: 'contact',
    purpose:
      'A message you sent while offline, held on your device until the network ' +
      'comes back and it can actually be delivered.',
  },

  {
    key: 'guestbook:prefs',
    kind: 'localStorage',
    group: 'guestbook',
    purpose: 'Your guestbook sound and motion switches.',
  },
  {
    key: 'guestbook:draft:v2:',
    prefix: true,
    kind: 'localStorage',
    group: 'guestbook',
    purpose:
      'An unsent guestbook message, in a slot named after the account that ' +
      'typed it — so signing out cannot hand your draft to the next person on ' +
      'this browser.',
  },
  {
    key: 'guestbook:draft:v1',
    kind: 'localStorage',
    group: 'guestbook',
    purpose:
      'The retired single-slot draft. It is never read; the composer deletes it ' +
      'on sight, for the reason above.',
  },
  {
    key: 'guestbook:presence-id',
    kind: 'sessionStorage',
    group: 'guestbook',
    purpose:
      'The random tab identifier behind the "here now" counter. It is per-tab ' +
      'and disappears when you close it.',
  },

  {
    key: 'loaderSeen',
    kind: 'localStorage',
    group: 'interface',
    purpose: 'Whether you have seen the intro animation, so it plays once.',
  },
  {
    key: 'nav-orbit-tip:dismissed',
    kind: 'localStorage',
    group: 'interface',
    purpose: 'Whether you dismissed the navigation hint, so it stays dismissed.',
  },
  {
    key: 'projects-category-handoff',
    kind: 'sessionStorage',
    group: 'interface',
    purpose:
      'Which project category you tapped, carried across one navigation and ' +
      'then deleted.',
  },
  {
    key: 'projects-category',
    kind: 'localStorage',
    group: 'interface',
    purpose:
      'The retired version of the setting above, which used to persist ' +
      'indefinitely. Nothing writes it any more and nothing reads it — the ' +
      'site deletes it if it finds it, so a visitor from before the change is ' +
      'tidied up rather than left carrying it forever.',
  },

  {
    key: 'project-count:last-seen',
    kind: 'localStorage',
    group: 'freshness',
    purpose:
      'How many projects existed last time you were here, so the site can say ' +
      'what is new rather than just how much there is.',
  },
  {
    key: 'project-progress:lastGood',
    kind: 'localStorage',
    group: 'freshness',
    purpose:
      'The last project-progress figures that loaded cleanly, so a slow ' +
      'request shows the previous numbers instead of nothing.',
  },
  {
    key: 'streak-update:last-seen',
    kind: 'localStorage',
    group: 'freshness',
    purpose: 'The commit streak as you last saw it, to work out the difference.',
  },
  {
    key: 'skills-update:last-seen',
    kind: 'localStorage',
    group: 'freshness',
    purpose: 'The skills list as you last saw it, to work out the difference.',
  },
  {
    key: 'languages-update:last-seen',
    kind: 'localStorage',
    group: 'freshness',
    purpose: 'The language breakdown as you last saw it, to work out the difference.',
  },
  {
    key: 'experience-update-banner:lastPlayed',
    kind: 'sessionStorage',
    group: 'freshness',
    purpose:
      'Which update message this tab has already shown you, so it is not ' +
      'repeated on every navigation.',
  },

  {
    key: 'skillsCache:v4',
    kind: 'localStorage',
    group: 'cache',
    purpose:
      'A copy of the skills data from my GitHub, so the about page renders ' +
      'immediately instead of waiting on an API.',
  },
  {
    key: 'skillsLastFetched:v4',
    kind: 'localStorage',
    group: 'cache',
    purpose: 'When that copy was taken, so it knows when to refresh it.',
  },
  // The two username-suffixed caches. Both are built as
  // `` `…:${username}` `` in code, where `username` is MY GitHub handle rather
  // than anything about you — so in practice each is a single key, and they are
  // marked as prefixes because that is how the code spells them and therefore
  // how the drift test has to match them.
  {
    key: 'github-stats:lastGood:',
    prefix: true,
    kind: 'localStorage',
    group: 'cache',
    purpose:
      'The last good copy of my GitHub statistics, so the about page’s cards ' +
      'render populated on a cold load instead of empty while the API answers.',
  },
  {
    key: 'experience-summary:last-payload:',
    prefix: true,
    kind: 'localStorage',
    group: 'cache',
    purpose:
      'The last good copy of my experience figures, for the same reason — and ' +
      'so the page can tell you what has changed since you were last here.',
  },
];

// ── What people assume is tracking, and is not ──────────────────────────────

/**
 * Live-looking features that read nothing about the visitor.
 *
 * Included because they are the rows a sceptical reader looks for. A footer
 * that names a town and a widget that names a song look exactly like the
 * output of tracking, and a policy that does not address them leaves its most
 * attentive reader with the worst possible impression. Each of these is data
 * about ME.
 */
export const NOT_VISITOR_DATA = [
  {
    what: 'The town in the footer',
    detail:
      'My location, from a tracker on my own phone, rounded before it is ' +
      'stored and only ever shown as a town. It is not derived from your ' +
      'address and does not change based on who is reading.',
    source: 'src/app/api/location/route.js',
  },
  {
    what: 'The now-playing widget',
    detail:
      'What I am listening to, read from my own Spotify account. The endpoint ' +
      'returns a title, an artist and some artwork; the credentials never reach ' +
      'your browser.',
    source: 'src/app/api/spotify/route.js',
  },
  {
    what: 'The live build and repository figures',
    detail:
      'Public data about this repository, from the GitHub API. Cached ' +
      'server-side and identical for every visitor.',
    source: 'src/app/api/github-stats/route.js',
  },
  // ── Requested by docs/seo.md §4, which asked for this row by name ──────────
  // The CV audit found the PDF carries an email address and a UK mobile number,
  // and the decision to make it indexable means both are crawlable by scrapers
  // as well as by recruiters. (Since 2026-09-26 the PDF canonicalises to /cv
  // and only /cv is indexed; the PDF is still public, so the cost stands.)
  // §4 accepted that cost and wrote: "This needs a row
  // in #141's disclosure inventory — the privacy page must state that the CV is
  // published and indexed, and what it contains."
  //
  // It is MY data rather than a visitor's, which is why it sits in this section
  // instead of the ones above. Disclosing it here anyway is the point: a privacy
  // page that lists only what it takes from you, and says nothing about what it
  // publishes about its author, is being careful in one direction only.
  {
    what: 'My CV, deliberately indexed',
    detail:
      'The CV at /cv is published and indexed on purpose, so it works as a ' +
      'landing page for my name, and its PDF is public beside it (search ' +
      'engines are pointed at /cv rather than the PDF). Both carry my email ' +
      'address and the PDF also carries my mobile number, which means both are ' +
      'reachable by scrapers ' +
      'as well as by recruiters. That is a cost I accepted knowingly rather than ' +
      'one I overlooked — and it is my number, not yours.',
    source: 'src/lib/seo/site.js',
  },
];

// ── Rights and contact ─────────────────────────────────────────────────────

/**
 * The practical answers, per right.
 *
 * Written as what I will actually do rather than as a recital of statutory
 * language, because a recital is unfalsifiable and a promise is not. Kept
 * honest about the limits: I cannot delete what I never had, and the rows say
 * so.
 */
export const RIGHTS = [
  {
    right: 'See what I hold about you',
    answer:
      'For almost everyone the answer is nothing — a visit that signs nothing ' +
      'and sends nothing leaves no record with your name on it. If you signed ' +
      'the guestbook or emailed me, ask and I will tell you exactly what is there.',
  },
  {
    right: 'Have it deleted',
    answer:
      'Email me and your guestbook entry goes. Device-local storage is yours to ' +
      'clear at any time from your browser settings, and I could not reach it if ' +
      'I wanted to.',
  },
  {
    right: 'Withdraw analytics consent',
    answer:
      'Change it from the Privacy choices link in the footer of any page. It ' +
      'takes effect immediately — the scripts are unloaded on the spot, not at ' +
      'the next page load.',
  },
  {
    right: 'Correct something',
    answer:
      'Your guestbook name and avatar come from GitHub or Google and update ' +
      'when you next sign in. Anything else, email me.',
  },
  {
    right: 'Complain',
    answer:
      'I am in the UK, so the Information Commissioner’s Office is the ' +
      'regulator — ico.org.uk. I would rather you told me first.',
  },
];

/**
 * When the policy last changed materially.
 *
 * Hand-maintained and deliberately so. A build-time date would say the file was
 * touched, which is not the question a reader is asking — they want to know
 * whether what they agreed to has changed. That judgement is a person's, so it
 * is written down by a person, and CLAUDE.md's rule against hand-copied figures
 * is satisfied by this being a DECISION rather than a measurement.
 *
 * Bump it when the substance changes. Leave it alone for a reworded sentence.
 */
export const POLICY_UPDATED = '2026-09-25';
