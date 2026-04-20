'use client';
import React, { useEffect, useRef, useState } from 'react';

const getMaxParticles = (width) => {
  if (width < 768) return 18;
  if (width < 1024) return 28;
  return 40;
};

const SPAWN_INTERVAL = 400;
const REDUCED_MOTION_STATIC_COUNT = 6;

const createFirefly = (id) => {
  const lifeDur = 3.5 + Math.random() * 3.5; // 3.5-7s total lifecycle
  const size = 8 + Math.random() * 4; // 8-12px

  return {
    id,
    top: `${Math.random() * 100}%`,
    left: `${Math.random() * 100}%`,
    style: {
      '--life-dur': `${lifeDur}s`,
      width: `${size}px`,
      height: `${size}px`,
    },
  };
};

const FireFliesBackground = () => {
  const [fireflies, setFireflies] = useState([]);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const maxRef = useRef(20);
  const nextIdRef = useRef(0);

  useEffect(() => {
    const update = () => {
      maxRef.current = getMaxParticles(window.innerWidth);
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updatePreference = () => {
      setPrefersReducedMotion(mediaQuery.matches);
    };
    updatePreference();
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', updatePreference);
      return () => mediaQuery.removeEventListener('change', updatePreference);
    }
    mediaQuery.addListener(updatePreference);
    return () => mediaQuery.removeListener(updatePreference);
  }, []);

  useEffect(() => {
    if (prefersReducedMotion) {
      setFireflies(
        Array.from({ length: REDUCED_MOTION_STATIC_COUNT }, (_, i) =>
          createFirefly(nextIdRef.current++),
        ),
      );
      return undefined;
    }
    const interval = setInterval(() => {
      setFireflies((prev) => {
        const cap = maxRef.current;
        const next = [...prev, createFirefly(nextIdRef.current++)];
        return next.length > cap ? next.slice(-cap) : next;
      });
    }, SPAWN_INTERVAL);
    return () => clearInterval(interval);
  }, [prefersReducedMotion]);

  // Remove firefly from state when its animation ends
  const handleAnimationEnd = (id) => {
    setFireflies((prev) => prev.filter((f) => f.id !== id));
  };

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[1] overflow-hidden"
    >
      {fireflies.map((f) => (
        <div
          key={f.id}
          className="firefly-life absolute rounded-full bg-firefly-radial"
          style={{ top: f.top, left: f.left, ...f.style }}
          onAnimationEnd={() => handleAnimationEnd(f.id)}
        />
      ))}
    </div>
  );
};

export default FireFliesBackground;
