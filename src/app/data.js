/*
Websites:

- https://github.com/pmndrs/gltfjsx (GLTF JSX for 3D Models)
- https://lucide.dev/icons/ (Lucide Icons)
- https://github.com/anuraghazra/github-readme-stats (Github Readme Stats)
- https://skillicons.dev (Skill Icons to show skills)
- https://github-readme-streak-stats.herokuapp.com (Github Readme Streak Stats)

:root {
  --background: 27 27 27;
  --foreground: 225 225 225;
  --muted: 115 115 115;
  --accent: 254 254 91; #FEFE5B
}

*/

export const projectsData = [
  {
    id: 1,
    name: 'EcoTracker',
    description: 'Track your carbon footprint',
    date: '2022-08-15',
    demoLink: 'https://ecotracker.example.com',
    category: 'Web',
  },
  {
    id: 2,
    name: 'ArtGallery Online',
    description: 'Digital art showcase platform',
    date: '2022-06-20',
    demoLink: 'https://artgalleryonline.example.com',
    category: 'Web',
  },
  {
    id: 3,
    name: 'BudgetPlanner',
    description: 'Plan and track expenses',
    date: '2022-09-10',
    demoLink: 'https://budgetplanner.example.com',
    category: 'Web',
  },
  {
    id: 4,
    name: 'HealthBeat',
    description: 'Monitor heart rate zones',
    date: '2022-05-30',
    demoLink: 'https://healthbeat.example.com',
    category: 'Web',
  },
  {
    id: 5,
    name: 'RecipeFinder',
    description: 'Discover new recipes',
    date: '2022-07-12',
    demoLink: 'https://recipefinder.example.com',
    category: 'Web',
  },
  {
    id: 6,
    name: 'JourneyLogger',
    description: 'Log your travels',
    date: '2022-10-01',
    demoLink: 'https://journeylogger.example.com',
    category: 'System',
  },
  {
    id: 7,
    name: 'StudyBuddy',
    description: 'Collaborative learning platform',
    date: '2022-04-18',
    demoLink: 'https://studybuddy.example.com',
    category: 'System',
  },
  {
    id: 8,
    name: 'TechTalk',
    description: 'Tech news aggregator',
    date: '2022-11-05',
    demoLink: 'https://techtalk.example.com',
    category: 'System',
  },
  {
    id: 9,
    name: 'FitTrack',
    description: 'Fitness and workout tracker',
    date: '2022-03-22',
    demoLink: 'https://fittrack.example.com',
    category: 'System',
  },
  {
    id: 10,
    name: 'MindfulMoments',
    description: 'Meditation and mindfulness app',
    date: '2022-02-14',
    demoLink: 'www.google.com',
    category: 'System',
  },

  /* ⚠️ ─── TEMPORARY DEMO DATA — issue #47 manual testing ──────────────────
     Projects for four of the demo categories declared in
     src/components/projects/index.jsx, so those tabs are SELECTABLE and you
     can watch the active glow travel, the list re-filter, and a half-cut tab
     pull itself into the window when clicked. The other four demo categories
     are deliberately left with no projects so the dimmed + toast path stays
     testable too.
     DELETE FROM THIS BANNER TO THE CLOSING MARKER to restore shipping data. */
  {
    id: 901,
    name: 'PocketLedger',
    description: 'Offline-first expense tracker',
    date: '2023-03-02',
    demoLink: 'www.google.com',
    category: 'Mobile',
  },
  {
    id: 902,
    name: 'FieldNotes',
    description: 'Voice-to-text notes for site surveys',
    date: '2023-05-19',
    demoLink: 'www.google.com',
    category: 'Mobile',
  },
  {
    id: 903,
    name: 'Typeset',
    description: 'Variable-font pairing playground',
    date: '2023-07-08',
    demoLink: 'www.google.com',
    category: 'Design',
  },
  {
    id: 904,
    name: 'RoverKit',
    description: 'Telemetry dashboard for a hobby rover',
    date: '2023-09-27',
    demoLink: 'www.google.com',
    category: 'Robotics',
  },
  {
    id: 905,
    name: 'Tideline',
    description: 'Coastal sensor readings, charted',
    date: '2024-01-16',
    demoLink: 'www.google.com',
    category: 'Data',
  },
  {
    id: 906,
    name: 'Quarry',
    description: 'Static-site search index builder',
    date: '2024-04-11',
    demoLink: 'www.google.com',
    category: 'Data',
  },
  /* ⚠️ ─── END TEMPORARY DEMO DATA ─────────────────────────────────────── */
];

export const BtnList = [
  { label: 'About', link: '/about', icon: 'about', newTab: false },
  { label: 'Projects', link: '/projects', icon: 'projects', newTab: false },
  {
    label: 'Qualifications',
    link: '/qualifications',
    icon: 'qualifications',
    newTab: false,
  },
  { label: 'Contact', link: '/contact', icon: 'contact', newTab: false },
  {
    label: 'Github',
    link: 'https://www.github.com/MA1002643',
    icon: 'github',
    newTab: false,
  },
  {
    // Intentionally routes to an unmatched path so Next.js renders the
    // custom 404 (src/app/not-found.js) — the previous portfolio link
    // is retired and the void aesthetic now stands in for it. If/when
    // a real "My Past" page is added, create src/app/(sub pages)/my-past/
    // and this entry will start resolving to it without any other change.
    label: 'My Past',
    link: '/my-past',
    icon: 'past',
    newTab: false,
  },
  {
    label: 'LinkedIn',
    link: 'https://www.linkedin.com/in/muhammad-abdullah227/',
    icon: 'linkedin',
    newTab: false,
  },
  {
    label: 'Resume',
    link: '/Muhammad_Abdullah_CV.pdf',
    icon: 'resume',
    newTab: false,
  },
];
