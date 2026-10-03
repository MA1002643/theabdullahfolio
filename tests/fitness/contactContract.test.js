import { describe, expect, it } from 'vitest';

import { CONTACT_CLIENT_LIMITS, CONTACT_SERVER_LIMITS } from '@/lib/contactLimits';

import { read, stripComments } from '../support/source.js';

// The contact form's client/server contract (issue #92, L1).
//
// The form validates in the browser and the route validates again on the
// server. If the client is ever LOOSER than the server, a visitor can compose a
// message the form accepts and the server rejects. For a live send that is an
// error toast; for a message parked in the offline queue it is worse, because
// the queue retries a request that can never succeed.

const FIELDS = ['name', 'subject', 'message'];

describe('contact contract — client limits never looser than the server', () => {
  it.each(FIELDS)('%s: client max ≤ server max', (field) => {
    expect(CONTACT_CLIENT_LIMITS[field].max).toBeLessThanOrEqual(
      CONTACT_SERVER_LIMITS[field].max,
    );
  });

  it.each(FIELDS)('%s: client min (if any) ≤ client max', (field) => {
    const { min = 0, max } = CONTACT_CLIENT_LIMITS[field];
    expect(min).toBeLessThanOrEqual(max);
  });

  it('both sides read the shared module, with no limit typed inline', () => {
    // The refactor only holds if nobody reintroduces a literal. A bare number
    // in a maxLength/minLength rule, or a length compare against a number in
    // the route, is exactly how the two sides drifted apart before.
    const form = stripComments(read('src/components/contact/Form.jsx'));
    const route = stripComments(read('src/app/api/send-mail/route.js'));
    expect(form).toMatch(/from '\.\.\/\.\.\/lib\/contactLimits'/);
    expect(route).toMatch(/from '@\/lib\/contactLimits'/);
    expect(form).not.toMatch(/(?:min|max)Length:\s*\{\s*value:\s*\d/);
    expect(route).not.toMatch(/(?:name|subject|message)\.length\s*>\s*\d/);
  });
});
