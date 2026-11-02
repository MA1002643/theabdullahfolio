import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { journeyData, projectsData } from '@/app/data';
import { localizeCategory, localizeJourneyEntry, localizeProject } from '@/i18n/data';
import { getDataT } from '@/i18n/getDataT';
import { DEFAULT_LOCALE } from '@/i18n/locales';

import {
  email as publicEmail,
  linkedInUrl,
  profileGithubUrl,
  resumeUrl,
} from '@/components/footer/footer-data';

// The /cv document (issue #32, W1c).
//
// A SERVER component, with no 'use client' anywhere beneath it. That is the
// central decision of this file, and it is deliberate rather than incidental:
// this is the one route on the site whose whole value is the text, read by a
// crawler, an assistant and a person skimming on a phone. It ships zero
// JavaScript, needs no hydration, and its content is complete in the HTML the
// server sends — which is also why it carries none of the site's reveal
// choreography. docs/seo.md §5 notes that the reveal animations elsewhere start
// SSR'd text at `opacity: 0`; a CV is the wrong document to make anyone wait
// for, and the wrong one to hand a crawler with its content transparent.
//
// ── Print ───────────────────────────────────────────────────────────────────
// `print:` variants throughout. Someone WILL print this or save it as a PDF —
// it is a CV — and the page's dark editorial palette prints as a solid black
// rectangle that empties a toner cartridge. The print rules invert to ink on
// white and drop the decorative chrome. This is not a second stylesheet: it is
// the same markup, which is what keeps the two in step.

// ── The colour pass ─────────────────────────────────────────────────────────
// The page had drifted to a single hue: name, role, location, links, role
// names, companies and dates were all some value of the same gold, so nothing
// in the document carried rank — a CV where everything is emphasised is a CV
// where nothing is. The pass below gives the page three voices and no more,
// each one already spoken elsewhere on the site so /cv still reads as the same
// product rather than a page that wandered in:
//
//   EMBER  #ff6d05 — the PAGE TITLE's own fill (`.text-glow-stroke-neon`).
//                    Reserved for the spine of the record: the name, every
//                    role and project name, every date.
//   PINK   #fc83ff — the PAGE SUBTITLE's fill. The other kind of identity —
//                    the job title, and the company a role sat inside.
//   AQUA   #5ee6c4 — the single cool note, complementary to the ember (and the
//                    reason the warm text now reads warmer). Worn ONLY by
//                    plain-text links, so "this is a link" is one colour the
//                    reader learns once and then spots at a glance. The
//                    location takes the adjacent ice blue, which groups the
//                    masthead's two quiet facts together under the metal name
//                    instead of leaving them as two unrelated greys.
//
// SIZE, not just hue, decides how much treatment each one gets. The page title
// carries a 3px stroke and a triple halo at 80px; a 12px mono date cannot — at
// that size a glow is a smudged stem, not a glow. So the ember appears three
// ways: brushed metal on the 36px name, a soft halo on the 16–18px names, and
// dead flat on the 12px dates.

// The name's brushed metal, kept entirely inside the title's hue. A metal ramp
// is not simply light-to-dark: it is highlight → body → a HARD horizon where
// the surface turns away from the light → bounce light → body again. The
// 44%/51%/57% cluster is that horizon, and #ff6d05 sits on BOTH sides of it,
// which is what keeps "the same colour as the title" literally true while the
// sheen plays over it. The filter supplies the bevel — a dark bottom edge and
// a light top edge one pixel apart read as thickness — and closes with the
// page title's own warm halo at the lower intensity a 36px line can carry.
const NAME_METAL =
  '[background-image:linear-gradient(180deg,#ffd7ab_0%,#ff9a3d_20%,#ff6d05_44%,#9e3800_51%,#ff7d15_57%,#ffbe80_76%,#ff6d05_100%)] bg-clip-text text-transparent [-webkit-text-fill-color:transparent] [filter:drop-shadow(0_1px_0_rgba(0,0,0,0.55))_drop-shadow(0_-1px_0_rgba(255,214,168,0.22))_drop-shadow(0_0_14px_rgba(255,106,0,0.40))]';

// Print reset for every element whose colour is a gradient clipped to its own
// glyphs. WITHOUT THIS THE TEXT PRINTS INVISIBLE: `print:text-black` sets
// `color`, but the glyph fill is being erased by `-webkit-text-fill-color` and
// painted by a background image the printer drops, so the paper gets blank
// space exactly where the name and every description should be. On the one
// page that is guaranteed to be printed, that is the difference between a CV
// and an empty sheet.
//
// It is also the reason this whole pass is written as CLASSES rather than the
// `style={{}}` objects the contact form uses: an inline style outranks any
// `@media print` rule, so the same markup with inline gradients could not be
// corrected for print at all without `!important`.
const PRINT_INK =
  'print:[background-image:none] print:bg-clip-border print:[-webkit-text-fill-color:#000] print:[filter:none] print:text-black';

// A name at body scale: the title's colour, plus the restrained halo that
// `.project-title` already uses for exactly this job elsewhere on the site.
const EMBER_NAME =
  'text-[#ff6d05] [text-shadow:0_0_6px_rgba(255,109,5,0.45),0_0_16px_rgba(255,109,5,0.18)]';

// Dates and the other mono metadata: the title's colour, FLAT. See the note on
// size above — a halo on 12px uppercase mono fills in the counters and costs
// legibility for no visible gain.
const EMBER_META = 'text-[#ff6d05]';

// The company a role sat inside, and the job title in the masthead — the same
// pink the page subtitle is already wearing a few hundred pixels above. Against
// the near-black backdrop this lands around 9:1, where the gold it replaces was
// the weakest contrast on the page.
const PINK_ORG = 'text-[#fc83ff] [text-shadow:0_0_10px_rgba(252,131,255,0.35)]';

// Links. One colour for every plain-text link on the page, brightening on hover
// rather than shifting hue — a hue change on hover reads as a different KIND of
// thing, not the same thing under the pointer.
const LINK_AQUA =
  'text-[#5ee6c4] decoration-[#5ee6c4]/40 hover:text-[#9ffce6] hover:decoration-[#9ffce6]/70';

// ── Language (issue #82) ─────────────────────────────────────────────────────
// The document is translated; the PDF it offers is not (it is the artifact
// people attach, and it stays English — the link says so with `hreflang`).
// `buildCv()` stays the English model: the JSON-LD reads it, and it is what
// the consistency tests pin against the PDF. The localisation happens here,
// at the last step, from the SAME journey and project records the model was
// derived from (matched by id), through the shared data helpers — so the role,
// description, tags and date range a reader sees are exactly what /journey
// prints for that entry in their language. Organisation and tool names are
// never translated.
function localizeEntry(entry, dataT, locale) {
  const source = journeyData.find((d) => d.id === entry.id);
  if (!source) return entry;
  const local = localizeJourneyEntry(source, dataT, locale);
  if (local === source) return entry;
  const [role] = String(local.title ?? '').split(' · ');
  return {
    ...entry,
    role: role.trim() || entry.role,
    dates: local.dateLabel,
    description: local.description,
    tags: local.tags,
  };
}

function localizeCv(cv, dataT, locale) {
  if (locale === DEFAULT_LOCALE) return cv;
  const entry = (e) => localizeEntry(e, dataT, locale);
  return {
    ...cv,
    experience: cv.experience.map(entry),
    education: cv.education.map(entry),
    activities: cv.activities.map(entry),
    projects: cv.projects.map((project) => {
      const source = projectsData.find((p) => p.id === project.id);
      return {
        ...project,
        description: source ? localizeProject(source, dataT).description : project.description,
        category: localizeCategory(project.category, dataT),
      };
    }),
  };
}

/** One dated row — a role, an award, or a representation post. */
function Entry({ entry }) {
  return (
    <li className="cv-entry cv-reveal relative border-s border-white/10 ps-5 print:border-s-0 print:ps-0">
      {/* The rule's marker. `aria-hidden` because the list semantics already
          convey "one of several" — a screen reader announcing a bullet glyph
          here would be reading out decoration. */}
      <span
        aria-hidden="true"
        className="cv-marker absolute -start-[3px] top-2 h-[5px] w-[5px] rounded-full bg-[#ff6d05] print:hidden"
      />

      {/* Role and dates on one row at desktop, stacked on a phone. The dates
          are a <time>-adjacent fact but NOT a <time> element: `dateLabel` is a
          human RANGE ("APR 2026 →"), and `datetime` takes a single point or a
          duration — marking a range up as one would be wrong in the machine
          half while looking right in the visible half. The machine-readable
          dates for this history are in the JSON-LD, where they belong. */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
        <h3
          className={`text-base font-medium sm:text-lg print:text-black ${EMBER_NAME}`}
        >
          {entry.role}
          {/* The separator drops to a neutral. It sits between the two
              strongest colours on the row, and a third colour there would turn
              a clean ember-to-pink pairing into a traffic light. */}
          <span className="text-foreground/35 [text-shadow:none] print:text-neutral-600">
            {' · '}
          </span>
          <span className={`${PINK_ORG} print:text-black`}>{entry.org}</span>
        </h3>
        <p
          className={`shrink-0 font-mono text-xs uppercase tracking-wider print:text-neutral-600 ${EMBER_META}`}
        >
          {entry.dates}
        </p>
      </div>

      {/* The Architect-of-Enchantment fill. `.text-fire-amber` IS that
          paragraph's colour — the same gold→ember ramp clipped to the glyphs
          under the same warm halo (globals.css; src/lib/fireRamp.js mirrors the
          stops for the About page's per-word variant).

          What is deliberately NOT copied is the per-word scroll scrub. That
          exists because the About paragraph animates each word's opacity, and
          a single clip on the parent would paint the words regardless of it
          inside a GPU-promoted card. Nothing here animates, so the parent clip
          is both safe and correct — and this page ships no JavaScript to drive
          a scrub with. */}
      <p
        className={`mt-2 max-w-prose text-sm leading-relaxed text-fire-amber ${PRINT_INK}`}
      >
        {entry.description}
      </p>

      {entry.tags.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-x-2 gap-y-1.5">
          {entry.tags.map((tag) => (
            <li
              key={tag}
              className="cv-tag rounded-full border border-[#ffaa2a]/25 px-2.5 py-0.5 text-[11px] uppercase tracking-wide text-[#ffaa2a] print:border-neutral-400 print:text-black"
            >
              {tag}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

/** A titled block. The `<h2>` is what gives the page its heading outline. */
function Section({ title, children }) {
  return (
    <section className="mt-12 first:mt-0 print:mt-8">
      {/* The reveal is attached to the heading and its rule INDIVIDUALLY, never
          to the <section>. A reveal on the section would fade the whole block
          — heading, every entry, every tag — as one object, which is the thing
          that makes a page look animated rather than composed. Per-element
          timelines are what let the rows arrive in sequence behind their
          heading. */}
      <h2 className="cv-reveal font-mono text-xs uppercase tracking-[0.2em] text-[#ffaa2a] print:text-black">
        {title}
      </h2>
      <div className="elite-divider cv-rule mt-2 h-px w-full opacity-40 print:hidden" />
      <div className="mt-5">{children}</div>
    </section>
  );
}

export default async function Cv({ cv: model, locale = DEFAULT_LOCALE }) {
  const t = await getTranslations({ locale, namespace: 'Cv' });
  const dataT = await getDataT(locale);
  const english = locale === DEFAULT_LOCALE;
  const cv = localizeCv(model, dataT, locale);
  const { identity, experience, education, activities, skills, projects } = cv;

  return (
    <article className="mx-auto w-full max-w-3xl px-1 pb-24 print:max-w-none print:px-0 print:pb-0">
      {/* Reading progress. `aria-hidden` and empty: it states nothing a screen
          reader cannot already get from the document itself, and announcing a
          scroll position would be noise. It is driven entirely by
          `scroll(root block)` in globals.css — one element, no listener, no
          script — and where scroll timelines are unsupported it simply stays
          at `scaleX(0)` and never appears, which is the right outcome for an
          ornament. A CV is a document people skim to the end of, so showing
          how much is left earns its two pixels. */}
      <div aria-hidden="true" className="cv-progress print:hidden" />

      {/* ── Masthead ────────────────────────────────────────────────────── */}
      <header>
        {/* A <p>, NOT an <h1>. `PageTitle` above already renders this route's
            single `<h1>` ("CV"), matching every other sub-page, and the e2e
            suite asserts exactly one per document — a second heading here would
            fail that check and, more to the point, would give the page two
            competing titles in its outline.

            The name still does the work it needs to: it is the <title>, it is
            the `Person` node's `name` in the JSON-LD, and it is the largest
            text in the printed copy (where `PageTitle` is hidden, so this is
            the only name on the page). None of that needs a heading ELEMENT.

            It is also the only place on /cv that earns the brushed metal: one
            line, set large, that the eye lands on first. Used twice it would
            stop being a treatment and start being the page's texture. */}
        <p
          translate="no"
          className={`text-3xl font-semibold tracking-tight sm:text-4xl ${NAME_METAL} ${PRINT_INK}`}
        >
          {identity.name}
        </p>
        <p className={`mt-1.5 text-lg ${PINK_ORG} print:text-black`}>
          {english ? identity.role : t('identity.role')}
        </p>

        {/* Contact row. Every value here is already public — the footer prints
            the same address on every page — so nothing is exposed that was not
            already. `RECEIVER_EMAIL` (the server-only delivery inbox) is a
            different variable and never reaches a client bundle; see the note
            beside `email` in footer-data.js. Names, a town, an address and two
            brands: translate="no", so neither a browser translator nor the
            pseudo-locale gate treats them as prose. */}
        <ul translate="no" className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm print:text-black">
          {/* Ice blue: the cool family's quiet end. It pairs with the aqua
              links beside it, so the masthead's metadata reads as one cool
              block sitting under the warm name. */}
          <li className="text-[#8fd6ff] [text-shadow:0_0_10px_rgba(143,214,255,0.28)] print:text-black">
            {identity.location}
          </li>
          <li aria-hidden="true" className="text-[#5ee6c4]/45">
            ·
          </li>
          <li>
            <a
              className={`underline underline-offset-4 transition-colors print:text-black ${LINK_AQUA}`}
              href={`mailto:${publicEmail}`}
            >
              {publicEmail}
            </a>
          </li>
          <li aria-hidden="true" className="text-[#5ee6c4]/45">
            ·
          </li>
          <li>
            <a
              className={`underline underline-offset-4 transition-colors print:text-black ${LINK_AQUA}`}
              href={profileGithubUrl}
              rel="noopener noreferrer"
              target="_blank"
            >
              GitHub
            </a>
          </li>
          <li aria-hidden="true" className="text-[#5ee6c4]/45">
            ·
          </li>
          <li>
            <a
              className={`underline underline-offset-4 transition-colors print:text-black ${LINK_AQUA}`}
              href={linkedInUrl}
              rel="noopener noreferrer"
              target="_blank"
            >
              LinkedIn
            </a>
          </li>
        </ul>

        {/* The PDF, offered rather than forced. This is the inverse of the old
            footer behaviour, where the only CV affordance on the site was a
            download — which a phone reader has to commit to before seeing a
            word of it. `print:hidden` because a printed copy IS the PDF's job,
            and a printed page telling the reader to download a PDF is noise.

            The surface is the contact form's send button, reproduced exactly:
            `.custom-bg-abt` (its slate-and-gold interior, gold neon border and
            ember box-shadow) under flat #ff6d05 text with no glow, and the same
            0 0 8px / 0 0 20px ember bloom on hover. What does NOT carry over is
            the motion — the magnetic lean, the scale spring and the slice sweep
            are all Framer, and this page has no client runtime. The colour is
            the whole of what transfers, which is what was asked for;
            `.btn-slice` was only ever `position: relative` for those animated
            overlays, so nothing visual is lost by dropping it. */}
        <p className="mt-6 print:hidden">
          <a
            className="custom-bg-abt inline-flex items-center justify-center gap-2 rounded-full px-6 py-2 text-sm font-semibold tracking-wide text-[#ff6d05] shadow-sm transition-[box-shadow,opacity] duration-300 hover:shadow-[0_0_8px_rgba(255,109,5,0.65),0_0_20px_rgba(255,109,5,0.4)]"
            href={resumeUrl}
            hrefLang="en"
            rel="noopener noreferrer"
            target="_blank"
          >
            {t('downloadPdf')}
            <span aria-hidden="true">↓</span>
          </a>
        </p>
      </header>

      <Section title={t('sections.experience')}>
        <ul className="flex flex-col gap-8">
          {experience.map((entry) => (
            <Entry key={entry.id} entry={entry} />
          ))}
        </ul>
      </Section>

      <Section title={t('sections.education')}>
        <ul className="flex flex-col gap-8">
          {education.map((entry) => (
            <Entry key={entry.id} entry={entry} />
          ))}
        </ul>
      </Section>

      {/* Rendered only when the data has any. An empty section with a heading
          and a rule beneath it reads as something missing rather than something
          absent — and `journeyData` genuinely might not carry a milestone
          entry after a future edit. */}
      {activities.length > 0 && (
        <Section title={t('sections.representation')}>
          <ul className="flex flex-col gap-8">
            {activities.map((entry) => (
              <Entry key={entry.id} entry={entry} />
            ))}
          </ul>
        </Section>
      )}

      <Section title={t('sections.skills')}>
        <dl className="flex flex-col gap-4">
          {skills.map((group) => (
            <div key={group.group} className="cv-reveal sm:flex sm:gap-6">
              {/* A description list, not a heading plus paragraphs: these ARE
                  term/definition pairs, and the semantics let a screen reader
                  jump group to group rather than reading one long run of
                  comma-separated names.

                  The pairs take the same two roles the dated rows do — the
                  term is metadata in the mono voice (so, the date colour), the
                  definition is prose (so, the Architect fill). */}
              <dt
                className={`w-28 shrink-0 font-mono text-xs uppercase tracking-wider print:text-neutral-600 ${EMBER_META}`}
              >
                {t.has(`skillGroups.${group.group}`)
                  ? t(`skillGroups.${group.group}`)
                  : group.group}
              </dt>
              <dd
                className={`mt-1 text-sm leading-relaxed text-fire-amber sm:mt-0 ${PRINT_INK}`}
              >
                {group.items.join(' · ')}
              </dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section title={t('sections.projects')}>
        <ul className="flex flex-col gap-5">
          {projects.map((project) => (
            <li key={project.id} className="cv-reveal">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
                {/* A real internal link to the project's own page — this is the
                    crawl edge that stops /cv being the dead end the PDF is
                    (F8). It is also the useful thing for a reader: the detail
                    page is where the screenshots are.

                    A project name is the same rank as a role name, so it takes
                    the same ember. It is the one link on the page that is NOT
                    aqua — its colour is already carrying "this is an entry
                    title", and the underline is what still marks it a link. */}
                <h3 className={`text-base print:text-black ${EMBER_NAME}`}>
                  <Link
                    className="underline decoration-[#ff6d05]/40 underline-offset-4 transition-colors hover:text-[#ffd27d] hover:decoration-[#ffd27d]/60"
                    href={`/projects/${project.id}`}
                  >
                    {project.name}
                  </Link>
                </h3>
                <p
                  className={`shrink-0 font-mono text-xs uppercase tracking-wider print:text-neutral-600 ${EMBER_META}`}
                >
                  {project.category}
                </p>
              </div>
              <p
                className={`mt-1 max-w-prose text-sm leading-relaxed text-fire-amber ${PRINT_INK}`}
              >
                {project.description}
              </p>
            </li>
          ))}
        </ul>

        {/* Plain-text links, so they wear the link colour rather than the entry
            colour above them — one hue meaning "link" is the whole point of
            having a link hue at all. */}
        <p className="cv-reveal mt-6 text-sm print:text-black">
          <Link
            className={`underline underline-offset-4 transition-colors print:text-black ${LINK_AQUA}`}
            href="/projects"
          >
            {t('allProjects')}
          </Link>
          <span className="text-[#5ee6c4]/45"> · </span>
          <Link
            className={`underline underline-offset-4 transition-colors print:text-black ${LINK_AQUA}`}
            href="/journey"
          >
            {t('asTimeline')}
          </Link>
        </p>
      </Section>
    </article>
  );
}
