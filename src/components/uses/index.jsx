'use client';

import { MotionConfig } from 'framer-motion';
import { usesData } from '@/app/data';
import { useGuestbookPrefs } from '@/hooks/useGuestbookPrefs';
import { USES_FLAGS } from '@/lib/flags';
import { fluid } from '@/lib/fluidScale';
import BenchPlate from './BenchPlate';
import BillOfMaterials from './BillOfMaterials';
import InstrumentsPlate from './InstrumentsPlate';
import MachinePlate from './MachinePlate';
import PipelinePlate from './PipelinePlate';
import StackPlate from './StackPlate';
import UsesPalette from './UsesPalette';

// /uses (issue #37) — the client root. Six editorial plates, top to bottom:
// the machine, the bench, the stack (live), the pipeline, the instruments,
// the bill of materials. `facts` is the build-time object from
// src/lib/uses/buildFacts.js (read in the server page, never here).
//
// The ⌘K "Toggle motion" verdict reaches every layer the same three ways the
// guestbook wires it: MotionConfig for framer (which the shared
// useReducedMotion reads), and `data-motion` on the wrapper for the CSS
// (the `.uses-anim` guard). The preference store is the site-wide one, so a
// visitor who stilled the guestbook finds this page still too.
export default function UsesBench({ facts }) {
  const { motion: motionAllowed } = useGuestbookPrefs();

  return (
    <MotionConfig reducedMotion={motionAllowed ? 'user' : 'always'}>
      <div data-motion={motionAllowed ? 'on' : 'off'} className="contents">
        {/* `grid-cols-[minmax(0,1fr)]`, not a bare grid: the column's minimum
            must be 0, or the pipeline schematic's 720px minimum widens every
            plate (and the page) on a phone — see `.uses-plate` in globals.css. */}
        <div
          className="relative mx-auto grid w-full max-w-5xl grid-cols-[minmax(0,1fr)] px-2"
          style={{ rowGap: fluid(2.25), marginTop: fluid(2.5) }}
        >
          <MachinePlate rows={usesData.machine} />
          <BenchPlate
            bench={usesData.bench}
            extensions={usesData.extensions}
            frame={usesData.editorFrame}
          />
          <StackPlate fallback={usesData.stack} />
          <PipelinePlate facts={facts} />
          <InstrumentsPlate facts={facts} />
          <BillOfMaterials facts={facts} />
        </div>

        {USES_FLAGS.commandPalette ? <UsesPalette frame={usesData.editorFrame} /> : null}
      </div>
    </MotionConfig>
  );
}
