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
        setMultiplier({ x: 2.5, y: 1.2 });
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
        {/* Left column: About, Projects, Qualifications, Contact */}
        <div className="fixed left-1/3 top-1/2 -translate-y-1/2 -translate-x-1/2 z-50 flex flex-col gap-3">
          {leftBtns.map((btn, idx) =>
            visibleButtons.includes(btn.label) ? (
              <NavButton
                key={btn.label}
                x={0}
                y={0}
                {...btn}
                setHovered={setHovered}
                hovered={hovered}
                isMobileColumn
                index={idx}
              />
            ) : null
          )}
        </div>
        {/* Right column: Github, My Past, LinkedIn, Resume */}
        <div className="fixed right-1/3 top-1/2 -translate-y-1/2 translate-x-1/2 z-50 flex flex-col gap-3">
          {rightBtns.map((btn, idx) =>
            visibleButtons.includes(btn.label) ? (
              <NavButton
                key={btn.label}
                x={0}
                y={0}
                {...btn}
                setHovered={setHovered}
                hovered={hovered}
                isMobileColumn
                index={idx + 4}
              />
            ) : null
          )}
        </div>
      </>
    );
  }

  // Orbital layout for 480px and above
  return (
    <div className="absolute z-0 flex h-1/2 w-full items-center justify-center mx-auto">
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
