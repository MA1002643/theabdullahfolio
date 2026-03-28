import React, { useEffect, useRef, useState } from "react";
import ItemLayout from "./ItemsLayout";
import { animate, AnimatePresence, useInView, motion } from "framer-motion";
import { projectsData } from "@/app/data";
import LanguagesCard from "./LanguagesCard";
import GitHubStatsCard from "./StatsCard";
import StreakStatsCard from "./StreakStatsCard";
import ReadmeStatsCard from "./RepoStatsCard";
import { detectChanges } from "@/utils/diffChanges";

const AboutDetails = () => {
  // Github Username...
  const username = "MA1002643";
  const repo = "github-readme-stats";

  const [count, setCount] = useState(0);
  const [years, setYears] = useState(0);
  const [githubStats, setGithubStats] = useState(null)
  const [previousStats, setPreviousStats] = useState(null)
  const [changedFields, setChangedFields] = useState([]);

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
    const res = await fetch(`/api/github-stats?username=${username}&repo=${repo}`);
    const data = await res.json();

    setGithubStats(prevStats => {
      // First-time load
      if (!prevStats) {
        return {
          languages: data.languages || [],
          stats: data.stats || { user: {}, stats: {}, streaks: {}, repo: {} },
        };
      }

      // Detect top-level and nested changes
      const diffs = detectChanges(prevStats, data);
      console.log("Diffs", diffs);

      if (diffs.length === 0) return prevStats; // nothing changed

      setChangedFields(diffs);
      setPreviousStats(prevStats);

      // Start from existing state
      const updatedStats = { ...prevStats };

      // --- Update top-level languages if changed ---
      if (diffs.includes("languages")) {
        updatedStats.languages = data.languages || [];
      }

      // --- Update nested stats fields selectively ---
      if (diffs.includes("stats")) {
        const prevNested = prevStats.stats || {};
        const newNested = data.stats || {};

        updatedStats.stats = {
          ...prevNested,
          // only overwrite changed parts
          user: diffs.includes("stats.user") ? newNested.user || {} : prevNested.user,
          stats: diffs.includes("stats.stats") ? newNested.stats || {} : prevNested.stats,
          streaks: diffs.includes("stats.streaks") ? newNested.streaks || {} : prevNested.streaks,
          repo: diffs.includes("stats.repo") ? newNested.repo || {} : prevNested.repo,
        };
      }

      return updatedStats;
    });
  };

  useEffect(() => {
    getGithubStats();

    // Fetch every 5 minutes instead of 8 seconds to respect cache and rate limits
    const interval = setInterval(() => {
      getGithubStats();
    }, 5 * 60 * 1000); // 5 minutes = 300,000ms

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (changedFields.length > 0) {
      const timer = setTimeout(() => setChangedFields([]), 4000);
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
          <h2 className="text-xl md:text-2xl text-left w-full capitalize text-shadow-neon-orange">
            Architect of Enchantment
          </h2>
          <p style={{ textShadow: "none" }} className="font-light text-xs sm:text-sm md:text-base text-shadow-neon-light-orange">
            My journey in web development is powered by an array of mystical tools and
            languages, with JavaScript casting the core of my enchantments. I wield frameworks like
            React.js and Next.js with precision, crafting seamless portals (websites) that connect realms
            (users) across the digital universe. The ancient arts of the Jamstack empower me to create
            fast, secure, and dynamic experiences, while my design skills ensure every creation is not
            only functional but visually captivating. Join me as I continue to explore new spells and
            technologies to shape the future of the web.
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
          <ReadmeStatsCard data={githubStats.stats.repo} isUpdated={changedFields.includes("stats.repo")} />
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
