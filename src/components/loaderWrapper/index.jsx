'use client';

import { useEffect, useRef, useState } from 'react';
import {
  AnimatePresence,
  animate as fmAnimate,
  motion,
  useMotionTemplate,
  useMotionValue,
  useTransform,
} from 'framer-motion';
import logo from '../../../public/background/logo.png';
import Image from 'next/image';
import {
  COUNT_DURATION_MS,
  EMBER_CORE,
  FADE_OUT_DURATION_MS,
  INCREMENT_PER_TICK,
  PAUSE_BEFORE_PULSE_MS,
  PULSE_DURATION_MS,
  REDUCED_INCREMENT_PER_TICK,
  TICK_INTERVAL_MS,
} from './constants';

const RING_RADIUS = 135;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
const PARTICLE_COUNT = 8;

// Ease-out cubic curve. The counter accelerates through 0–70% then decelerates
// into 100% — feels alive instead of mechanical.
function easedIncrement(currentProgress, baseIncrement) {
  const easeFactor = 1 - Math.pow(currentProgress / 100, 3);
  return baseIncrement * (0.5 + easeFactor * 1.5);
}

function makeBurst() {
  return Array.from({ length: PARTICLE_COUNT }, (_, i) => {
    const angle =
      (Math.PI * 2 * i) / PARTICLE_COUNT + (Math.random() - 0.5) * 0.5;
    const distance = 55 + Math.random() * 70;
    return {
      id: i,
      x: Math.cos(angle) * distance,
      y: Math.sin(angle) * distance,
      size: 2 + Math.random() * 2,
      duration: 0.45 + Math.random() * 0.3,
    };
  });
}

export default function LoaderWrapper({ children }) {
  const [progress, setProgress] = useState(0);
  const [showLoader, setShowLoader] = useState(true);
  // 'counting' | 'pulse' | 'fadeOut' | 'done'
  const [phase, setPhase] = useState('counting');
  const [particles, setParticles] = useState([]);
  const [farthestCornerPx, setFarthestCornerPx] = useState(0);
  const reducedMotionRef = useRef(false);

  // Radial reveal for the exit wipe. Held outside React state so its
  // per-frame animation never re-renders the tree.
  const revealRadius = useMotionValue(0);
  const maskImage = useMotionTemplate`radial-gradient(circle at 50% 50%, transparent ${revealRadius}%, black calc(${revealRadius}% + 5%))`;

  // Diameter the portal ring needs to track the mask edge precisely
  // (mask % is relative to the farthest viewport corner from center).
  const ringDiameter = useTransform(
    revealRadius,
    (r) => `${(r / 100) * farthestCornerPx * 2}px`,
  );
  const ringOpacity = useTransform(
    revealRadius,
    [0, 12, 80, 120, 150],
    [0, 1, 1, 0.55, 0],
  );

  useEffect(() => {
    const update = () => {
      setFarthestCornerPx(
        Math.hypot(window.innerWidth / 2, window.innerHeight / 2),
      );
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  useEffect(() => {
    const hasSeen = localStorage.getItem('loaderSeen');
    const fromSameSite = document.referrer.includes(window.location.hostname);

    if (hasSeen && fromSameSite) {
      setShowLoader(false);
      return;
    }

    const prefersReducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    reducedMotionRef.current = prefersReducedMotion;

    const baseIncrement = prefersReducedMotion
      ? REDUCED_INCREMENT_PER_TICK
      : INCREMENT_PER_TICK;

    let pulseTimeout;
    let fadeTimeout;
    let unmountTimeout;

    const interval = setInterval(() => {
      setProgress((p) => {
        if (p >= 100) {
          clearInterval(interval);
          if (reducedMotionRef.current) {
            pulseTimeout = setTimeout(() => {
              setPhase('fadeOut');
              fadeTimeout = setTimeout(() => {
                localStorage.setItem('loaderSeen', 'true');
                setShowLoader(false);
                setPhase('done');
              }, FADE_OUT_DURATION_MS);
            }, PAUSE_BEFORE_PULSE_MS);
            return 100;
          }
          pulseTimeout = setTimeout(() => {
            setPhase('pulse');
            setParticles(makeBurst());
            fadeTimeout = setTimeout(() => {
              setPhase('fadeOut');
              unmountTimeout = setTimeout(() => {
                localStorage.setItem('loaderSeen', 'true');
                setShowLoader(false);
                setPhase('done');
              }, FADE_OUT_DURATION_MS);
            }, PULSE_DURATION_MS);
          }, PAUSE_BEFORE_PULSE_MS);
          return 100;
        }
        const next = p + easedIncrement(p, baseIncrement);
        return next >= 100 ? 100 : next;
      });
    }, TICK_INTERVAL_MS);

    return () => {
      clearInterval(interval);
      clearTimeout(pulseTimeout);
      clearTimeout(fadeTimeout);
      clearTimeout(unmountTimeout);
    };
  }, []);

  // Drive the radial wipe when fadeOut begins.
  useEffect(() => {
    if (phase !== 'fadeOut' || reducedMotionRef.current) return;
    const controls = fmAnimate(revealRadius, 150, {
      duration: FADE_OUT_DURATION_MS / 1000,
      ease: [0.65, 0, 0.35, 1],
    });
    return () => controls.stop();
  }, [phase, revealRadius]);

  const displayProgress = Math.min(progress, 100)
    .toFixed(1)
    .replace('.', ',');

  const ringStroke = `hsl(25, 100%, ${35 + progress * 0.2}%)`;
  const counterGlow = `0 0 ${4 + progress * 0.12}px ${EMBER_CORE}, 0 0 ${
    progress * 0.3
  }px rgba(255, 109, 5, 0.33)`;

  // Wipe is "live" from when fadeOut starts and through the brief AnimatePresence
  // exit window — keeping the mask applied is what prevents a grey flash, since
  // a fading-but-still-black overlay would otherwise wash the page.
  const wipeActive =
    (phase === 'fadeOut' || phase === 'done') && !reducedMotionRef.current;
  const overlayMaskStyle = wipeActive
    ? { maskImage, WebkitMaskImage: maskImage }
    : null;

  return (
    <>
      <AnimatePresence>
        {showLoader && (
          <motion.div
            key="loader-overlay"
            className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-black"
            initial={{ opacity: 1 }}
            animate={{
              opacity:
                phase === 'fadeOut' && reducedMotionRef.current ? 0 : 1,
            }}
            exit={{ opacity: 0 }}
            transition={{
              duration: reducedMotionRef.current
                ? FADE_OUT_DURATION_MS / 1000
                : 0,
            }}
            style={overlayMaskStyle}
          >
            <div className="relative flex h-72 w-72 items-center justify-center">
              <motion.svg
                className="absolute h-full w-full"
                style={{ transform: 'rotate(-90deg)' }}
                animate={
                  phase === 'pulse' || phase === 'fadeOut'
                    ? { opacity: 0, scale: 1.15 }
                    : { opacity: 1, scale: 1 }
                }
                transition={{ duration: 0.3, ease: 'easeOut' }}
              >
                <circle
                  cx="50%"
                  cy="50%"
                  r={RING_RADIUS}
                  stroke={ringStroke}
                  strokeWidth="2"
                  strokeLinecap="round"
                  fill="none"
                  strokeDasharray={RING_CIRCUMFERENCE}
                  strokeDashoffset={
                    RING_CIRCUMFERENCE * (1 - Math.min(progress, 100) / 100)
                  }
                  style={{ transition: 'stroke-dashoffset 0.05s linear' }}
                />
              </motion.svg>

              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{
                    opacity: phase === 'counting' ? 1 : 0,
                  }}
                  transition={{ duration: 0.25 }}
                  className="loader-percent mb-6 text-xl font-medium text-[#ff6d05]"
                  style={{
                    fontFamily: "'Helvetica Neue', 'Arial', sans-serif",
                    textShadow: counterGlow,
                  }}
                >
                  {displayProgress}%
                </motion.div>

                <motion.div
                  className="relative flex h-40 w-40 items-center justify-center rounded-full"
                  animate={
                    phase === 'pulse'
                      ? {
                          scale: [1, 1.12, 1.02],
                          filter: [
                            'drop-shadow(0 0 0px #ff6d05)',
                            'drop-shadow(0 0 30px #ff6d05) drop-shadow(0 0 60px rgba(255,109,5,0.5))',
                            'drop-shadow(0 0 8px #ff6d05)',
                          ],
                        }
                      : phase === 'fadeOut' && !reducedMotionRef.current
                        ? {
                            scale: 3.4,
                            opacity: 0,
                            filter:
                              'drop-shadow(0 0 80px #ff6d05) drop-shadow(0 0 140px rgba(255,109,5,0.55))',
                          }
                        : {}
                  }
                  transition={
                    phase === 'fadeOut'
                      ? {
                          duration: FADE_OUT_DURATION_MS / 1000,
                          ease: [0.55, 0, 0.45, 1],
                        }
                      : {
                          duration: PULSE_DURATION_MS / 1000,
                          ease: 'easeOut',
                        }
                  }
                >
                  <div
                    className={
                      phase === 'counting' && !reducedMotionRef.current
                        ? 'animate-logo-breathe'
                        : ''
                    }
                  >
                    <Image
                      alt="logo"
                      width={1000}
                      height={1000}
                      src={logo}
                      priority
                      className="h-40 w-40 object-contain"
                    />
                  </div>

                  {phase === 'pulse' && !reducedMotionRef.current && (
                    <div
                      className="pointer-events-none absolute inset-0"
                      aria-hidden="true"
                    >
                      {particles.map((p) => (
                        <motion.span
                          key={p.id}
                          className="absolute left-1/2 top-1/2 rounded-full bg-[#ff6d05]"
                          style={{
                            width: p.size,
                            height: p.size,
                            marginLeft: -p.size / 2,
                            marginTop: -p.size / 2,
                            boxShadow: `0 0 ${p.size * 3}px #ff6d05, 0 0 ${
                              p.size * 6
                            }px rgba(255,109,5,0.5)`,
                          }}
                          initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
                          animate={{
                            x: p.x,
                            y: p.y,
                            opacity: 0,
                            scale: 0.3,
                          }}
                          transition={{
                            duration: p.duration,
                            ease: 'easeOut',
                          }}
                        />
                      ))}
                    </div>
                  )}
                </motion.div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Ember portal ring — sibling to the masked overlay so the mask doesn't
          clip it. Lives only while the wipe is animating. */}
      <AnimatePresence>
        {showLoader && wipeActive && (
          <motion.div
            key="portal-ring"
            className="pointer-events-none fixed left-1/2 top-1/2 z-[10000] rounded-full"
            style={{
              width: ringDiameter,
              height: ringDiameter,
              x: '-50%',
              y: '-50%',
              opacity: ringOpacity,
              border: '1.5px solid rgba(255, 109, 5, 0.85)',
              boxShadow:
                '0 0 24px 2px rgba(255, 109, 5, 0.7), 0 0 80px 8px rgba(255, 109, 5, 0.35), inset 0 0 30px 4px rgba(255, 180, 80, 0.45)',
            }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            aria-hidden="true"
          />
        )}
      </AnimatePresence>

      {!showLoader && children}
    </>
  );
}

// Total sequence: COUNT_DURATION + PAUSE + PULSE + FADE_OUT
//                  ≈ 2400 + 200 + 400 + 350 = ~3.35s
