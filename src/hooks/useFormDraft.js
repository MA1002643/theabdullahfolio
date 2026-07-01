'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DRAFT_KEY,
  DRAFT_TTL_MS,
  readJSON,
  remove,
  setNativeValue,
  writeJSON,
} from '@/lib/contact';

// useFormDraft — autosaves the four contact fields to localStorage as the
// visitor types and restores them on a later visit, so a half-written message
// survives a refresh, an accidental navigation, or a tab crash.
//
// Restore is done by writing each value into its <input>/<textarea> via
// setNativeValue (the native-setter + input-dispatch trick), NOT react-hook-form
// reset(): that single mechanism updates BOTH react-hook-form's model AND the
// FireInput/FireTextarea gradient overlays, which only repaint on input events.
// Child effects run before parent effects, so by the time this parent-level
// effect fires, the overlays are already listening — the dispatched input lands.
//
// Returns:
//   restored        — true once a fresh, non-empty draft was repopulated
//   clearDraft()    — empty every field AND drop the stored draft (the "Clear"
//                     action on the restored banner)
//   dismissRestored — hide the banner but keep the content and keep autosaving
//   clearStored()   — drop the stored draft only (call on a successful send,
//                     where the form is about to remount empty anyway)
const SAVE_DEBOUNCE_MS = 600;

export function useFormDraft({ watch, formRef, fields }) {
  const [restored, setRestored] = useState(false);
  // True only during a programmatic repopulate, so the input events it fires
  // don't immediately bounce back through the autosave subscription.
  const restoringRef = useRef(false);
  // The pending debounced-save timer. Held in a ref (not the watch effect's
  // closure) so clearStored/clearDraft can cancel a just-scheduled write before
  // it can recreate a draft we're trying to remove.
  const saveTimerRef = useRef(null);

  // Restore once, on mount.
  useEffect(() => {
    const draft = readJSON(DRAFT_KEY);
    if (!draft?.fields) return;
    if (draft.savedAt && Date.now() - draft.savedAt > DRAFT_TTL_MS) {
      remove(DRAFT_KEY);
      return;
    }
    const hasContent = fields.some((f) => (draft.fields[f] || '').trim());
    if (!hasContent) return;
    const root = formRef.current;
    if (!root) return;

    restoringRef.current = true;
    root.querySelectorAll('input, textarea').forEach((el) => {
      const v = draft.fields[el.name];
      if (typeof v === 'string' && v) setNativeValue(el, v);
    });
    restoringRef.current = false;
    setRestored(true);
    // Run once at mount; formRef/fields are stable for the form's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Autosave: subscribe to value changes (no re-render) and debounce-write.
  useEffect(() => {
    const sub = watch((values) => {
      if (restoringRef.current) return;
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        const next = {};
        let hasContent = false;
        fields.forEach((f) => {
          const v = typeof values[f] === 'string' ? values[f] : '';
          next[f] = v;
          if (v.trim()) hasContent = true;
        });
        if (hasContent) writeJSON(DRAFT_KEY, { fields: next, savedAt: Date.now() });
        else remove(DRAFT_KEY);
      }, SAVE_DEBOUNCE_MS);
    });
    return () => {
      clearTimeout(saveTimerRef.current);
      sub.unsubscribe();
    };
  }, [watch, fields]);

  // Cancel any debounced save still in flight — otherwise a write scheduled
  // moments before a clear would fire afterwards and resurrect the draft we
  // just removed.
  const cancelPendingSave = useCallback(() => {
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = null;
  }, []);

  const clearStored = useCallback(() => {
    cancelPendingSave();
    remove(DRAFT_KEY);
    setRestored(false);
  }, [cancelPendingSave]);

  const clearDraft = useCallback(() => {
    const root = formRef.current;
    if (root) {
      restoringRef.current = true;
      root.querySelectorAll('input, textarea').forEach((el) => setNativeValue(el, ''));
      restoringRef.current = false;
    }
    cancelPendingSave();
    remove(DRAFT_KEY);
    setRestored(false);
  }, [formRef, cancelPendingSave]);

  const dismissRestored = useCallback(() => setRestored(false), []);

  return { restored, clearDraft, dismissRestored, clearStored };
}
