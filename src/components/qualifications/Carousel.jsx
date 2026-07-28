'use client';
import React, {
  useState,
  useMemo,
  useEffect,
  useLayoutEffect,
  useRef,
} from 'react';
import Image from 'next/image';
import { toast } from 'sonner';
import ScrollHijackCategories from '@/components/shared/ScrollHijackCategories';
import DIMS from './_dimensions.json';
import { preloadQualificationCerts } from './preloadCerts';
import { certSizes } from './certSizes';

// Visibility/mount thresholds for the carousel. Stored as named
// constants so the opacity/pointer-events logic below stays in sync
// with the mount logic — bumping RENDER_WINDOW won't accidentally
// leave invisible-but-mounted ghost cards.
//
//   absOffset 0..OPAQUE_WINDOW : fully visible, opacity 1
//   absOffset RENDER_WINDOW    : edge of the wheel, opacity 0.55
//   absOffset > RENDER_WINDOW  : not rendered at all
const RENDER_WINDOW = 3;
const OPAQUE_WINDOW = 2;

// Index of the middle card in a list — the carousel opens centred so the first
// paint mounts the correct window (see the useState initialiser below). Pure
// (closes over no component state), so it lives at module scope: stable
// identity, never recreated per render, and safe to call from both the
// useState initialiser AND the recenter effect without ever becoming an effect
// dependency.
const initialIndex = (cards) =>
  cards.length > 0 ? Math.floor(cards.length / 2) : 0;

// Look up the aspect ratio for an image path like "/qualifications/foo.webp".
// Derived from width/height so a single source of truth in the JSON can't
// drift out of sync. Falls back to A4 portrait if the entry is missing or
// malformed so the layout never crashes.
const aspectFor = (img) => {
  const slug = img
    .split('/')
    .pop()
    .replace(/\.webp$/, '');
  const dims = DIMS[slug];
  if (dims?.width && dims?.height) return dims.width / dims.height;
  return 0.71;
};

const CATEGORY_TREE = {
  All: null,
  Education: ['School', 'College', 'University'],
  Employment: ['Security', 'Tech'],
};

const PARENT_CATEGORIES = Object.keys(CATEGORY_TREE);

const CARDS = [
  // Education > School
  {
    id: 25,
    title: 'BCS Level 2 ECDL Certificate',
    category: 'Education',
    sub: 'School',
    img: '/qualifications/bcs-level-2-ecdl-certificate-it-application-skills-(qcf).webp',
  },

  // Education > College
  {
    id: 2,
    title: 'Spoken English (GESE) Speaking and Listening (Entry 3)',
    category: 'Education',
    sub: 'College',
    img: '/qualifications/b1-certificate.webp',
  },
  {
    id: 23,
    title: 'Attendance certificate',
    category: 'Education',
    sub: 'College',
    img: '/qualifications/attendance-certificate.webp',
  },
  {
    id: 24,
    title: 'Attitude to Learning',
    category: 'Education',
    sub: 'College',
    img: '/qualifications/Attitude-to-learning-certificate.webp',
  },
  {
    id: 26,
    title: 'Behaviour certificate',
    category: 'Education',
    sub: 'College',
    img: '/qualifications/behaviour-certificate.webp',
  },
  {
    id: 33,
    title: 'Enrichment Certificate',
    category: 'Education',
    sub: 'College',
    img: '/qualifications/enrichment-certificate.webp',
  },
  {
    id: 34,
    title: 'GCSE English',
    category: 'Education',
    sub: 'College',
    img: '/qualifications/gcse-english.webp',
  },
  {
    id: 35,
    title: 'GCSE Mathematics',
    category: 'Education',
    sub: 'College',
    img: '/qualifications/gcse-maths.webp',
  },
  {
    id: 36,
    title: 'Learner Voice Award 2020-2021',
    category: 'Education',
    sub: 'College',
    img: '/qualifications/learner-voice-award-2020-2021.webp',
  },
  {
    id: 38,
    title: 'Lockdown Legend Certificate',
    category: 'Education',
    sub: 'College',
    img: '/qualifications/lockdown-legend-certificate.webp',
  },
  {
    id: 40,
    title: 'OCNLR Entry Level Certificate in Digital Skills (Entry 3)',
    category: 'Education',
    sub: 'College',
    img: '/qualifications/ocnlr-entry-level-certificate-in-digital-skills-entry-3.webp',
  },
  {
    id: 41,
    title: 'OCNLR Level 1 Certificate in Digital Skills',
    category: 'Education',
    sub: 'College',
    img: '/qualifications/ocnlr-level-1-certificate-in-digital-skills.webp',
  },
  {
    id: 42,
    title: 'Pearson BTEC Level 3 Extended Diploma',
    category: 'Education',
    sub: 'College',
    img: '/qualifications/pearson-btec-level-3-extended-diploma.webp',
  },
  {
    id: 46,
    title: 'Professionalism Certificate',
    category: 'Education',
    sub: 'College',
    img: '/qualifications/professionalism-certificate.webp',
  },
  {
    id: 47,
    title: 'Touch Type Read and Spell Computer Course',
    category: 'Education',
    sub: 'College',
    img: '/qualifications/touch-type-read-and-spell-computer-course.webp',
  },
  {
    id: 48,
    title: 'Volunteering Award 2018-2019',
    category: 'Education',
    sub: 'College',
    img: '/qualifications/volunteering-award-2018-2019.webp',
  },

  // Education > University
  {
    id: 30,
    title: 'Data Ethics: Making Data-Driven Decisions',
    category: 'Education',
    sub: 'University',
    img: '/qualifications/data-ethics-data-driven-decisions.webp',
  },
  {
    id: 31,
    title: 'GDPR Compliance',
    category: 'Education',
    sub: 'University',
    img: '/qualifications/gdpr-compliance-essential.webp',
  },
  {
    id: 32,
    title: 'Including Sustainability in Your Cloud Strategy',
    category: 'Education',
    sub: 'University',
    img: '/qualifications/sustainability-cloud-strategy.webp',
  },
  {
    id: 50,
    title: 'Virtual Bootcamp for new Admins',
    category: 'Education',
    sub: 'University',
    img: '/qualifications/certificate-misc.webp',
  },

  // Employment > Security
  {
    id: 1,
    title: 'Level 2 - SIA Door Supervisors',
    category: 'Employment',
    sub: 'Security',
    img: '/qualifications/sia-certificate.webp',
  },
  {
    id: 3,
    title: 'Level 2 Award for CCTV Operators',
    category: 'Employment',
    sub: 'Security',
    img: '/qualifications/cctv-certificate.webp',
  },
  {
    id: 4,
    title: 'Basic Handcuff Training',
    category: 'Employment',
    sub: 'Security',
    img: '/qualifications/handcuff-certificate.webp',
  },
  {
    id: 5,
    title: 'Cyber Security',
    category: 'Employment',
    sub: 'Security',
    img: '/qualifications/get-licensed-cyber-security.webp',
  },
  {
    id: 6,
    title: 'Fire Marshal',
    category: 'Employment',
    sub: 'Security',
    img: '/qualifications/get-licensed-fire-marshal.webp',
  },
  {
    id: 7,
    title: 'Introduction to Risk Assessment',
    category: 'Employment',
    sub: 'Security',
    img: '/qualifications/get-licensed-risk-assessment.webp',
  },
  {
    id: 8,
    title: 'Mental Health Awareness (Get Licensed)',
    category: 'Employment',
    sub: 'Security',
    img: '/qualifications/get-licensed-mental-health.webp',
  },
  {
    id: 9,
    title: 'Workplace Health and Safety',
    category: 'Employment',
    sub: 'Security',
    img: '/qualifications/get-licensed-workplace-hs.webp',
  },
  {
    id: 11,
    title: 'First Aid at Work',
    category: 'Employment',
    sub: 'Security',
    img: '/qualifications/emergency-first-aid-at-work.webp',
  },
  {
    id: 12,
    title: 'Introduction to Social Housing',
    category: 'Employment',
    sub: 'Security',
    img: '/qualifications/social-housing-intro.webp',
  },
  {
    id: 15,
    title: 'Front Line Worker - Coroners Inquest',
    category: 'Employment',
    sub: 'Security',
    img: '/qualifications/coroners-inquest-front-line.webp',
  },
  {
    id: 17,
    title: 'Equality, Diversity and Inclusion',
    category: 'Employment',
    sub: 'Security',
    img: '/qualifications/edi-employees.webp',
  },
  {
    id: 18,
    title: 'Safeguarding Everyone',
    category: 'Employment',
    sub: 'Security',
    img: '/qualifications/level-1-safeguarding.webp',
  },
  {
    id: 19,
    title: 'Mental Health Awareness (Virtual College)',
    category: 'Employment',
    sub: 'Security',
    img: '/qualifications/mental-health-awareness-ma.webp',
  },
  {
    id: 20,
    title: 'Sexual Harassment in the Workplace for Employees',
    category: 'Employment',
    sub: 'Security',
    img: '/qualifications/sexual-harassment-workplace.webp',
  },
  {
    id: 27,
    title: 'ACT AWARENESS e-Learning',
    category: 'Employment',
    sub: 'Security',
    img: '/qualifications/act-awareness-elearning.webp',
  },
  {
    id: 28,
    title: 'ACT EDUCATION E-LEARNING',
    category: 'Employment',
    sub: 'Security',
    img: '/qualifications/act-for-education.webp',
  },
  {
    id: 29,
    title: 'ACT SECURITY E-LEARNING',
    category: 'Employment',
    sub: 'Security',
    img: '/qualifications/act-security-elearning.webp',
  },

  // Employment > Tech
  {
    id: 10,
    title: 'Office Safety Essentials Interactive',
    category: 'Employment',
    sub: 'Tech',
    img: '/qualifications/office-safety-essentials.webp',
  },
  {
    id: 13,
    title: 'Awareness of Health and Safety',
    category: 'Employment',
    sub: 'Tech',
    img: '/qualifications/awareness-health-safety.webp',
  },
  {
    id: 14,
    title: 'Confidentiality in the Workplace.',
    category: 'Employment',
    sub: 'Tech',
    img: '/qualifications/confidentiality-workplace.webp',
  },
  {
    id: 16,
    title: 'Cyber Security Awareness',
    category: 'Employment',
    sub: 'Tech',
    img: '/qualifications/cyber-security-awareness-ma.webp',
  },
  {
    id: 21,
    title: 'The Essentials of Data Protection (GDPR)',
    category: 'Employment',
    sub: 'Tech',
    img: '/qualifications/gdpr-essentials-ma.webp',
  },
  {
    id: 22,
    title: 'Code of Ethics - II',
    category: 'Employment',
    sub: 'Tech',
    img: '/qualifications/code-of-ethics-2022-ii.webp',
  },
  {
    id: 37,
    title: 'Intellectual Property & Trade Secrets',
    category: 'Employment',
    sub: 'Tech',
    img: '/qualifications/intellectual-property-trade-secrets.webp',
  },
  {
    id: 39,
    title: 'Cyber Security',
    category: 'Employment',
    sub: 'Tech',
    img: '/qualifications/sa-cyber-security.webp',
  },
  {
    id: 43,
    title: 'Unisys - Data Privacy (2022)',
    category: 'Employment',
    sub: 'Tech',
    img: '/qualifications/unisys-data-privacy-2022.webp',
  },
  {
    id: 44,
    title: 'Unisys - Respectful Workplace (2023)',
    category: 'Employment',
    sub: 'Tech',
    img: '/qualifications/unisys-respectful-workplace-2022.webp',
  },
  {
    id: 45,
    title: 'Unisys - Data Privacy (2023)',
    category: 'Employment',
    sub: 'Tech',
    img: '/qualifications/unisys-data-privacy-2023-v2.webp',
  },
];

// Precomputed once at module load so the empty-tab logic doesn't re-scan
// CARDS on every render. parent[cat] gives the total per parent category;
// sub[`${cat}/${sub}`] gives the per-subcategory total.
const COUNTS = (() => {
  // Seed every declared parent at 0 so a freshly added category in
  // CATEGORY_TREE without any cards yet still reads as empty (instead of
  // returning undefined and slipping past the empty-tab guard).
  const parent = Object.fromEntries(
    PARENT_CATEGORIES.map((category) => [category, 0]),
  );
  parent.All = CARDS.length;
  const sub = {};
  for (const card of CARDS) {
    parent[card.category] = (parent[card.category] || 0) + 1;
    const key = `${card.category}/${card.sub}`;
    sub[key] = (sub[key] || 0) + 1;
  }
  return { parent, sub };
})();

// Smallest font size FitOneLineTitle will shrink to. Below this the title
// would be unreadable, so instead of shrinking further the h3 clips with an
// ellipsis (overflow-hidden + text-ellipsis act as the fallback). 10px lets
// the longest current title ("OCNLR Entry Level Certificate in Digital
// Skills (Entry 3)") fit un-clipped at ~10.8px on a 390px-wide phone — the
// floor only bites on narrower viewports than that.
const TITLE_MIN_PX = 10;

// Renders a certificate title on exactly ONE line, whatever its length.
// CSS alone can only wrap or clip, so this measures the text's natural
// single-line width (scrollWidth) against the available width and scales
// font-size down proportionally — text width is linear in font size, so a
// single pass lands on the right value; it never grows past the
// class-declared base (text-lg). Tailwind's text-lg pins line-height at
// 1.75rem independently of the inline font-size, so the title bar's height
// is identical on every card — which is what keeps the bar→buttons gap
// constant. Re-fits when the wrapper resizes (card widths are vh/vw-derived)
// and once webfonts finish loading (glyph metrics change). Font size is
// written straight to the DOM via refs: no React state, no re-render per
// resize tick, and the observer only watches the wrapper's width — which
// the font size can't influence — so there's no feedback loop.
const FitOneLineTitle = ({ text }) => {
  const boxRef = useRef(null);
  const textRef = useRef(null);
  // Class-derived base font size, captured on the first fit before any
  // inline override exists.
  const basePxRef = useRef(null);

  useLayoutEffect(() => {
    const box = boxRef.current;
    const el = textRef.current;
    if (!box || !el) return undefined;

    const fit = () => {
      if (basePxRef.current === null) {
        // Clear any leftover inline size (e.g. after a Fast Refresh remount
        // that reused the DOM node) so the base is the CLASS-declared size,
        // not a previously shrunk one. Must happen BEFORE measuring
        // scrollWidth so `natural` and `current` describe the same font size.
        el.style.fontSize = '';
        basePxRef.current = parseFloat(window.getComputedStyle(el).fontSize);
      }
      const available = box.clientWidth;
      const natural = el.scrollWidth;
      if (!available || !natural) return;
      const current = parseFloat(window.getComputedStyle(el).fontSize);
      // 1px of slack absorbs scrollWidth's integer rounding so the text
      // never sits exactly on the overflow boundary.
      const target = Math.min(
        basePxRef.current,
        Math.max((current * (available - 1)) / natural, TITLE_MIN_PX),
      );
      if (Math.abs(target - current) > 0.1) {
        el.style.fontSize = `${target}px`;
      }
    };

    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(box);
    document.fonts?.ready?.then(fit);
    return () => observer.disconnect();
  }, [text]);

  return (
    <div ref={boxRef} className="relative z-10 w-full min-w-0 overflow-hidden">
      <h3
        ref={textRef}
        className="text-fire-amber overflow-hidden text-ellipsis whitespace-nowrap text-center text-lg font-semibold tracking-wide"
        style={{ textShadow: 'none' }}
      >
        {text}
      </h3>
    </div>
  );
};

const Carousel3D = () => {
  const [activeCategory, setActiveCategory] = useState('All');
  const [activeSub, setActiveSub] = useState(null);
  const [hasAnimated, setHasAnimated] = useState(false);

  const subCategories = CATEGORY_TREE[activeCategory];

  const parentCounts = COUNTS.parent;

  const subCounts = useMemo(() => {
    if (!subCategories) return {};
    const counts = {};
    for (const sub of subCategories) {
      counts[sub] = COUNTS.sub[`${activeCategory}/${sub}`] ?? 0;
    }
    return counts;
  }, [activeCategory, subCategories]);

  const filteredCards = useMemo(() => {
    if (activeCategory === 'All') return CARDS;
    if (!activeSub) return CARDS.filter((c) => c.category === activeCategory);
    return CARDS.filter(
      (c) => c.category === activeCategory && c.sub === activeSub,
    );
  }, [activeCategory, activeSub]);

  // Initialise straight to the middle card. Deriving the first index
  // synchronously (lazy useState initialiser) means the very first paint
  // already mounts the correct window of cards — the `<Image>` fetches it
  // starts are the ones we keep. Previously this was useState(0) + an effect
  // that recentred on mount, so frame 1 mounted the wrong 7 cards, started 7
  // `_next/image` requests, then frame 2 unmounted them and started 7 more —
  // the first 7 showing up as (canceled) in the network panel. On first
  // mount activeCategory is 'All', so filteredCards === CARDS and this yields
  // the same index the effect used to compute. (initialIndex is a module-scope
  // pure helper — see top of file.)
  const [activeIndex, setActiveIndex] = useState(() => initialIndex(CARDS));

  // Recenter on the middle card whenever the *filter* changes — but never on
  // first mount (the lazy initialiser above already did that). Skipping the
  // first run is what eliminates the cold-load recenter churn; subsequent
  // filter switches still recentre, and there the transition is user-driven
  // and expected.
  const isFirstRun = useRef(true);
  useEffect(() => {
    if (isFirstRun.current) {
      isFirstRun.current = false;
      return;
    }
    setActiveIndex(initialIndex(filteredCards));
    // filteredCards is memoised on [activeCategory, activeSub], so its
    // reference changes iff the filter changes — depending on it directly
    // recenters on exactly those transitions and keeps exhaustive-deps happy.
  }, [filteredCards]);

  // Warm every certificate image into the HTTP cache once the carousel is up.
  // NavButton already starts this on nav intent (so cards are cached before the
  // Stone Passage reveal), but this covers direct entries — a deep link or a
  // refresh, where there was no transition — and guarantees the OTHER buckets'
  // images are cached before the visitor switches category, making switches
  // instant too. requestIdleCallback keeps it off the critical path; the
  // setTimeout branch covers Safari, which still lacks it. Idempotent, so it
  // harmlessly overlaps the nav-intent warm (see preloadCerts).
  useEffect(() => {
    const supportsIdle = typeof window.requestIdleCallback === 'function';
    const schedule = supportsIdle
      ? (cb) => window.requestIdleCallback(cb)
      : (cb) => setTimeout(cb, 300);
    const handle = schedule(() => preloadQualificationCerts());
    return () => {
      if (supportsIdle) window.cancelIdleCallback(handle);
      else clearTimeout(handle);
    };
  }, []);

  const normalizedIndex =
    filteredCards.length > 0
      ? ((activeIndex % filteredCards.length) + filteredCards.length) %
        filteredCards.length
      : 0;

  const nextSlide = () => {
    setActiveIndex((prev) => (prev + 1) % filteredCards.length);
  };

  const prevSlide = () => {
    setActiveIndex((prev) =>
      prev === 0 ? filteredCards.length - 1 : prev - 1,
    );
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      setHasAnimated(true);
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  // Track the id of the most recent "empty category" toast so we can
  // dismiss it precisely when the message stops being relevant — i.e.
  // when the user switches to a category that *does* have qualifications,
  // or when they navigate away from /qualifications entirely.
  const lastToastIdRef = useRef(null);

  const dismissEmptyToast = () => {
    if (lastToastIdRef.current !== null) {
      toast.dismiss(lastToastIdRef.current);
      lastToastIdRef.current = null;
    }
  };

  // Dismiss any lingering empty-category toast on unmount — fires when
  // the user clicks the home (or any other) nav button and the
  // /qualifications route is torn down. The toast lives in the Toaster
  // mounted at the root layout, so it survives this unmount unless we
  // explicitly close it.
  useEffect(() => () => dismissEmptyToast(), []);

  const emptyToast = (label) => {
    // Replace any earlier message so consecutive empty clicks don't stack.
    dismissEmptyToast();
    lastToastIdRef.current = toast.info(
      `No qualifications in ${label} yet`,
      {
        style: {
          color: '#ff6d05',
          backgroundColor: 'rgb(0 0 0 / 0.7)',
          border: 'none',
          textAlign: 'center',
          // Shrink the toast container to its content width on every
          // viewport so it doesn't span the screen on mobile or leave
          // dead space on desktop. `alignSelf: center` + auto inline
          // margins opt the toast out of sonner's default flex-column
          // stretch so it centers within the position-anchored wrapper.
          width: 'fit-content',
          maxWidth: 'min(90vw, 28rem)',
          alignSelf: 'center',
          marginInline: 'auto',
        },
      },
    );
  };

  const handleParentClick = (cat) => {
    if (cat !== 'All' && parentCounts[cat] === 0) return emptyToast(cat);
    dismissEmptyToast();
    setActiveCategory(cat);
    setActiveSub(null);
  };

  const handleSubClick = (sub) => {
    if (subCounts[sub] === 0) return emptyToast(sub);
    dismissEmptyToast();
    setActiveSub(sub);
  };

  const isParentEmpty = (cat) => cat !== 'All' && parentCounts[cat] === 0;
  const isSubEmpty = (sub) => subCounts[sub] === 0;

  return (
    // `carousel-stage-clip` (globals.css): `overflow: clip` where it parses,
    // `overflow: hidden` where it doesn't. This wrapper exists to clip the
    // 3D wheel's ±132vh of horizontal travel; `clip` is preferred because
    // `hidden` turns the element into a scroll container that focus-reveal can
    // silently scroll, but Safari < 16 drops the unparsed `clip` and would be
    // left with `visible` — so the class falls back to `hidden`, the exact
    // behaviour this wrapper shipped with before issue #47. Moving the clip
    // down onto `.perspective-3d` is not an option either: `overflow` other
    // than `visible` forces `transform-style: flat` and would collapse the
    // coverflow depth.
    <div className="carousel-stage-clip relative flex max-h-full w-full flex-col items-center justify-center">
      {/* Parent + sub category filters — the shared scroll-driven strip
          (issue #47), stacked directly on top of each other. At today's three
          parents each row measures as fitting and renders as the plain centred
          row it always was; add enough to outgrow the viewport and the row
          becomes a horizontal scroller (a wheel over it travels sideways)
          rather than wrapping. Neither row injects any height, so the sub row
          always sits immediately under its parent and the carousel below stays
          exactly where it is. */}
      <ScrollHijackCategories
        className="mb-4 mt-10"
        label="Qualification categories"
        categories={PARENT_CATEGORIES}
        active={activeCategory}
        onSelect={handleParentClick}
        isDisabled={isParentEmpty}
        disabledTitle={(cat) => `No qualifications in ${cat} yet`}
        counts={parentCounts}
      />

      {/* Sub-category filters (only when parent has subs) */}
      {subCategories && (
        <ScrollHijackCategories
          className="mb-8"
          label={`${activeCategory} sub-categories`}
          categories={subCategories}
          active={activeSub}
          onSelect={handleSubClick}
          isDisabled={isSubEmpty}
          disabledTitle={(sub) => `No qualifications in ${sub} yet`}
          counts={subCounts}
        />
      )}

      {!subCategories && <div className="mb-6" />}

      {/* Carousel 3D Container. CSS vars feed every dimension so we can
                tune them per breakpoint and the gap-to-card ratio
                (slot/cap ≈ 0.65) stays constant on mobile, tablet, and
                desktop:
                  --cert-cap   — image height cap
                  --cert-w-cap — image width cap (mobile uses ~90vw so cards
                                 nearly fill the screen width; desktop value
                                 is academic because the height cap wins)
                  --slot-vh    — translateX spacing between cards            */}
      <div className="perspective-3d relative flex h-[68vh] w-full items-center justify-center [--cert-cap:56vh] [--cert-w-cap:90vw] [--slot-vh:36vh] md:h-[80vh] md:[--cert-cap:68vh] md:[--cert-w-cap:70vw] md:[--slot-vh:44vh]">
        {filteredCards.length > 0 ? (
          filteredCards.map((card, index) => {
            let offset = index - normalizedIndex;
            if (offset < -Math.floor(filteredCards.length / 2)) {
              offset += filteredCards.length;
            } else if (offset > Math.floor(filteredCards.length / 2)) {
              offset -= filteredCards.length;
            }

            const absOffset = Math.abs(offset);
            // Skip cards outside the render window. Cards beyond
            // RENDER_WINDOW are invisible (opacity 0) and not
            // interactive, so unmounting them avoids fetching
            // their images and keeps the DOM small.
            if (absOffset > RENDER_WINDOW) return null;
            const ar = aspectFor(card.img);
            // Image area: width and height share the same min() so
            // the box's aspect ratio always equals the image's.
            // --cert-cap (height) and --cert-w-cap (width) are
            // set on the carousel container and breakpoint-aware,
            // so cards grow on mobile (filling the width) and
            // get a moderate bump on desktop.
            const imgW = `min(var(--cert-w-cap), calc(${ar} * var(--cert-cap)))`;
            const imgH = `min(calc(var(--cert-w-cap) / ${ar}), var(--cert-cap))`;
            // Match `sizes` to the actual rendered width. Portrait cards
            // are height-bound (width ≈ ar × cert-cap), but on tall
            // viewports that can approach the --cert-w-cap upper bound,
            // so we use the cap as a conservative ceiling — undershooting
            // here makes Next/Image pick a too-small srcset entry and
            // upscale it (blurry). Shared with the preloader via certSizes so
            // the warmed URL and this request can't drift apart (cache hit).
            const imgSizes = certSizes(ar);
            // Uniform slot width via the --slot-vh CSS var (set on
            // the carousel container, breakpoint-aware). Every
            // card sits at offset × var(--slot-vh) regardless of
            // its own width, and because --slot-vh scales with
            // --cert-cap, the gap-to-card ratio is identical on
            // mobile, tablet and desktop.
            const translateX = `calc(${offset} * var(--slot-vh))`;
            // Coverflow depth/tilt to match the reference Swiper
            // config (depth: 200, rotate: 20). Side cards recede
            // ~200px per step and tilt 20° inward — this is what
            // sells the "centred card sits in front of its
            // neighbours" effect rather than just being a row.
            const translateZ = -absOffset * 200;
            const rotateY = offset * -20;
            const scale = offset === 0 ? 1 : 0.85;

            return (
              <div
                key={card.id}
                className="absolute flex h-full flex-col items-center justify-between gap-6 rounded-2xl py-6 text-xl font-bold text-[#ff6d05]"
                style={{
                  width: imgW,
                  transform: hasAnimated
                    ? `translateX(${translateX}) translateZ(${translateZ}px) rotateY(${rotateY}deg) scale(${scale})`
                    : 'translateX(0px) translateZ(-400px) rotateY(0deg) scale(0.5)',
                  zIndex: 100 - absOffset,
                  // Cards within the visible window stay fully
                  // opaque (Swiper-coverflow look). Anything
                  // past the window is invisible — and that's
                  // exactly where the wrap sweep happens, so
                  // the loop reads as seamless.
                  // Cards within OPAQUE_WINDOW are fully opaque; the
                  // single edge card at RENDER_WINDOW fades to 0.55 to
                  // sell the wheel rolling off into space. Anything
                  // further than RENDER_WINDOW would never render here
                  // (the early return above unmounts it), so the final
                  // 0 branch is just defensive.
                  opacity: !hasAnimated
                    ? 0
                    : absOffset <= OPAQUE_WINDOW
                      ? 1
                      : absOffset === RENDER_WINDOW
                        ? 0.55
                        : 0,
                  filter: `brightness(${1 - absOffset * 0.18})`,
                  // Same timing for every card so they move
                  // as a single wheel — no staggered ripple.
                  transition:
                    'transform 650ms ease-in-out, opacity 400ms ease-in-out',
                  pointerEvents: absOffset > RENDER_WINDOW ? 'none' : 'auto',
                }}
              >
                {/* === IMAGE + REFLECTION SECTION === */}
                {/* Bottom-anchored (justify-end) for BOTH orientations: the
                    title bar always hugs the bottom of the fixed-height card,
                    so the gap between it and the Prev/Next buttons below the
                    stage is identical whether the certificate is portrait
                    (fills the card, same result as the old justify-start) or
                    landscape (shorter — the spare height now collects above
                    the image instead of between the title and the buttons,
                    which is what made the gap look inconsistent). */}
                <div className="relative flex h-full w-full flex-col items-center justify-end overflow-visible rounded-lg">
                  {/* Main Image — width/height pinned to the image's aspect ratio so the frame hugs it edge-to-edge */}
                  <div
                    className="custom-bg-abt relative flex items-center justify-center rounded-lg p-[0.3rem]"
                    style={{ width: imgW, height: imgH, background: '#00000020' }}
                  >
                    <a
                      href={card.img}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Open ${card.title} in a new tab`}
                      className="relative block h-full w-full cursor-pointer"
                    >
                      <Image
                        src={card.img}
                        alt={card.title}
                        fill
                        sizes={imgSizes}
                        // Only the centered card is eager. Neighbours are
                        // lazy so the browser — not us — schedules them. A
                        // filter-change recenter can still cancel in-flight
                        // lazy neighbour fetches (the rendered cards are all
                        // in-view and begin loading immediately); what this
                        // cuts is the number of HIGH-priority fetches that
                        // contend for bandwidth — from five to one.
                        // Neighbours still pre-warm because they're in the DOM
                        // near the viewport; the browser just controls timing.
                        // priority already gives the centre fetchpriority=high
                        // + a preload link, so we only add an explicit low
                        // hint to the neighbours to keep them off the centre
                        // card's bandwidth.
                        priority={absOffset === 0}
                        loading={absOffset === 0 ? 'eager' : 'lazy'}
                        fetchPriority={absOffset === 0 ? undefined : 'low'}
                        className="rounded-lg object-cover"
                      />
                      {/* Subtle ember tint to tie cards
                                                into the page palette. Lives
                                                in the DOM only — clicking the
                                                card opens the raw WebP in a
                                                new tab with no overlay. */}
                      <div
                        aria-hidden
                        className="pointer-events-none absolute inset-0 rounded-lg bg-gradient-to-br from-[#ff6d05]/85 via-[#ff6d05]/65 to-[#ff6d05]/80 mix-blend-multiply"
                      />
                    </a>
                  </div>

                  {/* Certificate Title + Reflection.
                      Single-line title bar: FitOneLineTitle shrinks the
                      font until the whole title fits on ONE line, so every
                      bar is exactly one line-height (1.75rem) + p-3 tall.
                      Constant bar height + the bottom-anchored wrapper
                      above = the title→buttons gap never moves. shrink-0
                      stops flex from squeezing the bar when a portrait
                      image fills the card — the image area absorbs the
                      squeeze instead, as it did before. */}
                  <div className="custom-bg-abt relative mt-3 flex w-full shrink-0 items-center justify-center overflow-hidden rounded-lg border p-3 text-center before:pointer-events-none before:absolute before:inset-0 before:rounded-lg">
                    <FitOneLineTitle text={card.title} />
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="text-lg font-semibold text-[#FFB627] drop-shadow-[0_0_5px_#ffb627]">
            No items found in this category!
          </div>
        )}
      </div>

      {/* Next / Prev Buttons + Reflection */}
      {filteredCards.length > 0 && (
        <div className="relative mb-4 mt-[clamp(1rem,4vh,2.5rem)] flex flex-col items-center">
          <div className="z-10 flex gap-6">
            <button
              type="button"
              onClick={prevSlide}
              className="custom-bg-abt text-fire-amber rounded-lg px-4 py-2"
              style={{ textShadow: 'none' }}
            >
              Prev
            </button>
            <button
              type="button"
              onClick={nextSlide}
              className="custom-bg-abt text-fire-amber rounded-lg px-4 py-2"
              style={{ textShadow: 'none' }}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Carousel3D;
