// The /privacy document (issue #141).
//
// ── A SERVER component, deliberately ────────────────────────────────────────
// No `'use client'`. Every word below is in the server-rendered HTML, which
// matters more here than on any other page on the site:
//
//   • A privacy policy that needs JavaScript to be read is not a disclosure.
//     Whoever has the strictest browser settings is exactly the person most
//     likely to come looking for this page, and shipping it as an empty div for
//     them would be a joke at their expense.
//   • It is the one page whose value depends on being independently checkable.
//     Fully crawlable means a search engine, an assistant, or the Wayback
//     Machine can quote it back — which is what makes it a commitment rather
//     than a claim.
//
// Exactly one client island sits inside it — `<ConsentStatusPanel />` — because
// the visitor's own current choice is the one thing on the page that cannot be
// known at build time.
//
// ── Rendered from the inventory, never typed twice ──────────────────────────
// Every table below maps over `src/lib/privacy/inventory.js`. Nothing is
// restated in prose here, because a restatement is a second copy and the second
// copy is the one that goes stale. The prose in this file is limited to framing
// — the sentences that explain why a section exists — and the facts all arrive
// as data.
//
// The framing prose is held to that rule too, which it originally was not. Three
// of the ledes below state HOW MANY of something their section lists, and all
// three were typed out as words — so §06 read "all three are data about me" from
// the moment a fourth row landed, which was the same sitting it was written in.
// Every count here now interpolates `countWord()` over the array it describes,
// so the number cannot disagree with the list directly underneath it, and
// `tests/unit/privacyInventory.test.js` fails if one is ever typed back in.
//
// ── Why it is built rather than written as markdown ────────────────────────
// `docs/*.md` is auto-published at `/notes/<slug>` by readNotes(), so a
// `docs/privacy.md` would have shipped a SECOND indexable copy of this document
// at `/notes/privacy`, competing with this URL for the same content. Two URLs
// for one page is the defect §2 of docs/seo.md exists to prevent, and it would
// have arrived by accident through a convenience.
//
// ── The contrast floor on this page, measured ──────────────────────────────
// #8a8a8a is the lightest grey NOT used here, and #8a8a8a is the darkest that
// is. The first draft reached for #7a7a7a and #6f6f6f for the quiet lines and
// scored 0.97 on Lighthouse accessibility — eleven real `color-contrast`
// failures, which CI asserts at 1.0 and would have failed the build.
//
// Computed against this page's actual grounds rather than guessed: the page
// plate is `--background` (#1b1b1b), the key chips are `bg-black/40` over it
// (#131313) and the dialog is the near-black night-950. The minimum neutral for
// 4.5:1 is #838383, #7d7d7d and #777777 respectively, so #8a8a8a clears all
// three at 4.99 / 5.38 / 5.89 and is the one value worth remembering.
//
// The section ordinals were the other half: `text-[#ff6d05]/70` composites to
// #bb540c at 3.59:1. At full strength the same ember is 6.10:1. `aria-hidden`
// bought no exemption, correctly — contrast is about being SEEN, so hiding a
// glyph from a screen reader says nothing about whether a sighted reader with
// low vision can make it out.
//
// ── Orchid & ember, replacing the greys ────────────────────────────────────
// The page speaks in its own two brand voices: the ember of the title and the
// orchid of its subtitle ("what this site knows"). Record titles are the bright
// ember #ff8a1e. The reading copy carries a faint violet cast taken from the
// subtitle — #f7efff for prose, #e4d6f7 for definition values — and small
// print is lilac #c8a6ee rather than a dimmed neutral.
//
// Chosen by the owner from rendered candidates, after three rejected ladders:
// neutral greys (read as a document from somewhere else), mid-luminance
// parchment (read as muddy grey), and gold-and-ivory. The lesson that survived
// all three is that reading copy on this ground must be either near-white or
// clearly tinted, never a warm mid-tone.
//
// Every step is far above the #8a8a8a floor; the quietest, #c8a6ee, is 8.4:1
// on the page plate and 9.0:1 on the chips. Those margins are deliberate: the
// scroll reveal below starts text at 0.8 opacity, and a colour that only just
// cleared 4.5:1 would fail while it was still arriving.
//
// Orchid (#fc83ff, the page subtitle's voice) marks the one thing on the page
// that is a PLACEHOLDER rather than a fact — the storage-lifetime pills and
// the `<account>` slot in a key name. It is a separate hue on purpose, so a
// reader can tell at a glance which parts are data and which are shorthand.
//
// ── The scroll reveal ──────────────────────────────────────────────────────
// The `pv-*` classes are CSS scroll-driven animations in globals.css (the
// "/privacy — declassification" block). CSS rather than Framer because this
// component must stay a server component — see the top of this file. Nothing is
// hidden in a base rule, so without support or with reduced motion the page is
// simply complete.

import {
  ANALYTICS_SURFACES,
  COOKIES,
  COOKIE_COUNT,
  NOT_VISITOR_DATA,
  POLICY_UPDATED,
  PROCESSORS,
  RIGHTS,
  SERVER_DATA,
  STORAGE_GROUPS,
  STORAGE_KEYS,
} from '@/lib/privacy/inventory';
import { IDENTITY } from '@/lib/seo/site';
import { fluid, fluidText } from '@/lib/fluidScale';
import { countWord } from '@/lib/numberWords';

import ConsentStatusPanel from './ConsentStatusPanel';

// Formatted on the SERVER with an explicit locale. `toLocaleDateString()` with
// no locale resolves against the machine's, so the build box and a visitor's
// browser could format the same date differently — and on a server-rendered
// string that is a hydration mismatch rather than a cosmetic difference.
const UPDATED_LABEL = new Date(POLICY_UPDATED).toLocaleDateString('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

// The warm ink ladder — see "The warm ink" in the header. Full class strings,
// so Tailwind's scanner finds them.
//
// The two links inside `.pv-lede` paragraphs use the brighter ember #ff8a1e
// rather than the site's #ff6d05. A lede starts its reveal at 0.8 opacity, and
// #ff6d05 at 0.8 measured 4.33:1 in Lighthouse — a fail. #ff8a1e holds ~5.2:1
// at the floor.
const INK = {
  title: 'text-[#ff8a1e]', // record titles — bright ember
  body: 'text-[#f7efff]', // standfirst, ledes, the short version — violet-white
  value: 'text-[#e4d6f7]', // definition values, the densest text on the page
  quiet: 'text-[#c8a6ee]', // notes and small print — lilac
  label: 'text-[#ffaa2a]', // uppercase row labels
  slot: 'text-[#f3b0ff]', // placeholders — orchid, never a fact
};

/**
 * The section rule. The static ember track is the section's own `border-t`;
 * this draws a brighter line over it, and a small gold spark rides the head of
 * that line to the far end. Decorative, so it is `aria-hidden`.
 */
function SectionRule() {
  return (
    <span aria-hidden="true" className="pv-rule">
      <span className="pv-rule-line" />
      <span className="pv-rule-run">
        <span className="pv-rule-spark" />
      </span>
    </span>
  );
}

/** Section shell: an ember-ruled heading with a small ordinal, then the body. */
function Section({ ordinal, title, lede, children, id }) {
  return (
    <section
      id={id}
      className="relative border-t border-[#ff6d05]/15"
      style={{ paddingTop: fluid(2), marginTop: fluid(2) }}
    >
      <SectionRule />
      <div className="flex items-baseline gap-3">
        <span
          aria-hidden="true"
          className="pv-focus-ord shrink-0 font-semibold tabular-nums tracking-[0.1em] text-[#ff6d05]"
          style={{ fontSize: fluidText(0.72, 0.68) }}
        >
          {ordinal}
        </span>
        <h2
          className="font-semibold uppercase tracking-[0.14em] text-[#ffaa2a]"
          style={{ fontSize: fluidText(0.92, 0.84) }}
        >
          {/* The focus pull animates this span, not the h2, so the heading's
              box — and the layout under it — never moves. */}
          <span className="pv-focus">{title}</span>
        </h2>
      </div>
      <span aria-hidden="true" className="pv-under" />
      {lede ? (
        <p
          className={`pv-lede mt-3 max-w-[68ch] ${INK.body}`}
          style={{ fontSize: fluidText(0.97, 0.88), lineHeight: 1.62 }}
        >
          {lede}
        </p>
      ) : null}
      <div style={{ marginTop: fluid(1.25) }}>{children}</div>
    </section>
  );
}

/**
 * One record as a block, not a table row.
 *
 * `<dl>` rather than `<table>` throughout this page, and it is a responsiveness
 * decision as much as a semantic one. Most of this content is genuinely
 * key→value, which is what a definition list is for — and a four-column table
 * cannot be made to work at 320px without either horizontal scrolling or CSS
 * that lies to assistive technology about the structure. A stacked definition
 * list is correct at every width with no breakpoint at all.
 */
function Record({ heading, rows, note }) {
  return (
    <div className="pv-record relative rounded-lg border border-[#ffcd5b]/[0.12] bg-white/[0.02] p-4 sm:p-5">
      <h3
        className={`pv-row font-medium ${INK.title}`}
        style={{ fontSize: fluidText(0.98, 0.9) }}
      >
        {heading}
      </h3>
      {note ? (
        <p
          className={`mt-1.5 ${INK.quiet}`}
          style={{ fontSize: fluidText(0.8, 0.75) }}
        >
          {note}
        </p>
      ) : null}
      <dl className="mt-3 space-y-2.5">
        {rows.map(([label, value]) => (
          <div key={label} className="pv-row sm:flex sm:gap-4">
            <dt
              className={`shrink-0 font-medium uppercase tracking-[0.1em] sm:w-32 ${INK.label}`}
              style={{ fontSize: fluidText(0.68, 0.65) }}
            >
              {label}
            </dt>
            <dd
              className={`mt-1 sm:mt-0 sm:flex-1 ${INK.value}`}
              style={{ fontSize: fluidText(0.88, 0.82), lineHeight: 1.6 }}
            >
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** A monospace key name, so a reader can match it against their own devtools. */
function KeyName({ children, prefix }) {
  return (
    <code
      className="break-all rounded bg-black/40 px-1.5 py-0.5 font-mono text-[#ffb066]"
      style={{ fontSize: fluidText(0.79, 0.74) }}
    >
      {children}
      {prefix ? <span className={INK.slot}>&lt;account&gt;</span> : null}
    </code>
  );
}

/**
 * The storage-lifetime pill. It is shorthand, not a fact, so it wears the
 * orchid placeholder voice. The dot's fill also carries the lifetime, as well
 * as the text: solid means it persists, hollow means it goes when the tab closes.
 */
function LifetimePill({ kind }) {
  const session = kind === 'sessionStorage';
  return (
    <span
      className={`pv-chip inline-flex items-center gap-1.5 rounded-full border border-[#fc83ff]/40 bg-[#fc83ff]/[0.07] px-2 py-0.5 ${INK.slot}`}
      style={{ fontSize: fluidText(0.66, 0.63) }}
    >
      <span
        aria-hidden="true"
        className={
          session
            ? 'h-1.5 w-1.5 rounded-full border border-[#fc83ff]'
            : 'h-1.5 w-1.5 rounded-full bg-[#fc83ff]'
        }
      />
      {session ? 'this tab only' : 'until you clear it'}
    </span>
  );
}

export default function PrivacyPolicy() {
  // Grouped here rather than in the inventory so the data module stays a flat,
  // greppable list — which is what the drift test reads and what a person
  // auditing it should see. Presentation groups the list; it does not own it.
  const grouped = Object.entries(STORAGE_GROUPS)
    .map(([id, label]) => ({
      id,
      label,
      keys: STORAGE_KEYS.filter((entry) => entry.group === id),
    }))
    // A group with no keys left renders nothing rather than an empty heading.
    .filter((group) => group.keys.length > 0);

  return (
    <div
      className="mx-auto w-full max-w-3xl"
      style={{ paddingBottom: fluid(3) }}
    >
      {/* ── Standfirst ──────────────────────────────────────────────────────── */}
      {/* Reading rail — the same two pixels /cv and /notes carry, for the same
          reason: a long document a reader wants to know the end of. */}
      <div aria-hidden="true" className="pv-progress" />

      <p
        className={`pv-lede max-w-[68ch] ${INK.body}`}
        style={{
          fontSize: fluidText(1.08, 0.95),
          lineHeight: 1.62,
          marginTop: fluid(1),
        }}
      >
        This page was written by reading the source of this site, not by filling
        in a template. Everything below names the file it came from, so you can
        check any claim on it against{' '}
        <a
          href="https://github.com/MA1002643/theabdullahfolio"
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-sm text-[#ff8a1e] underline decoration-[#ff8a1e]/40 underline-offset-[3px] hover:decoration-[#ff6d05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff6d05] focus-visible:ring-offset-2 focus-visible:ring-offset-night-950"
        >
          the code
        </a>{' '}
        rather than taking my word for it.
      </p>

      {/* ── The short version ───────────────────────────────────────────────── */}
      <div
        className="pv-record relative rounded-xl border border-[#ff6d05]/25 bg-[#ff6d05]/[0.04] p-5 sm:p-6"
        style={{ marginTop: fluid(1.75) }}
      >
        <h2
          className="font-semibold uppercase tracking-[0.16em] text-[#ffaa2a]"
          style={{ fontSize: fluidText(0.74, 0.7) }}
        >
          <span className="pv-focus">The short version</span>
        </h2>
        <ul
          className={`mt-3 space-y-2 ${INK.body}`}
          style={{ fontSize: fluidText(0.97, 0.88), lineHeight: 1.6 }}
        >
          {[
            'I sell nothing, share nothing with advertisers, and run no third-party profiling of any kind.',
            'Analytics are off until you switch them on, and nothing is even downloaded before you do.',
            'The only cookies here are the guestbook sign-in, set if you choose to sign in and not otherwise.',
            'Everything else is kept on your own device, for your benefit. The one exception is a contact message you send while offline: it waits on your device, then reaches me once you are back online.',
          ].map((line) => (
            <li key={line} className="pv-row flex gap-3">
              <span
                aria-hidden="true"
                className="pv-dot mt-[0.6em] h-1.5 w-1.5 shrink-0 rounded-full bg-[#ff6d05]"
              />
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* ── The live choice. The one thing on this page that is not static ─── */}
      <ConsentStatusPanel />

      <Section
        ordinal="01"
        id="analytics"
        title="What is measured, if you allow it"
        lede={`${countWord(ANALYTICS_SURFACES.length)} scripts, treated as one
        decision because they answer one question between them: which pages are
        worth keeping. If you have not agreed, none of them is loaded — not
        loaded and idle, not loaded and denied. Your browser makes no request to
        any of them at all.`}
      >
        <div className="space-y-3">
          {ANALYTICS_SURFACES.map((surface) => (
            <Record
              key={surface.name}
              heading={surface.name}
              rows={[
                ['Processor', surface.processor],
                ['Collects', surface.collects],
                ['Source', <KeyName key="s">{surface.source}</KeyName>],
              ]}
            />
          ))}
        </div>
      </Section>

      <Section
        ordinal="02"
        id="cookies"
        title="Cookies"
        lede={`${countWord(COOKIE_COUNT)}, all from the guestbook sign-in, and
        none of them set unless you choose to sign in. None is an analytics or
        advertising cookie, and none needs your consent — each is strictly
        necessary for the feature you deliberately asked for. They are listed
        anyway, because a disclosure you only make when legally forced to is not
        much of a disclosure.`}
      >
        <div className="space-y-3">
          {COOKIES.map((cookie) => (
            <Record
              key={cookie.name}
              heading={<KeyName>{cookie.name}</KeyName>}
              rows={[
                ['Set when', cookie.setWhen],
                ['Purpose', cookie.purpose],
                ['Lifetime', cookie.lifetime],
              ]}
            />
          ))}
        </div>
      </Section>

      <Section
        ordinal="03"
        id="device"
        title="Kept on your device"
        lede="Written to your browser's own storage and read back by your browser.
        None of it reaches me, and none of it identifies you — it is how the site
        remembers that you have been here before. Named individually rather than
        summarised, so you can match any of them against your own devtools."
      >
        <div className="space-y-5">
          {grouped.map((group) => (
            <div key={group.id}>
              <h3
                className={`pv-row font-medium uppercase tracking-[0.12em] ${INK.label}`}
                style={{ fontSize: fluidText(0.72, 0.68) }}
              >
                {group.label}
              </h3>
              <dl
                className="pv-record relative mt-2.5 divide-y divide-[#ffcd5b]/[0.08] rounded-lg border border-[#ffcd5b]/[0.12] bg-white/[0.02]"
              >
                {group.keys.map((entry) => (
                  <div key={entry.key} className="pv-row p-3.5 sm:p-4">
                    <dt className="flex flex-wrap items-center gap-2">
                      <KeyName prefix={entry.prefix}>{entry.key}</KeyName>
                      <LifetimePill kind={entry.kind} />
                    </dt>
                    <dd
                      className={`mt-1.5 ${INK.value}`}
                      style={{ fontSize: fluidText(0.88, 0.82), lineHeight: 1.6 }}
                    >
                      {entry.purpose}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
        <p
          className={`pv-lede mt-4 ${INK.quiet}`}
          style={{ fontSize: fluidText(0.85, 0.79), lineHeight: 1.6 }}
        >
          You can delete all of it at any time from your browser&rsquo;s site
          settings, and I could not reach it if I wanted to. This list is checked
          against the code by a test that fails the build if a new key is added
          without appearing here, which is why it is worth trusting.
        </p>
      </Section>

      <Section
        ordinal="04"
        id="third-parties"
        title="Who else is involved"
        lede="Each of these receives something because of an action you took, so
        none of them is behind a toggle — a switch that could refuse the contact
        form its own mail delivery would be theatre. What is owed here is telling
        you plainly, before you act."
      >
        <div className="space-y-3">
          {PROCESSORS.map((processor) => (
            <Record
              key={processor.name}
              heading={processor.name}
              note={processor.role}
              rows={[
                ['What happens', processor.detail],
                ['Triggered by', processor.initiated],
                ...(processor.source
                  ? [['Source', <KeyName key="s">{processor.source}</KeyName>]]
                  : []),
              ]}
            />
          ))}
        </div>
      </Section>

      <Section
        ordinal="05"
        id="server"
        title="What exists on a server afterwards"
        lede="For most visits the answer is nothing with your name on it. Where
        something is kept, this says what it contains and for how long — an
        actual interval where there is one, and the word indefinitely where there
        is not."
      >
        <div className="space-y-3">
          {SERVER_DATA.map((row) => (
            <Record
              key={row.what}
              heading={row.what}
              rows={[
                ['Contains', row.contains],
                ['Kept for', row.retention],
                ['Who sees it', row.visibility],
                ['Source', <KeyName key="s">{row.source}</KeyName>],
              ]}
            />
          ))}
        </div>
      </Section>

      <Section
        ordinal="06"
        id="not-tracking"
        title="Things that look like tracking and are not"
        lede={`A footer that names a town and a widget that names a song look
        exactly like the output of surveillance. They are the opposite: all
        ${countWord(NOT_VISITOR_DATA.length).toLowerCase()} are data about me,
        identical for every visitor, and none of them reads anything about you.`}
      >
        <div className="space-y-3">
          {NOT_VISITOR_DATA.map((row) => (
            <Record
              key={row.what}
              heading={row.what}
              rows={[
                ['What it is', row.detail],
                ['Source', <KeyName key="s">{row.source}</KeyName>],
              ]}
            />
          ))}
        </div>
      </Section>

      <Section
        ordinal="07"
        id="rights"
        title="What you can ask me to do"
        lede="Written as what I will actually do, rather than as a recital of the
        statute. A recital cannot be checked; a promise can."
      >
        <dl className="pv-record relative divide-y divide-[#ffcd5b]/[0.08] rounded-lg border border-[#ffcd5b]/[0.12] bg-white/[0.02]">
          {RIGHTS.map((row) => (
            <div key={row.right} className="pv-row p-4 sm:p-5">
              <dt
                className={`font-medium ${INK.title}`}
                style={{ fontSize: fluidText(0.95, 0.88) }}
              >
                {row.right}
              </dt>
              <dd
                className={`mt-1.5 ${INK.value}`}
                style={{ fontSize: fluidText(0.88, 0.82), lineHeight: 1.6 }}
              >
                {row.answer}
              </dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section ordinal="08" id="contact" title="Asking me anything">
        <p
          className={`pv-lede max-w-[68ch] ${INK.body}`}
          style={{ fontSize: fluidText(0.97, 0.88), lineHeight: 1.62 }}
        >
          I am the only person who handles any of this — there is no team, no
          data-protection officer and no ticket queue. Email{' '}
          <a
            href={`mailto:${IDENTITY.email}`}
            className="break-all rounded-sm text-[#ff8a1e] underline decoration-[#ff8a1e]/40 underline-offset-[3px] hover:decoration-[#ff6d05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff6d05] focus-visible:ring-offset-2 focus-visible:ring-offset-night-950"
          >
            {IDENTITY.email}
          </a>{' '}
          and it reaches me directly. I am based in {IDENTITY.locality},{' '}
          {IDENTITY.region}, which makes the UK Information Commissioner&rsquo;s
          Office the regulator if you would rather go to them &mdash; though I
          would much rather you came to me first.
        </p>
        <p
          className={`pv-lede mt-5 border-t border-[#ffcd5b]/[0.12] pt-4 ${INK.quiet}`}
          style={{ fontSize: fluidText(0.82, 0.77) }}
        >
          Last materially changed {UPDATED_LABEL}. That date moves when what you
          are agreeing to changes, not when a sentence is reworded &mdash; and a
          material change re-asks you, because the version of this notice you
          answered is stored alongside your answer.
        </p>
      </Section>
    </div>
  );
}
