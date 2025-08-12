'use client';

import { BtnList } from '@/app/data';
import NavButton from './NavButton';
import React from 'react';

const Navigation = () => {
  const angleIncrement = 360 / BtnList.length;
  const radius = 200; // adjust as needed

  return (
    <div className="fixed flex h-screen w-full items-center justify-center">
      <div className="relative flex w-max items-center justify-between">
        {BtnList.map((btn, index) => {
          const angleRad = (index * angleIncrement * Math.PI) / 180;
          const x = radius * Math.cos(angleRad);
          const y = radius * Math.sin(angleRad);

          return <NavButton key={btn.label} x={x} y={y} {...btn} />;
        })}
      </div>
    </div>
  );
};

export default Navigation;
