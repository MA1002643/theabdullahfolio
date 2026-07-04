import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { invalidate } from '@/utils/workStatusCache';
import { isTrackedRepo } from '@/utils/workTrackedRepos';

// GitHub webhook receiver. Validates the X-Hub-Signature-256 header against
// GITHUB_WEBHOOK_SECRET, ignores events from any repo outside the
// workTrackedRepos allow-list (issue #94 §3.6 — the same webhook is
// installed on every tracked repo), and busts the work-status cache so
// the next client poll picks up the new activity.

const ALLOWED_EVENTS = new Set([
  'push',
  'pull_request',
  'issues',
  'issue_comment',
  'ping',
]);

export const runtime = 'nodejs';

export async function POST(request) {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: 'webhook secret not configured' },
      { status: 503 },
    );
  }

  const signatureHeader = request.headers.get('x-hub-signature-256');
  const event = request.headers.get('x-github-event') ?? '';
  const rawBody = await request.text();

  if (!signatureHeader || !verifySignature(rawBody, signatureHeader, secret)) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
  }

  if (!ALLOWED_EVENTS.has(event)) {
    return NextResponse.json({ ok: true, ignored: 'event' });
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  // Ping events from GitHub don't include a repository in older payloads;
  // accept them so the webhook setup test passes.
  if (event === 'ping') {
    return NextResponse.json({ ok: true, pong: true });
  }

  // Allow-list gate (§3.6): a webhook left installed on an untracked repo
  // (or the MULTI_REPO_HEADER=false rollback narrowing the list) must not
  // trigger work. 204 keeps GitHub's delivery log green — no error-loop,
  // no redelivery storm — while doing nothing.
  const fullName = payload?.repository?.full_name;
  if (!isTrackedRepo(fullName)) {
    return new NextResponse(null, { status: 204 });
  }

  invalidate();

  return NextResponse.json({ ok: true, event, busted: true });
}

// Constant-time HMAC compare. GitHub sends "sha256=<hex>"; both sides are
// hashed and length-checked before comparison so a length mismatch can't
// short-circuit and leak timing info.
function verifySignature(rawBody, signatureHeader, secret) {
  if (!signatureHeader.startsWith('sha256=')) return false;

  const provided = signatureHeader.slice('sha256='.length);
  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody, 'utf8')
    .digest('hex');

  if (provided.length !== expected.length) return false;

  try {
    return crypto.timingSafeEqual(
      Buffer.from(provided, 'hex'),
      Buffer.from(expected, 'hex'),
    );
  } catch {
    return false;
  }
}
