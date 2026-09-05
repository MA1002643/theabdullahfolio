// Per-visitor guestbook preferences (issue #40 Phase 4): UI sounds and a
// manual motion kill-switch, both toggled from the command palette and
// persisted in localStorage. A tiny module store with a subscribe API —
// consumed through useSyncExternalStore — because three unrelated mount
// points (palette, sound hook, shader gate) need the same live value and none
// of them share a React ancestor worth threading context through.
//
// Defaults are the conservative ones: sound OFF (never autoplay anything),
// motion ON (the OS-level prefers-reduced-motion already covers users who
// asked their platform for stillness — this switch is an extra, manual off).
const KEY = 'guestbook:prefs';

const DEFAULTS = { sound: false, motion: true };

let state = DEFAULTS;
let loaded = false;
const listeners = new Set();

function load() {
  if (loaded || typeof window === 'undefined') return;
  loaded = true;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      state = {
        sound: parsed.sound === true,
        motion: parsed.motion !== false,
      };
    }
  } catch {
    // Unreadable storage (private mode, corrupt entry) → defaults.
  }
}

function persist() {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Storage full/blocked — the in-memory value still works for the session.
  }
}

export function getPrefs() {
  load();
  return state;
}

// SSR snapshot: the defaults, so server and first client render agree.
export function getServerPrefs() {
  return DEFAULTS;
}

export function togglePref(name) {
  load();
  state = { ...state, [name]: !state[name] };
  persist();
  for (const l of listeners) l();
}

export function subscribePrefs(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
