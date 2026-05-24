import crypto from "node:crypto";
import { NextResponse } from "next/server";

// Shared helpers for the cron route surface (/api/daily-warmup and the
// downstream /api/repo-refresh). Centralized here so the security-sensitive
// bearer-token compare and the no-cache response shape stay in lockstep
// across routes — historically each route had its own copy, which is a
// known drift hazard (one route updated, the other forgotten). Folder is
// `_utils` so Next.js's underscore-prefix convention excludes it from
// routing.

// Constant-time bearer-token compare. The length pre-check is required
// because `crypto.timingSafeEqual` throws on mismatched buffer lengths,
// but the check itself is constant-time (one operation regardless of how
// long the wrong-length input is), so it doesn't reintroduce a length-
// based timing side-channel. We compare *byte* lengths (not JS string
// `.length`, which counts UTF-16 code units) so a non-ASCII secret can't
// pass the gate and then trip the throw inside the catch — that path
// works but is slower than the constant-time compare and would leak
// timing info that distinguishes "byte-mismatched non-ASCII" inputs from
// "length-matched mismatched" inputs.
export function safeBearerEqual(headerValue, expectedSecret) {
  if (typeof headerValue !== "string" || !headerValue.startsWith("Bearer ")) {
    return false;
  }
  const providedBuf = Buffer.from(headerValue.slice("Bearer ".length), "utf8");
  const expectedBuf = Buffer.from(expectedSecret, "utf8");
  if (providedBuf.length !== expectedBuf.length) return false;
  try {
    return crypto.timingSafeEqual(providedBuf, expectedBuf);
  } catch {
    return false;
  }
}

// Every response from these cron routes is a side-effect receipt — a
// cached 200 would mask a skipped cron run. Helper pins `Cache-Control:
// no-store` on every response path without each call site having to
// repeat the header literal.
const NO_STORE_HEADERS = { "Cache-Control": "no-store" };
export const noStoreJson = (body, init = {}) =>
  NextResponse.json(body, {
    ...init,
    headers: { ...NO_STORE_HEADERS, ...(init.headers ?? {}) },
  });
