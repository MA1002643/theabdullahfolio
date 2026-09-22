// Sets the two Search Console credentials in Vercel (issue #32, W6).
//
// The Google-side steps cannot be scripted — they are clicks in Search Console
// and the Google Cloud console, and docs/seo.md §9 lists them. This handles the
// half that is scriptable and the half most likely to go wrong: the service
// account key must be BASE64-ENCODED before it reaches an environment variable,
// because the raw JSON contains literal newlines inside `private_key` and every
// env-var UI mangles those differently. A key pasted raw produces a route that
// authenticates against Google and fails with an opaque signature error.
//
// ── Usage ───────────────────────────────────────────────────────────────────
//     node scripts/set-gsc-credentials.mjs \
//       --verification <token from Search Console> \
//       --key ./service-account-key.json
//
// Either flag may be omitted to set only the other.
//
// ── What it does NOT do ─────────────────────────────────────────────────────
// It never prints either value, never writes them to a file, and never commits
// anything (CLAUDE.md §1). The key file it reads should live OUTSIDE this
// repository; if it must sit inside temporarily, delete it afterwards — `.env*`
// is gitignored but a stray `service-account-key.json` is not.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : null;
}

const verification = arg('verification');
const keyPath = arg('key');
const siteUrl = arg('site-url');

if (!verification && !keyPath && !siteUrl) {
  console.error(
    'Nothing to do. Pass any of:\n' +
      '  --verification <token>   the content="…" value from Search Console\'s HTML-tag method\n' +
      '  --key <path>             the downloaded service-account JSON key\n' +
      '  --site-url <url>         only for a URL-PREFIX property, e.g. https://ma.codes/\n\n' +
      'See docs/seo.md §9 for where each value comes from.',
  );
  process.exit(1);
}

/**
 * Write one variable to Vercel production.
 *
 * `vercel env add` reads the value from STDIN, which is what keeps it off the
 * process argument list — an argv is readable by any other process on the
 * machine for as long as the command runs.
 */
function setVar(name, value, sensitive) {
  // `--force` overwrites an existing value rather than erroring, so re-running
  // this after rotating a key does the obvious thing. `--yes` skips the
  // confirmation prompt — without it the CLI waits on a keypress that cannot
  // arrive, because STDIN is already being used to carry the value, and the
  // script hangs rather than failing.
  const args = ['env', 'add', name, 'production', '--force', '--yes'];
  // Both flags are passed EXPLICITLY. Passing neither does not mean
  // "non-sensitive": this project's policy defaults new variables to sensitive,
  // and a sensitive variable is write-only — it cannot be read back through the
  // dashboard, the API or `vercel env pull`. For the two values here that are
  // not secrets (the verification token is published in a meta tag on every
  // page; the property identifier is a URL), that would make a misconfiguration
  // undiagnosable without deleting and re-adding it.
  args.push(sensitive ? '--sensitive' : '--no-sensitive');
  try {
    execFileSync('vercel', args, { input: value, stdio: ['pipe', 'ignore', 'inherit'] });
    console.log(`${name} — set (production)`);
  } catch {
    console.error(`${name} — FAILED. Is the Vercel CLI linked to this project?`);
    process.exitCode = 1;
  }
}

if (verification) {
  // Not strictly a secret — it is published in a meta tag on every page the
  // moment it is set — so it is stored as an ordinary encrypted variable rather
  // than a write-only sensitive one, which keeps it readable for diagnosis.
  setVar('GOOGLE_SITE_VERIFICATION', verification.trim(), false);
}

if (siteUrl) {
  // Only for a URL-PREFIX property. The route defaults to `sc-domain:<host>` —
  // a Domain property, which covers every subdomain and both schemes — so this
  // variable being SET is the unusual case, not the normal one.
  //
  // A URL-prefix property identifier must carry its trailing slash: Search
  // Console treats `https://ma.codes` and `https://ma.codes/` as different
  // strings and answers 403 for the one that was not registered, which surfaces
  // as a permissions error rather than a typo.
  const normalised = siteUrl.endsWith('/') ? siteUrl : `${siteUrl}/`;
  if (normalised !== siteUrl) {
    console.log(`Added the required trailing slash: ${normalised}`);
  }
  setVar('GSC_SITE_URL', normalised, false);
}

if (keyPath) {
  const raw = readFileSync(keyPath, 'utf8');

  // Validate before sending. A malformed key produces a route that fails at
  // request time with an authentication error, days later, in a cron run nobody
  // is watching — whereas the shape is checkable right here.
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.error(`${keyPath} is not valid JSON — is it the downloaded key file?`);
    process.exit(1);
  }
  for (const field of ['client_email', 'private_key', 'type']) {
    if (!parsed[field]) {
      console.error(`${keyPath} has no \`${field}\` — this does not look like a service-account key.`);
      process.exit(1);
    }
  }
  if (parsed.type !== 'service_account') {
    console.error(`${keyPath} is a \`${parsed.type}\` key, not a service account.`);
    process.exit(1);
  }

  // The one line that matters. Base64 of the raw file bytes, newlines and all.
  setVar('GSC_SERVICE_ACCOUNT_KEY', Buffer.from(raw, 'utf8').toString('base64'), true);

  // The client_email is NOT a secret — it is the address that has to be added
  // as a user on the Search Console property, and printing it is the only way
  // the next step is actionable without reopening the key file.
  console.log(
    `\nNext: add this service account as a user on the Search Console property\n` +
      `(Settings → Users and permissions → Add user, permission "Full" or "Restricted"):\n\n` +
      `    ${parsed.client_email}\n`,
  );
}

console.log(
  '\nEnvironment variables are baked into a deployment when it is CREATED, not read\n' +
    'per request — so redeploy production for these to take effect.',
);
