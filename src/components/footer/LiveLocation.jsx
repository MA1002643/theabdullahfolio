'use client';

// The footer's live-location signal — the "Ember Meridian" treatment (issue #30
// follow-up, chosen by the owner from the candidate set). It REPLACES the
// calling card's static place line with the owner's real current town + local
// time, engraved into the same graphite plate rather than nested as a second
// plate: a day/night glyph, an ember-gradient clock, the town as a kicker, the
// UTC offset, and a LIVE pulse shown only when the GPS fix is genuinely fresh.
//
// Data is live from /api/location (a tracker app on the phone feeds it; see
// docs/live-location.md). The endpoint only ever returns { town, tz, live } —
// never coordinates — and applies a freshness guard, so when the tracker is off
// this quietly shows the home city (Bolton) with no LIVE flag. Home is the
// SSR-safe default; the live fix swaps in after fetch. Because the clock now
// lives here, the identity block's availability line is just the "open to new
// roles" flag, so the live time is still shown exactly once.
//
// Hydration-safe: the clock is null on the server and on first client render, so
// SSR and hydration agree, then it fills in on mount and ticks. The breathing
// dot is CSS-only and is stilled under prefers-reduced-motion.

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { availability } from './footer-data';

const LOCATION_ENDPOINT = '/api/location';
const LOCATION_POLL_MS = 5 * 60 * 1000; // re-check the city every 5 min
const LOCATION_FETCH_TIMEOUT_MS = 10 * 1000; // abort a hung location fetch
const CLOCK_TICK_MS = 15 * 1000; // advance the clock 4×/min

// Everything the plate shows about "now", derived from an IANA zone. Intl does
// all the DST/offset work, so nothing is hardcoded regardless of the city.
function readClock(timeZone) {
  try {
    const now = new Date();
    const pretty = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(now); // e.g. "1:01 am"
    const parts = pretty.match(/(\d{1,2}:\d{2})\s*([ap]m)/i);

    // 24h hour drives the day/night glyph. hourCycle h23 avoids a "24" at
    // midnight so the 6–18 daytime test is exact.
    const hour24 = Number(
      new Intl.DateTimeFormat('en-GB', {
        timeZone,
        hour: '2-digit',
        hourCycle: 'h23',
      }).format(now),
    );

    let offset = '';
    try {
      offset =
        new Intl.DateTimeFormat('en-GB', { timeZone, timeZoneName: 'shortOffset' })
          .formatToParts(now)
          .find((p) => p.type === 'timeZoneName')?.value || '';
    } catch {
      /* older runtimes without shortOffset — just omit the offset */
    }

    return {
      time: parts ? parts[1] : pretty,
      ampm: parts ? parts[2].toUpperCase() : '',
      day: Number.isFinite(hour24) ? hour24 >= 6 && hour24 < 18 : true,
      offset,
    };
  } catch {
    return null;
  }
}

export default function LiveLocation() {
  // Home city is the SSR-safe default; the live fix swaps in after fetch.
  const [place, setPlace] = useState({
    town: availability.city,
    tz: availability.timeZone,
    live: false,
  });
  // null until mounted so SSR and the first client render agree (no clock flash,
  // no hydration mismatch); it fills in on mount and then ticks.
  const [clock, setClock] = useState(null);

  // Poll the live-location endpoint; on any failure keep the current place.
  // Polls are SERIALIZED — the next one is scheduled only once the current fetch
  // settles (setTimeout chain, not setInterval), so a slow response can never
  // overwrite a newer one and hung requests can't pile up. Each fetch is bounded
  // by an AbortController that fires on timeout or on unmount.
  useEffect(() => {
    let cancelled = false;
    let pollId;
    let controller;

    const load = async () => {
      controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), LOCATION_FETCH_TIMEOUT_MS);
      try {
        const res = await fetch(LOCATION_ENDPOINT, {
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && data && data.town && data.tz) {
          setPlace({ town: data.town, tz: data.tz, live: Boolean(data.live) });
        }
      } catch {
        /* offline / endpoint down / aborted — keep showing the last known place */
      } finally {
        clearTimeout(timeoutId);
        // Re-arm from the tail of this request, not on a fixed interval. Skipped
        // after unmount so the chain stops cleanly.
        if (!cancelled) pollId = setTimeout(load, LOCATION_POLL_MS);
      }
    };

    load();
    return () => {
      cancelled = true;
      clearTimeout(pollId);
      controller?.abort();
    };
  }, []);

  // Tick the clock in whatever timezone `place` currently is.
  useEffect(() => {
    const tick = () => setClock(readClock(place.tz));
    tick();
    const id = setInterval(tick, CLOCK_TICK_MS);
    return () => clearInterval(id);
  }, [place.tz]);

  // Sun by day, moon by night; default to Sun before the clock resolves so the
  // glyph never flips from a wrong default on mount.
  const Glyph = clock && !clock.day ? Moon : Sun;

  return (
    <div
      className="live-place"
      role="group"
      aria-label={
        clock
          ? `Local time ${clock.time} ${clock.ampm} in ${place.town}`
          : `Location: ${place.town}`
      }
    >
      <span className="live-place__glyph" aria-hidden="true">
        <Glyph strokeWidth={1.7} />
      </span>

      <div className="live-place__body">
        <div className="live-place__time">
          <span className="live-place__digits">{clock ? clock.time : '—:—'}</span>
          {clock?.ampm && <span className="live-place__ampm">{clock.ampm}</span>}
          {place.live && (
            <span className="live-place__live">
              <span className="live-place__dot" aria-hidden="true">
                <span className="live-place__dot-halo" />
                <span className="live-place__dot-core" />
              </span>
              LIVE
            </span>
          )}
        </div>
        <div className="live-place__meta">
          <span className="live-place__town">{place.town}</span>
          {clock?.offset && <span className="live-place__tz">{clock.offset}</span>}
        </div>
      </div>
    </div>
  );
}
