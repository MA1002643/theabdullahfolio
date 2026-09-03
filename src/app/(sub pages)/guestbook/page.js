"use client"
import Image from "next/image";
import { MotionConfig } from "framer-motion";
import bg from "../../../../public/background/contact-bg.png";
import AuroraDustMount from "@/components/AuroraDustMount";
import PageTitle from "@/components/PageTitle";
import GuestbookTitle from "@/components/guestbook/GuestbookTitle";
import GuestbookApp from "@/components/guestbook/GuestbookApp";
import { useGuestbookPrefs } from "@/hooks/useGuestbookPrefs";
import { GUESTBOOK_FLAGS } from "@/lib/flags";

export default function Guestbook() {
  // The command palette's "Toggle motion" writes this pref; MotionConfig
  // turns it into reducedMotion="always" for EVERY framer animation on the
  // page (cards, headline, tilt, magnet — they all read useReducedMotion).
  // The OS-level preference is respected independently of the toggle.
  const { motion: motionAllowed } = useGuestbookPrefs();

  return (
    <MotionConfig reducedMotion={motionAllowed ? "user" : "always"}>
      {/* Fragment content, not <main>: the (sub pages) layout already provides
          the one <main> landmark (issue #86 — nested <main> is invalid HTML).
          Background mirrors the About page EXACTLY (owner call): the same
          contact-bg.png at half opacity, static (no scroll parallax), a black
          overlay to deepen it, then the ambient layer composited over the
          top. `alt=""` marks it decorative. */}
      <Image
        src={bg}
        alt=""
        priority
        sizes="100vw"
        className="-z-50 fixed top-0 left-0 w-full h-full object-cover object-center opacity-50"
      />
      <div className="-z-40 fixed top-0 left-0 w-full h-full bg-black/70" />

      {/* Ambient layer — the shared aurora, matching /about exactly (owner
          call). It self-gates on motion preference + loader reveal; the
          static image above is the reduced-motion fallback. The guestbook's
          own ember-field shader that used to sit behind a flag here was
          removed outright once the match-/about decision stuck. */}
      <AuroraDustMount />

      {/* Headline: the scramble-decode variant when its flag is up (same
          .page-title-* classes, replays when a new message lands), otherwise
          the shared PageTitle with the standard ignite — so killing the flag
          returns the page to the exact sitewide treatment (issue #104).
          The flag is currently OFF (owner call): this headline must match
          every other sub-page's ignite exactly. */}
      {GUESTBOOK_FLAGS.scramble ? (
        <GuestbookTitle
          title="GUESTBOOK"
          subtitle="LEAVE YOUR MARK"
          id="guestbook"
        />
      ) : (
        <PageTitle
          title="GUESTBOOK"
          subtitle="LEAVE YOUR MARK"
          id="guestbook"
          replayOnView
        />
      )}

      <GuestbookApp />
    </MotionConfig>
  );
}
