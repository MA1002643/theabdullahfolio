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
  // The command palette's "Toggle motion" writes this pref. ONE switch, EVERY
  // layer (code review — MotionConfig reaches framer alone, and "motion off"
  // used to leave the aurora and the CSS shimmer running):
  //   · MotionConfig turns it into reducedMotion="always" for every motion.*
  //     animation on the page — and, through the project's useReducedMotion
  //     (@/hooks, which reads this config as well as the OS query; framer's
  //     own hook reads the OS alone), for every component branch that
  //     decides its own stillness (cards, headline, tilt, magnet, the
  //     presence ping, the burst, the count-ups);
  //   · the wrapper below exposes the same verdict as data-motion, which the
  //     guestbook's CSS keyframes gate on beside the OS query (globals.css:
  //     .gb-pending), and any future guestbook CSS animation must too;
  //   · the aurora mount takes it as `enabled`, since it otherwise reads only
  //     the OS query.
  // The OS-level preference is respected independently of the toggle by
  // every layer ("user", the media query, the mount's own query).
  const { motion: motionAllowed } = useGuestbookPrefs();

  return (
    <MotionConfig reducedMotion={motionAllowed ? "user" : "always"}>
      {/* `contents`: the wrapper exists for its attribute and generates no
          box, so the fixed layers, the layout and the (sub pages) <main>
          landmark (issue #86 — no nested <main>) are exactly as before.
          Background mirrors the About page EXACTLY (owner call): the same
          contact-bg.png at half opacity, static (no scroll parallax), a black
          overlay to deepen it, then the ambient layer composited over the
          top. `alt=""` marks it decorative. */}
      <div data-motion={motionAllowed ? "on" : "off"} className="contents">
        <Image
          src={bg}
          alt=""
          priority
          sizes="100vw"
          className="-z-50 fixed top-0 left-0 w-full h-full object-cover object-center opacity-50"
        />
        <div className="-z-40 fixed top-0 left-0 w-full h-full bg-black/70" />

        {/* Ambient layer — the shared aurora, matching /about exactly (owner
            call). It self-gates on the OS motion preference + loader reveal,
            and on the manual toggle through `enabled`; the static image
            above is the fallback either way. The guestbook's own ember-field
            shader that used to sit behind a flag here was removed outright
            once the match-/about decision stuck. */}
        <AuroraDustMount enabled={motionAllowed} />

        {/* Headline: the scramble-decode variant when its flag is up (same
            .page-title-* classes, replays when a new message lands),
            otherwise the shared PageTitle with the standard ignite — so
            killing the flag returns the page to the exact sitewide treatment
            (issue #104). The flag is currently OFF (owner call): this
            headline must match every other sub-page's ignite exactly. */}
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
      </div>
    </MotionConfig>
  );
}
