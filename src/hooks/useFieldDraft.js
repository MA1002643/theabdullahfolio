'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { DRAFT_TTL_MS, readJSON, remove, writeJSON } from '@/lib/contact';

// useFieldDraft — the contact form's draft-autosave feature (useFormDraft),
// re-cut for a SINGLE controlled field: the guestbook composer's message input.
// The value is autosaved to localStorage as the visitor types and restored on a
// later visit, so a half-written mark survives a refresh, an accidental
// navigation, or a tab crash.
//
// Differences from useFormDraft are all consequences of the field being
// controlled state rather than a react-hook-form model:
//   - Autosave keys on the `value` prop instead of a watch() subscription, so
//     storage simply mirrors the field: a non-empty value debounce-writes, an
//     empty one removes the draft. That makes the stored draft self-cleaning —
//     the submit flow's optimistic clear (writeField('')) deletes it, and a
//     failed submit's restore re-saves it, with no clearStored() choreography.
//   - Restore still goes through the caller's `writeField` (setNativeValue
//     under the hood) so the FireInput gradient overlay repaints in the same
//     dispatch — the one mechanism that keeps model and painted glyphs in sync.
//
// Returns:
//   restored        — true once a fresh, non-empty draft was repopulated
//   dismissRestored — hide the banner but keep the content and keep autosaving
//   clearDraft()    — empty the field AND drop the stored draft (the "Clear"
//                     action on the restored banner)
const SAVE_DEBOUNCE_MS = 600;

export function useFieldDraft({ storageKey, value, writeField, ttlMs = DRAFT_TTL_MS }) {
  const [restored, setRestored] = useState(false);
  // Latest-callback ref so the mount-time restore effect and clearDraft can
  // call the caller's writer without the effect depending on its (per-render)
  // identity.
  const writeFieldRef = useRef(writeField);
  writeFieldRef.current = writeField;
  // The autosave effect below also runs on the mount pass, where `value` is
  // still the initial '' — without this skip it would delete the stored draft
  // in the same commit the restore effect is repopulating it from.
  const skipNextSaveRef = useRef(true);

  // Restore once, on mount. Declared BEFORE the autosave effect on purpose:
  // effects run in declaration order, so the restore's field write lands (and
  // re-renders with the restored value) before autosave ever considers acting.
  useEffect(() => {
    const draft = readJSON(storageKey);
    if (!draft || typeof draft.value !== 'string') return;
    if (draft.savedAt && Date.now() - draft.savedAt > ttlMs) {
      remove(storageKey);
      return;
    }
    if (!draft.value.trim()) return;
    writeFieldRef.current(draft.value);
    setRestored(true);
  }, [storageKey, ttlMs]);

  // Autosave: mirror the field into storage — debounced write while there is
  // content, immediate remove once it empties. The cleanup cancels the pending
  // write on every change, so a clear can never be resurrected by a save that
  // was scheduled moments before it.
  useEffect(() => {
    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false;
      return undefined;
    }
    if (!value.trim()) {
      remove(storageKey);
      return undefined;
    }
    const timer = setTimeout(
      () => writeJSON(storageKey, { value, savedAt: Date.now() }),
      SAVE_DEBOUNCE_MS,
    );
    return () => clearTimeout(timer);
  }, [value, storageKey]);

  const dismissRestored = useCallback(() => setRestored(false), []);

  const clearDraft = useCallback(() => {
    // Emptying the field routes back through the autosave effect, which
    // removes the stored draft; the direct remove() just closes the window
    // where a tab could die between this call and that effect.
    writeFieldRef.current('');
    remove(storageKey);
    setRestored(false);
  }, [storageKey]);

  return { restored, dismissRestored, clearDraft };
}
