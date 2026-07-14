'use client';

// The footer's IDENTITY block with the owner-chosen "Wet Ink" entrance (issue #30
// follow-up, picked from four identity-reveal candidates over Anneal / Kiln Cast /
// Rack-Focus). On first scroll-into-view — gated on the intro loader so it's never
// spent behind the overlay — the block writes itself on like a signature:
//   • the ember RULE is laid first as a pen stroke that draws to full width then
//     RETRACTS to its resting length as the name lands,
//   • the NAME "inks down" top→bottom (clip-path) as the stroke settles,
//   • the ROLE snaps up from its ember tick (which sparks),
//   • the STATEMENT rises "as the ink dries", the divider draws,
//   • the GitHub CTA lands last — its own git-graph self-draw then plays on top.
//
// The choreography is pure CSS keyframes keyed off a `data-revealed` attribute
// (see `.footer-identity[data-revealed]` in globals.css), NOT framer inline
// styles — deliberately, so the RULE keeps its CSS scaleX(0.28)→scaleX(1) hover
// after the entrance (a held inline/animated transform would block the :hover).
// Everything is transform/opacity/clip-path + one small blur → GPU, no CLS. Under
// prefers-reduced-motion the block is shown still at rest, nothing moving.
//
// Detection reuses the footer's shared reveal gate (useFooterReveal): fire when
// ~40% of the block is on screen + the intro loader has lifted, and re-arm when
// it scrolls fully out of view — so on this persistent footer the signature is
// never spent by a page-transition transient and re-inks every time the block is
// actually scrolled to. Same gate as FooterManifest / ElsewhereTerminal.

import { useRef } from 'react';
import { useFooterReveal } from './useFooterReveal';
import ProjectGithubCta from './ProjectGithubCta';
import { brand } from './footer-data';

export default function FooterIdentity() {
  const ref = useRef(null);
  const revealed = useFooterReveal(ref, 0.4);

  return (
    <div
      ref={ref}
      data-revealed={revealed ? 'true' : undefined}
      className="footer-identity relative isolate md:col-span-2 lg:col-span-1"
    >
      {/* Signature watermark — decorative, out of flow, aria-hidden. */}
      <span
        aria-hidden="true"
        className="text-glow-stroke-neon pointer-events-none absolute -left-1 -top-7 -z-10 select-none leading-none opacity-[0.06]"
        style={{ fontSize: 'clamp(4rem, 10vw, 7rem)' }}
      >
        MA
      </span>

      {/* NAME — the drop-shadow floor-glow moves to the (unclipped) wrapper so the
          clip-path ink-pour never hard-slices the glow (clip-path clips after
          filter); the gradient + background-clip:text stay on the <p>. */}
      <div className="footer-identity__name-wrap">
        <p className="footer-identity__name text-[2rem] md:text-[2.4rem]">
          {brand.name}
        </p>
      </div>
      <div className="footer-identity__rule mt-3" aria-hidden="true" />
      <p className="footer-identity__role mt-3">{brand.role}</p>
      <p className="footer-identity__stmt mt-4 max-w-[36ch] text-[0.95rem] leading-relaxed text-foreground">
        {brand.statement}
      </p>
      <div
        className="elite-divider footer-identity__divider mt-4 h-px w-12"
        aria-hidden="true"
      />

      {/* Signature CTA — self-draws its own git-graph; we only fade its wrapper in
          as the last beat so it lands after the name without fighting the draw. */}
      <div className="footer-identity__cta">
        <ProjectGithubCta />
      </div>
    </div>
  );
}
