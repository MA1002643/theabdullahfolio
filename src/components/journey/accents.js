// Per-type accent system for the /journey timeline (issue #38). One map, five
// milestone types — the colour and icon travel together so a type can never
// half-adopt an accent. Consumed by MilestoneMarker (ring + icon), TimelineNode
// (edge strip, date pill, connector, tag hover) and nothing else; journeyData
// in src/app/data.js stores only the `type` key, keeping the data file free of
// presentation.
//
// Palette per the issue spec: career stays on the brand ember, education takes
// a cool blue counterpoint, project the shipped-it green, milestone the
// subtitle amethyst (community/volunteering roles), origin the card-border
// gold. Each colour is used ONLY as an accent (borders, 2px strips, small
// type) — surfaces stay the shared `custom-bg-abt` slate-and-gold, which is
// what keeps the hues from reading as chaos. `project` and `origin` currently
// have no tenants in journeyData — /journey is the documented
// education/employment record by owner decision (the portfolio lives on
// /projects, and the poetic "first line" origin card was cut with it) — but
// both accents stay defined so the type system is complete.
import { Award, Briefcase, Code, GraduationCap, Rocket } from 'lucide-react';

export const ACCENTS = {
  career: { color: '#ff6d05', Icon: Briefcase },
  education: { color: '#60a5fa', Icon: GraduationCap },
  project: { color: '#4ade80', Icon: Code },
  milestone: { color: '#fc83ff', Icon: Award },
  origin: { color: '#f9d174', Icon: Rocket },
};

// Fallback so a typo'd `type` in the data degrades to the brand ember instead
// of throwing mid-render.
export const accentFor = (type) => ACCENTS[type] ?? ACCENTS.career;
