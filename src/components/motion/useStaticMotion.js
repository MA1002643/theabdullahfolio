'use client';

import { useContext } from 'react';
import { MotionConfigContext } from 'framer-motion';

/**
 * True inside the static motion mode <MotionFeatures> enters when framer's
 * features never arrive (issue #200). There, `m.*` styles follow their props
 * on every render, but a motion value in `style` (a scroll-linked
 * `useTransform`, a spring) is read once per render and never written again:
 * nothing subscribes to it. An effect built only from motion values freezes
 * at whatever it read, so a component turns such an effect OFF here rather
 * than leave it stuck mid-way (the guestbook card's depth blur is the case).
 */
export function useStaticMotion() {
  return useContext(MotionConfigContext).isStatic === true;
}
