# Twenty languages, and not one English URL changed

How this site went from English-only to twenty languages, right-to-left
Arabic, Hebrew, Persian and Urdu included, while every English address,
canonical and inbound link kept working exactly as before. It also covers the
three automated checks that now stop an untranslated string, a broken
right-to-left layout or a mistranslated placeholder from reaching a visitor.

The figures in this note were measured on 1 November 2026. The work is issue
#82 in the repository.

## The constraint that shaped everything

The site already ranked, already had links pointing at it, and already had a
canonical URL on every page. Adding languages could not cost any of that. So
the rule from the first commit was: **an English visitor, a search engine and
anyone holding an old link must see no difference at all.**

That rules out the two common designs. Moving English under `/en/` changes
every URL on the site. Detecting the browser's language and redirecting means
a link shared in English opens in Japanese for the next person, and Google's
crawler, which sends no language preference, would only ever see one version.

What the site does instead:

| URL | Serves |
|---|---|
| `/about` | English, exactly as before |
| `/ar/about`, `/ja/about`, … | The same page in another language |
| `/en/about` | A redirect to `/about`, so there is one English address |

English stays unprefixed (`localePrefix: 'as-needed'` in
[next-intl](https://next-intl.dev)), and every other language gets a prefix.
Nothing is redirected based on a guess.

## Routing: one proxy, no guessing

Every request passes through one small proxy (`src/proxy.js`, Next.js 16's
replacement for middleware). It does three things and refuses to do a fourth:

- **Prefixed paths** go to that language's version of the page.
- **Unprefixed paths** are served from the English version through an
  internal rewrite. The address bar never changes.
- **A visitor who has chosen a language** (a cookie written only by the
  language selector, never implicitly) gets a `307` from an unprefixed page to
  their language. That is the only redirect the site makes.
- **It never redirects on the browser's `Accept-Language`.** A browser that
  prefers a supported language gets a one-time, dismissible suggestion written
  in that language instead.

Paths that look like files (anything with a dot, such as `/favicon.ico` or
`/ads.txt`) are not the proxy's business: its matcher leaves them alone, so
static files are served untouched. When no such file exists, the request
still reaches the `[locale]` segment, with `favicon.ico` as its "locale". That
segment accepts only the real locales (`dynamicParams = false` in
`src/app/[locale]/layout.js`), so the answer is a plain 404 from
`src/app/not-found.js`. Before 2026-11-07 it was a 500.

Three of next-intl's defaults are switched off, each for a reason written down
beside it in `src/i18n/routing.js`. Automatic detection is off for the reason
above. Its own cookie is off because it would turn "I followed one link to
`/ja/about`" into a sticky preference. Its `Link` header is off because it
would advertise translations of pages that are deliberately English-only.
Language alternates are published in the page `<head>` instead, where they can
be left out for those pages.

Search engines get the full picture: reciprocal `hreflang` alternates with an
`x-default`, `og:locale` per page, `inLanguage` in the structured data, and a
sitemap that lists every translated page once per language.

## Words: catalogues, not strings

Every word a visitor can see or hear comes from a message catalogue in
[ICU MessageFormat](https://unicode-org.github.io/icu/userguide/format_parse/messages/).
That includes button labels, `aria-label`s, image `alt` text, placeholders,
toasts, validation errors and screen-reader announcements. In November 2026
that was 27 namespaces and well over a thousand strings per language.

ICU matters because languages count differently. English has two plural forms
("1 workflow", "2 workflows"). Arabic has six, Japanese has one. A catalogue
entry like
`{count, plural, one {# workflow} other {# workflows}}` lets each language
supply its own forms instead of the code gluing a number to a word.

Content that lives in code, such as project descriptions, the timeline and the
tools list, stays in one English source file (`src/app/data.js`). A script
derives its catalogue from that file, keyed by stable ids rather than array
positions, so `data.js` remains the single source of the English.

Numbers, dates and relative times ("5 minutes ago") are formatted by the
browser's `Intl` APIs with each language's own conventions, including its own
digits. None of that is hand-coded.

"Its own digits" turned out to depend on who you ask. Which digits a language
uses by default is CLDR data, and CLDR changes: current CLDR gives Arabic
Western digits ("11"), while older ICU builds still give Arabic-Indic ("١١").
The server and most browsers (Chromium, Firefox, Apple's WebKit) ship a
current ICU. Linux WebKit, the engine behind GNOME Web, uses the operating
system's, which can be years older. There, every number on an Arabic page
hydrated differently from the HTML it arrived in, and React threw the page
away and re-rendered it. So the server now writes the numbering system it used
onto `<html data-numbering>`, and before hydration an engine that would pick a
different one is told to use the server's (`src/i18n/numberingAlignment.js`,
run from `src/instrumentation-client.js`). The server's CLDR stays the
reference, still with nothing hard-coded per language. A browser that already
agrees, which is nearly every browser, is not touched at all.

## Translating without trusting the translator

The nineteen non-English catalogues are machine-translated through the Vercel
AI Gateway. The interesting part is not the model. It is that **nothing the
model returns is trusted until it has been checked.**

- **Every response is validated against the English message's structure.** A
  translation that drops a `{placeholder}`, renames a rich-text tag, changes a
  `select`'s branches or loses a plural's required `other` form is rejected
  and retried with the error stated.
- **Translation is incremental.** A lockfile records, for every language and
  key, a hash of the English the translation was made from. Changing one
  English sentence re-translates one sentence per language, and a human
  correction is never overwritten unless its English changes.
- **Some things are set by hand.** The owner's name is transliterated per
  language (محمد عبدالله, ムハンマド・アブドゥッラー) and kept away from the model
  entirely.
- **It says so.** Every non-English language is marked `machine` in the
  locale registry, and the site shows a "machine-translated" notice for each
  until a native speaker reviews it. Only that review removes the notice.

A catalogue audit runs in CI on every push. It fails on a missing key, a
translation whose English has changed since it was made, a broken ICU
structure, or a catalogue file the app never loads.

## Right to left is a layout, not a translation

Arabic, Hebrew, Persian and Urdu set `dir="rtl"` on the page, and that only
works if the layout was written to be mirrored:

- **Logical CSS.** Margins, padding and borders say `start` and `end`, not
  `left` and `right`. A fitness test fails the build on any new physical
  inline property unless it carries a reviewed reason.
- **Motion mirrors too.** CSS can't see a slide-in written in JavaScript or in
  a keyframe, so every "enter from the start side" offset is multiplied by a
  direction sign. The navigation orbit, the carousel and the timeline atlas
  all reverse their drag, wheel and arrow keys.
- **Some things must not mirror.** An email address, a terminal, a code
  editor and a number run read left to right in every language. They sit in
  `dir="ltr"` islands, and so do the English-only notes.
- **Letters that join must not be split.** The site animates some text one
  letter at a time, which would break Arabic and Devanagari, where letters
  change shape when they join. A shared splitter cuts those scripts by word
  instead.

## Fonts and bytes

An English visitor downloads nothing new. Arabic, Hebrew and Devanagari fonts
are self-hosted and sliced by `unicode-range`, so a browser fetches a slice
only when a character on the page needs it, and none is preloaded. Chinese,
Japanese and Korean use each platform's system fonts, one stack per language.

Each page ships only the messages it renders at first paint, and a fitness
test measures what one page hands the browser, per language, against a
gzipped budget of 8 kB. Copy that only appears on demand is fetched when it
is wanted: the privacy preferences dialog, the `/uses` ⌘K commands, and the
descriptions of tools the live crawl turns up. `/uses` is the one page
allowed 9 kB, because it server-renders a description for each of its 42
curated tools so the stack reads in the visitor's language from the first
frame.

## Proving it: three checks on every push

Translation bugs are quiet. A page with one English sentence left in it still
returns `200`, still passes an English test, and looks fine to anyone who
reads English. So the site has three checks that a person could not
realistically repeat by hand across twenty languages.

**1. The catalogue audit**, described above, catches broken or stale
translations.

**2. A pseudo-locale.** CI builds the site with one extra, hidden language,
`en-XA`, in which every catalogue string is rewritten:

```
About me   →   [ȦȦƀǿǿŭŭŧ ḿḗḗ]
```

Each letter is swapped for an accented look-alike, each vowel is doubled
(about 30% longer, roughly German's expansion over English), and the whole
message is bracketed. A browser test then visits every page in `en-XA` and
reads its visible text, accessible names and title. **Any plain ASCII word
outside a bracket did not come from a catalogue**, so it fails the build with
the word and the element it sat in.

Names are not prose. A repository name, a package, a town or an email address
is marked `translate="no"`, the HTML attribute that already means "do not
translate this", so the test skips it, and so does a browser's built-in
translator. The pseudo-locale is routed only in CI's build. Production has no
`/en-XA`, and the sitemap, `hreflang` tags and language selector never list it.

**3. The browser tests run in Arabic and Japanese.** Before this, every
accessibility scan, render check and screenshot visited English pages only.
They now also run the whole site in Arabic (right to left, a joined script)
and Japanese (no spaces between words, a different font stack). Between them,
those two exercise every code path a third language would.

## What the checks found

All of these had passed every existing test. Each was found by a check above,
and each is now covered by a test that fails without the fix.

| Defect | Found by | Fix |
|---|---|---|
| The footer's link labels were built in code as `` `${command}, ${handle}: ${description}` ``, which forced English punctuation into every language. | Pseudo-locale | One message per language. Arabic now writes its own comma (،), Japanese its own (、). A test checks the visible words stay first, which voice-control users rely on. |
| A tool's name on `/uses` contained prose ("the VS Code terminal") in a field that is never translated. | Pseudo-locale | Names only in that field. Prose lives in the translated description. |
| `/ja/about` threw a React hydration error. Japanese text was split into words with `Intl.Segmenter`, which uses a dictionary, and Chromium ships a smaller dictionary than Node.js. The server and the browser cut the same sentence differently and rendered different elements. | Japanese browser run | The cut is now a pure function of the characters (a new piece where the script changes, punctuation kept with the piece before it), so every runtime agrees. A test sabotages the dictionary segmenter to prove it is no longer used. |
| `/ar/privacy` and the Arabic notes scrolled sideways on a phone. Rows in the English-only sections slide in from the left. In a left-to-right page that overhang is invisible; in a right-to-left page it becomes scrollable. | Arabic phone run | The English island clips its own horizontal overhang, only inside right-to-left pages. |
| A link's accessible name in Japanese no longer contained its visible words: the screen showed 紙版はこちら ("the paper version, here") and the name said 紙版：PDF形式のCV. The translator had reworded one of two messages that had to repeat each other. Voice-control users say what they see, so this broke them. | Japanese accessibility scan | The link is now named from its own visible text, with a continuation only screen readers hear, so no translation can fall out of step. |
| The footer email address printed backwards in Arabic (`moc.liamg@…`): each letter of its hover effect is an inline block, and inline blocks take the page's direction. | The site's owner, by eye | Fixed before these checks existed. A cross-browser test now reads the address glyph by glyph in on-screen order and compares it with the real address. |

The last row is the reason the other checks exist.

## What is still English, on purpose

- **These engineering notes and the privacy policy's body.** The privacy
  policy is a statement whose wording matters, and a machine translation of
  it would be a different statement. Both pages say so in the reader's
  language, mark the English as `lang="en"` for screen readers, and point
  their canonical at the English page.
- **Share-card images.** The image renderer has no Arabic shaping, so cards
  stay in English rather than showing broken Arabic.
- **Guestbook entries.** Visitors' words are kept as written.

## Running it yourself

| What | Command |
|---|---|
| Audit every catalogue | `npm run i18n:audit` |
| Translate what changed | `npm run i18n:translate` |
| Generate the pseudo-locale | `npm run i18n:pseudo` |
| Build with it and crawl every page in `en-XA` | `npm run test:i18n` |
| Accessibility scan, English, Arabic and Japanese | `npm run test:a11y` |

The decisions behind discoverability, including `hreflang` and the sitemap,
are recorded in [Discoverability](/notes/discoverability). Every test layer,
including these, is described in [How this site is tested](/notes/testing).
