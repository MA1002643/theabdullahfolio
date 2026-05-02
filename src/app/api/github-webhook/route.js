import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { invalidate } from '@/utils/workStatusCache';

// GitHub webhook receiver. Validates the X-Hub-Signature-256 header against
// GITHUB_WEBHOOK_SECRET, ignores events from any repo other than
// MA1002643/theabdullahfolio (spec section 2.2), and busts the work-status
// cache so the next client poll picks up the new activity.

const ALLOWED_REPO = 'MA1002643/theabdullahfolio';
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

  const fullName = payload?.repository?.full_name;
  if (fullName !== ALLOWED_REPO) {
    return NextResponse.json({ ok: true, ignored: 'repo' });
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
