'use client';

import { BtnList } from '@/app/data';
import NavButton from './NavButton';
import React, { useEffect, useState } from 'react';

const Navigation = ({ setHovered, hovered }) => {
  const angleIncrement = 360 / BtnList.length;

  const [rotation, setRotation] = useState(0);
  const [radius, setRadius] = useState(200);
  const [multiplier, setMultiplier] = useState({ x: 2, y: 1.2 });
  const [visibleButtons, setVisibleButtons] = useState([]);
  const [screenSize, setScreenSize] = useState('desktop');

  // Update radius/multipliers based on screen size
  useEffect(() => {
    const updateSize = () => {
      const width = window.innerWidth;
      if (width < 480) {
        setScreenSize('xs-mobile');
        setRadius(110);
        setMultiplier({ x: 1.6, y: 0.5 });
      } else if (width < 500) {
        setScreenSize('mobile');
        setRadius(110);
        setMultiplier({ x: 1.6, y: 0.5 });
      } else if (width < 640) {
        setScreenSize('mobile');
        setRadius(110);
        setMultiplier({ x: 1.8, y: 0.55 });
      } else if (width < 1024) {
        setScreenSize('tablet');
        setRadius(160);
        setMultiplier({ x: 1.8, y: 0.55 });
      } else {
        setScreenSize('desktop');
        setRadius(170);
        // multiplier.y kept low (was 1.2) so the bottom of the orbit
        // stays within the flex row's bottom edge on shorter desktop
        // viewports (e.g. 1024×600 laptops). Page can't scroll
        // (overflow-clip on <main>) so any vertical overflow is
        // permanently clipped — keep the orbit conservative.
        setMultiplier({ x: 2.5, y: 0.7 });
      }
    };

    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  // Infinite rotation loop
  useEffect(() => {
    let frame;

    const animate = () => {
      if (!hovered) {
        setRotation((prev) => (prev + 0.15) % 360);
      }
      frame = requestAnimationFrame(animate);
    };

    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [hovered]);

  // Stagger button reveal
  useEffect(() => {
    const width = window.innerWidth;
    if (width < 480) {
      // xs-mobile: reveal left + right button simultaneously, one pair at a time
      for (let pair = 0; pair < 4; pair++) {
        setTimeout(() => {
          setVisibleButtons((prev) => [
            ...prev,
            BtnList[pair].label,      // left column (0–3)
            BtnList[pair + 4].label,  // right column (4–7)
          ]);
        }, 400 + pair * 550);
      }
    } else {
      BtnList.forEach((btn, i) => {
        setTimeout(() => {
          setVisibleButtons((prev) => [...prev, btn.label]);
        }, i * 300);
      });
    }
  }, []);

  // xs-mobile: fixed two-column layout
  if (screenSize === 'xs-mobile') {
    const leftBtns = BtnList.slice(0, 4);
    const rightBtns = BtnList.slice(4, 8);
    return (
      <>
        {/* Left column: About, Projects, Qualifications, Contact.
            `absolute` (not `fixed`) so the column centers vertically on
            the laptop's parent flex line rather than on the viewport —
            keeps the icons aligned with the laptop regardless of where
            the header/headline push the laptop on different screens. */}
        <div className="absolute left-2.5 top-[calc(50%_-_2vh)] -translate-y-1/2 z-50 flex flex-col space-y-4">
          {/* Always render all 4 buttons so the column reserves its full
              height from t=0. The reveal is done via the `visible` prop,
              which only animates opacity/scale (transforms don't affect
              layout), so earlier pairs don't get pushed around as later
              pairs appear. */}
          {leftBtns.map((btn, idx) => (
            <NavButton
              key={btn.label}
              x={0}
              y={0}
              {...btn}
              setHovered={setHovered}
              hovered={hovered}
              isMobileColumn
              index={idx}
              visible={visibleButtons.includes(btn.label)}
            />
          ))}
        </div>
        {/* Right column: GitHub, My Past, LinkedIn, Resume.
            Mirrors the left column (also `absolute` so it tracks the
            laptop's vertical center, not the viewport's). */}
        <div className="absolute right-2.5 top-[calc(50%_-_2vh)] -translate-y-1/2 z-50 flex flex-col space-y-4">
          {/* Same always-render pattern as the left column. */}
          {rightBtns.map((btn, idx) => (
            <NavButton
              key={btn.label}
              x={0}
              y={0}
              {...btn}
              setHovered={setHovered}
              hovered={hovered}
              isMobileColumn
              // Use the pair index (0-3), not the absolute button index
              // (4-7), so each right-side button gets the same framer-motion
              // delay as its left-side partner — they appear truly together
              // instead of the right one trailing by ~320ms.
              index={idx}
              visible={visibleButtons.includes(btn.label)}
            />
          ))}
        </div>
      </>
    );
  }

  // Orbital layout for 480px and above
  return (
    // `inset-0` spans the wrapper across the full flex row so the orbit
    // center coincides with the laptop center (`items-center` on the row).
    // Previously `h-1/2` with no top/bottom anchored the wrapper to the top
    // half of the row, which placed the orbit center at ~25% — buttons at
    // the bottom of the rotation (y = +204px on desktop) then ran past the
    // row's bottom edge and were clipped by `<main>`'s `overflow-clip`.
    // No `contain:layout` needed: the scrollHeight-jitter fix lives on
    // `<main>` (overflow-clip), and adding it here also creates a new
    // stacking context which complicates the laptop/orbit z-ordering.
    <div className="absolute inset-0 z-0 flex items-center justify-center">
      <div className="relative flex w-max items-center justify-center mx-auto">
        {BtnList.map((btn, index) => {
          const angleDeg = index * angleIncrement + rotation;
          const angleRad = (angleDeg * Math.PI) / 180;

          let x = radius * Math.cos(angleRad) * multiplier.x;
          let y = radius * Math.sin(angleRad) * multiplier.y;

          const xSpacing = screenSize === 'desktop' ? 1 : screenSize === 'tablet' ? 1.2 : 1.5;
          x *= xSpacing;

          if (!visibleButtons.includes(btn.label)) return null;

          return (
            <NavButton
              setHovered={setHovered}
              hovered={hovered}
              key={btn.label}
              x={x}
              y={y}
              index={index}
              {...btn}
            />
          );
        })}
      </div>
    </div>
  );
};

export default Navigation;
