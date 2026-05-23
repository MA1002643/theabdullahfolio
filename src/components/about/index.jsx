import React, { useEffect, useRef, useState } from "react";
import ItemLayout from "./ItemsLayout";
import { animate, AnimatePresence, useInView, useScroll, useTransform, useReducedMotion, motion } from "framer-motion";
import { projectsData } from "@/app/data";
import LanguagesCard from "./LanguagesCard";
import GitHubStatsCard from "./StatsCard";
import StreakStatsCard from "./StreakStatsCard";
import ReadmeStatsCard from "./RepoStatsCard";
import { detectChanges } from "@/utils/diffChanges";
import { computeRepoDiff } from "@/utils/repoDiff";

const githubStatsStorageKey = (username) =>
  `github-stats:lastGood:${username}`;

const ARCHITECT_PARAGRAPH = "My journey in web development is powered by an array of mystical tools and languages, with JavaScript casting the core of my enchantments. I wield frameworks like React.js and Next.js with precision, crafting seamless portals (websites) that connect realms (users) across the digital universe. The ancient arts of the Jamstack empower me to create fast, secure, and dynamic experiences, while my design skills ensure every creation is not only functional but visually captivating. Join me as I continue to explore new spells and technologies to shape the future of the web.";
const ARCHITECT_WORDS = ARCHITECT_PARAGRAPH.split(" ");

const RevealWord = ({ children, progress, range, reducedMotion }) => {
  const opacity = useTransform(progress, range, [0.15, 1]);
  return (
    <motion.span style={{ opacity: reducedMotion ? 1 : opacity }}>
      {children}{" "}
    </motion.span>
  );
};

const AboutDetails = () => {
  // GitHub Username — override via NEXT_PUBLIC_GITHUB_USERNAME when forking.
  // The most-active repo is now picked server-side by /api/github-stats, so the
  // hardcoded `repo` constant that used to live here is gone (issue #22).
  const username = process.env.NEXT_PUBLIC_GITHUB_USERNAME || "MA1002643";

  const [count, setCount] = useState(0);
  const [years, setYears] = useState(0);
  const [githubStats, setGithubStats] = useState(null)
  const [previousStats, setPreviousStats] = useState(null)
  const [changedFields, setChangedFields] = useState([]);
  const [repoDiffMessage, setRepoDiffMessage] = useState(null);

  // Scroll-linked per-word reveal for the "Architect of Enchantment" paragraph.
  // Both ends of the active scroll range are derived from the paragraph's own
  // document offset so the animation tracks paragraph visibility, not raw
  // page scroll.
  const paragraphRef = useRef(null);
  const prefersReducedMotion = useReducedMotion();
  const { scrollY } = useScroll();
  const [revealRange, setRevealRange] = useState({ start: 0, end: 1000 });

  useEffect(() => {
    const measure = () => {
      const el = paragraphRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const docTop = rect.top + window.scrollY;
      const vh = window.innerHeight;
      // progress=0 anchor: scrollY at which the paragraph's top reaches 80%
      // down the viewport (just entering the active area). Clamps to 0 when
      // the paragraph already sits above that line at load.
      const start = Math.max(docTop - vh * 0.8, 0);
      // progress=1 anchor: whichever comes later of (a) scrollY at which the
      // paragraph centers in the viewport — chosen so the whole paragraph is
      // still on screen as the last word lights up — or (b) start + 200, a
      // floor that keeps the active range wide enough for the per-word
      // cadence to stay perceivable when the center anchor falls too close
      // to start (e.g. tall viewports where the paragraph is already near
      // center at load).
      const end = Math.max(docTop + rect.height / 2 - vh / 2, start + 200);
      setRevealRange({ start, end });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const paragraphScrollProgress = useTransform(
    scrollY,
    [revealRange.start, revealRange.end],
    [0, 1]
  );

  useEffect(() => {
    const projectCount = projectsData.length ?? 0
    if (count && count !== projectCount) setChangedFields("projects")
    setCount(projectCount);
  }, [username]);

  // Counter Animation...
  function Counter({ from, to, plusIcon = true }) {
    const nodeRef = useRef(null);
    const sectionRef = useRef(null);
    const isInView = useInView(sectionRef, { once: false, amount: 0.3 });
    // `once: false` → triggers every time it's visible
    // `amount: 0.3` → starts when 30% of the section is visible

    useEffect(() => {
      if (!isInView) return; // only run animation when visible
      const node = nodeRef.current;

      const controls = animate(from, to, {
        duration: 2,
        onUpdate(value) {
          node.textContent = value.toFixed(0);
        },
      });

      return () => controls.stop();
    }, [from, to, isInView]);

    return (
      <div ref={sectionRef} className="flex items-center justify-center">
        <p ref={nodeRef} />
        {plusIcon && <p>+</p>}
      </div>
    );
  }

  // Set your desired start date here
  const startDate = '2021-01-01T00:00:00';

  useEffect(() => {
    const calculateYears = () => {
      const start = new Date(startDate);
      const now = new Date();
      const differenceInMs = now.getTime() - start.getTime();
      const yearsElapsed = differenceInMs / (1000 * 60 * 60 * 24 * 365.25);
      const newYears = Math.floor(yearsElapsed);

      // Use functional state update to avoid stale closure
      setYears(prevYears => {
        if (prevYears && prevYears !== newYears) {
          // Only push 'years' change if the value actually updated
          setChangedFields(prev => {
            if (!prev.includes("years")) {
              return [...prev, "years"];
            }
            return prev;
          });
        }
        return newYears;
      });
    };

    // Run once immediately
    calculateYears();

    // Keep recalculating
    const intervalId = setInterval(calculateYears, 20000);
    return () => clearInterval(intervalId);
  }, [startDate]);


  const getGithubStats = async () => {
    let data;
    try {
      const res = await fetch(`/api/github-stats?username=${username}`);
      if (!res.ok) throw new Error(`github-stats API responded ${res.status}`);
      data = await res.json();
    } catch (err) {
      // Keep whatever state we already have (localStorage hydrate or prior poll)
      // so the cards never go blank on a transient fetch failure.
      console.error("Failed to load GitHub stats:", err);
      return;
    }

    setGithubStats(prevStats => {
      // If the API served the bundled fallback (upstream failure) and we
      // already have real data on screen, keep that state — only let the
      // fallback populate on a truly empty first load.
      if (data._fallback && prevStats) {
        return prevStats;
      }

      // First-time load
      if (!prevStats) {
        return {
          languages: data.languages || [],
          // `repo: null` (not `{}`) so the parent guard
          // `githubStats?.stats?.repo` correctly suppresses the card when the
          // API reports no qualifying activity. An empty object is truthy and
          // would render a blank "Most Active Repository" card.
          stats: data.stats || { user: {}, stats: {}, streaks: {}, repo: null },
        };
      }

      // Detect top-level and nested changes
      const diffs = detectChanges(prevStats, data);

      if (diffs.length === 0) return prevStats; // nothing changed

      // Compute a human-readable diff for the repo card's update banner.
      // computeRepoDiff returns null on the first-ever change cycle (no prev),
      // suppressing a false-positive banner on the initial poll after load.
      const repoMsg = computeRepoDiff(prevStats?.stats?.repo, data?.stats?.repo);
      if (repoMsg) setRepoDiffMessage(repoMsg);

      setChangedFields(diffs);
      setPreviousStats(prevStats);

      // Start from existing state
      const updatedStats = { ...prevStats };

      // --- Update top-level languages if changed ---
      if (diffs.includes("languages")) {
        updatedStats.languages = data.languages || [];
      }

      // --- Update nested stats fields selectively ---
      // `detectChanges` flattens to two-level keys (e.g. "stats.user"), so the bare "stats" is never emitted — match any "stats.*" instead.
      if (diffs.some((d) => d === "stats" || d.startsWith("stats."))) {
        const prevNested = prevStats.stats || {};
        const newNested = data.stats || {};

        updatedStats.stats = {
          ...prevNested,
          // only overwrite changed parts.
          // `repo` uses ?? so a legitimate `null` (API reporting "no
          // qualifying activity") is preserved instead of coerced to `{}` —
          // the parent guard `githubStats?.stats?.repo` then suppresses an
          // otherwise-blank card. The other fields stay on `||` because
          // they're always object-shaped in practice and the empty-object
          // fallback there is just a safety net.
          user: diffs.includes("stats.user") ? newNested.user || {} : prevNested.user,
          stats: diffs.includes("stats.stats") ? newNested.stats || {} : prevNested.stats,
          streaks: diffs.includes("stats.streaks") ? newNested.streaks || {} : prevNested.streaks,
          repo: diffs.includes("stats.repo") ? (newNested.repo ?? null) : prevNested.repo,
        };
      }

      return updatedStats;
    });

    // Persist the last good payload so the next page load can hydrate
    // immediately from cache while the fresh fetch runs in the background.
    // Skip when the API served the bundled fallback (`_fallback: true`),
    // otherwise a transient upstream failure would overwrite genuine cached
    // stats with stale snapshot data for every future cold load.
    if (!data?._fallback) {
      try {
        window.localStorage.setItem(
          githubStatsStorageKey(username),
          JSON.stringify({
            languages: data.languages || [],
            // `repo: null` (not `{}`) so the parent guard
            // `githubStats?.stats?.repo` correctly suppresses the card on the
            // next cold load when there's no qualifying activity. Must match
            // the same default used by the in-memory first-load branch above
            // — drifting these out of sync causes the hydrate to render an
            // empty card the next time the user visits.
            stats: data.stats || { user: {}, stats: {}, streaks: {}, repo: null },
          })
        );
      } catch {
        // Quota exceeded or private mode — non-fatal.
      }
    }
  };

  useEffect(() => {
    // Hydrate from the previously cached payload so the stat cards never
    // render empty on a cold page load.
    try {
      const newKey = githubStatsStorageKey(username);
      let raw = window.localStorage.getItem(newKey);

      // Legacy key migration: prior to dropping the `:${repo}` suffix, the
      // cache key was `github-stats:lastGood:${username}:${repo}` — one entry
      // per repo the algorithm had ever selected. Existing visitors carry
      // those entries forward, and without this scan they'd lose their cold-
      // load hydration until the first network fetch returns. Find any
      // legacy entry, promote it to the new key, and clear the old ones.
      if (!raw) {
        const legacyPrefix = `${newKey}:`;
        const legacyKeys = [];
        for (let i = 0; i < window.localStorage.length; i++) {
          const k = window.localStorage.key(i);
          if (k && k.startsWith(legacyPrefix)) legacyKeys.push(k);
        }
        if (legacyKeys.length > 0) {
          // Any one of them will do — they're per-repo snapshots and the
          // next 10-minute poll will overwrite with the live answer anyway.
          raw = window.localStorage.getItem(legacyKeys[0]);
          if (raw) {
            window.localStorage.setItem(newKey, raw);
          }
          // Clean up all legacy entries (including ones we didn't read from)
          // so localStorage doesn't accumulate stale per-repo snapshots.
          for (const k of legacyKeys) window.localStorage.removeItem(k);
        }
      }

      if (raw) {
        const parsed = JSON.parse(raw);
        // Defensive normalizes for legacy payloads. Without these the cold-
        // load hydrate would either render a wrong/empty card or trigger a
        // false "Most active repository changed…" banner on the first poll
        // (because `computeRepoDiff` compares hydrated `prev.name` —
        // undefined under the old shape — against the live `next.name`).
        const repo = parsed?.stats?.repo;
        if (repo && typeof repo === "object") {
          // Pre-most-active-repo build: `repo: {}` meant "no qualifying
          // activity". An empty object is truthy and would slip past the
          // `githubStats?.stats?.repo` guard.
          if (Object.keys(repo).length === 0) {
            parsed.stats.repo = null;
          } else {
            // Pre-most-active-repo build also used `title`/`color`; current
            // shape uses `name`/`languageColor`. Re-key in-place so the
            // destructure in RepoStatsCard reads the right fields and the
            // first poll's diff doesn't false-positive on a renamed key.
            if (repo.title !== undefined && repo.name === undefined) {
              repo.name = repo.title;
              delete repo.title;
            }
            if (repo.color !== undefined && repo.languageColor === undefined) {
              repo.languageColor = repo.color;
              delete repo.color;
            }
          }
        }
        setGithubStats(parsed);
      }
    } catch {
      // Ignore parse / access errors — the fresh fetch will populate state.
    }

    getGithubStats();

    // Poll every 10 minutes to match the API cache TTL (no point asking for
    // fresh data more often than the server is willing to compute it).
    const interval = setInterval(getGithubStats, 10 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (changedFields.length > 0) {
      const timer = setTimeout(() => {
        setChangedFields([]);
        setRepoDiffMessage(null);
      }, 10000);
      return () => clearTimeout(timer);
    }
  }, [changedFields]);


  //
  //
  // Icons...
  const icons = [
    "appwrite", "aws", "babel", "bootstrap", "cloudflare", "css", "d3", "docker",
    "figma", "firebase", "gatsby", "git", "github", "graphql", "html", "ipfs",
    "js", "jquery", "kubernetes", "linux", "mongodb", "mysql", "netlify", "nextjs",
    "nodejs", "npm", "postgres", "react", "redux", "replit", "sass", "supabase",
    "tailwind", "threejs", "vercel", "vite", "vscode", "yarn"
  ];

  return (
    <section className="py-20 px-16 w-full">
      <div className="grid grid-cols-12 gap-4 xs:gap-6 md:gap-8 w-full">
        <ItemLayout
          className={
            " col-span-full lg:col-span-8 row-span-2 flex-col items-start"
          }
        >
          <h2
            className="text-xl md:text-2xl text-left w-full capitalize"
            style={{
              color: '#ffb347',
              textShadow: 'none',
              WebkitFontSmoothing: 'antialiased',
              MozOsxFontSmoothing: 'grayscale',
              textRendering: 'geometricPrecision',
            }}
          >
            Architect of Enchantment
          </h2>
          <p
            ref={paragraphRef}
            style={{ textShadow: "none" }}
            className="font-light text-xs sm:text-sm md:text-base text-shadow-neon-light-orange"
          >
            {ARCHITECT_WORDS.map((word, i) => (
              <RevealWord
                key={i}
                progress={paragraphScrollProgress}
                range={[i / ARCHITECT_WORDS.length, (i + 1) / ARCHITECT_WORDS.length]}
                reducedMotion={prefersReducedMotion}
              >
                {word}
              </RevealWord>
            ))}
          </p>
        </ItemLayout>

        <ItemLayout
          className={" col-span-full xs:col-span-6 lg:col-span-4 text-accent"}
        >
          <AnimatePresence>
            {changedFields.includes('projects') && (
              <motion.div
                key="banner"
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.4, ease: "easeOut" }}
                className="absolute inset-0 flex items-center justify-center bg-orange-500/80 backdrop-blur-xl text-[#ff6d05] font-medium text-lg md:text-xl rounded-lg z-10"
              >
                <span className="">
                  Data in this table has been updated
                </span>
              </motion.div>
            )}
          </AnimatePresence>
          <h1 className="flex items-center gap-2 font-semibold w-full text-left text-2xl sm:text-5xl text-shadow-neon-orange">
            <Counter from={0} to={count} plusIcon={false}></Counter>
            <p style={{ textShadow: "none" }} className="font-semibold text-base text-shadow-neon-light-orange">completed projects</p>
          </h1>
        </ItemLayout>

        <ItemLayout
          className={"col-span-full xs:col-span-6 lg:col-span-4 text-accent"}
        >
          <AnimatePresence>
            {changedFields.includes('years') && (
              <motion.div
                key="banner"
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.4, ease: "easeOut" }}
                className="absolute inset-0 flex items-center justify-center bg-orange-500/80 backdrop-blur-xl text-[#ff6d05] font-medium text-lg md:text-xl rounded-lg z-10"
              >
                <span className="">
                  Years of experience number has been changed
                </span>
              </motion.div>
            )}
          </AnimatePresence>
          <h1 className="flex items-center gap-2  font-semibold w-full text-left text-2xl sm:text-5xl text-shadow-neon-orange">
            <Counter from={0} to={years}></Counter>
            <p style={{ textShadow: "none" }} className="font-semibold text-base text-shadow-neon-light-orange">years of experience</p>
          </h1>
        </ItemLayout>

        {githubStats?.languages && <ItemLayout
          className={"col-span-full lg:col-span-6 !p-0"}
        >
          <LanguagesCard data={githubStats.languages} isUpdated={changedFields.includes("languages")} />
        </ItemLayout>}

        {githubStats?.stats && <ItemLayout className={" col-span-full lg:col-span-6 !p-0"}>
          <GitHubStatsCard data={githubStats.stats.stats} userName={githubStats.stats.user.name} isUpdated={changedFields.includes("stats.stats") || changedFields.includes('stats.user')} />
        </ItemLayout>}

        <ItemLayout className="col-span-full grid grid-cols-4 sm:grid-cols-8 lg:[grid-template-columns:repeat(15,minmax(0,1fr))] !space-y-2 md:!space-y-6">
          <AnimatePresence>
            {changedFields.includes('skills') && (
              <motion.div
                key="banner"
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.4, ease: "easeOut" }}
                className="absolute inset-0 flex items-center justify-center bg-orange-500/80 backdrop-blur-xl text-[#ff6d05] font-medium text-lg md:text-xl rounded-lg z-10"
              >
                <span className="">
                  This section has been updated
                </span>
              </motion.div>
            )}
          </AnimatePresence>
          {icons.map((icon) => (
            <div
              key={icon}
              className="relative group w-11 h-11 md:w-12 md:h-12 lg:w-16 lg:h-16 transition-transform duration-300 ease-in-out hover:animate-lift-shake"
            >
              <img
                src={`https://skillicons.dev/icons?i=${icon}`}
                alt={icon}
                className="w-full h-full object-contain hover:scale-110 transition-all duration-300 group-hover:grayscale "
                loading="lazy"
              />
              <div className="absolute top-0 left-0 w-full h-full bg-black/60 hidden group-hover:block z-10" />
              {/* Tooltip */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 mb-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300  text-shadow-neon-orange text-md rounded px-2 py-1 pointer-events-none whitespace-nowrap z-20">
                {icon}
              </div>
            </div>
          ))}
        </ItemLayout>

        {githubStats?.stats && <ItemLayout className={"col-span-full lg:col-span-6 !p-0"}>
          <StreakStatsCard data={githubStats.stats.streaks} isUpdated={changedFields.includes("stats.streaks")} />
        </ItemLayout>}


        {githubStats?.stats?.repo && <ItemLayout className={" col-span-full lg:col-span-6 !p-0"}>
          <ReadmeStatsCard
            data={githubStats.stats.repo}
            isUpdated={changedFields.includes("stats.repo")}
            diffMessage={repoDiffMessage}
          />
        </ItemLayout>}

        {/* <ItemLayout className={"col-span-full"}>
          <img
            className="w-full h-auto"
            src={`https://skillicons.dev/icons?i=appwrite,aws,babel,bootstrap,cloudflare,css,d3,docker,figma,firebase,gatsby,git,github,graphql,html,ipfs,js,jquery,kubernetes,linux,mongodb,mysql,netlify,nextjs,nodejs,npm,postgres,react,redux,replit,sass,supabase,tailwind,threejs,vercel,vite,vscode,yarn`}
            alt="CodeBucks"
            loading="lazy"
          />
        </ItemLayout> */}

        {/* <ItemLayout className={"col-span-full md:col-span-6 !p-0"}>
          <img
            className="w-full h-auto"
            src={`https://github-readme-streak-stats.herokuapp.com?user=${username}&theme=dark&hide_border=true&background=EB545400`}
            // src={`https://github-readme-stats.vercel.app/api/top-langs/?username=${username}&theme=gruvbox&show_icons=true&hide_border=true&layout=compact`}
            // src={`https://github-readme-stats.vercel.app/api?username=${username}`}
            alt="CodeBucks"
            loading="lazy"
          />
        </ItemLayout> */}

        {/* <ItemLayout className={"col-span-full md:col-span-6 !p-0"}>
          <Link
            href="https://github.com/codebucks27/Nextjs-contentlayer-blog"
            target="_blank"
            className="w-full"
          >
            <img
              className="w-full h-auto"
              src={`https://github-readme-streak-stats.herokuapp.com?user=${username}&theme=dark&hide_border=true&background=EB545400`}
              alt="CodeBucks"
              loading="lazy"
            />
          </Link>
        </ItemLayout> */}
      </div>
    </section>
  );
};

export default AboutDetails;
