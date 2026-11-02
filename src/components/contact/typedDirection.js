// The reading direction of a FireInput / FireTextarea (issue #82).
//
// `dir` is the direction of TYPED text: "auto" (follow the script typed, for a
// name or a message) or "ltr" (an email address, which is Latin and
// punctuation-heavy, and in a right-to-left base would jump its dots and @ as
// they are typed). It applies only once the field holds something. Empty, the
// field carries no `dir` at all and inherits the page's, so the caret waits on
// the page's side in every locale. Left as "auto" while empty it resolved to
// left-to-right (there are no letters to go by), and on an Urdu, Arabic,
// Persian or Hebrew page the empty name, subject and message started at the
// left while the email beside them started at the right.
//
// Set on the real field and on the overlay that paints its text, so the two
// always resolve the same way. Managed here, not through React, because it
// changes with every keystroke of an uncontrolled field.
export function applyTypedDirection(field, overlay, dir) {
  const value = dir && field.value ? dir : null;
  for (const el of [field, overlay]) {
    if (value) el.setAttribute('dir', value);
    else el.removeAttribute('dir');
  }
}
