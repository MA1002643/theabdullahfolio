"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import {
  clearProjectFilterHandoff,
  isProjectsRoute,
} from "@/lib/projectFilterHandoff";

/**
 * Voids the /projects filter handoff the moment the visitor is anywhere
 * outside the projects area. Renders nothing.
 *
 * This is the half of the handoff contract that the two projects components
 * can't enforce themselves: a token minted by a card click stays valid while
 * the visitor is on the detail page, so the expiry has to be observed from a
 * route they are no longer on. Watching for the DEPARTURE from the list (an
 * unmount cleanup in ProjectList) can't work either — that fires on the way to
 * the detail page too, which is the one journey the token exists to survive.
 *
 * Hence: mounted once in the ROOT layout, so it also sees `/` — the homepage
 * lives outside the (sub pages) layout, and "detail → home → projects" is
 * precisely one of the journeys that must land on "All".
 *
 * Clearing and reading can never collide in one commit: this only ever clears
 * on a non-projects route, and ProjectList only ever reads on /projects. So
 * the fix doesn't depend on the order React happens to run parent and child
 * effects in.
 */
export default function ProjectFilterHandoffGuard() {
  const pathname = usePathname();

  useEffect(() => {
    if (!isProjectsRoute(pathname)) clearProjectFilterHandoff();
  }, [pathname]);

  return null;
}
