import { describe, expect, it } from 'vitest';
import { isApplePlatform, paletteShortcutLabel } from '@/components/commandPalette/shortcut';

// The advertised palette shortcut follows the reader's platform (shortcut.js):
// the palette listens for both ⌘K and Ctrl+K, but a hint must show the key
// the keyboard in front of the reader actually has.

describe('paletteShortcutLabel — ⌘K on Apple platforms, Ctrl+K everywhere else', () => {
  it('reads the UA-CH platform hint first', () => {
    expect(paletteShortcutLabel({ userAgentData: { platform: 'macOS' }, platform: 'Win32' })).toBe('⌘K');
    expect(paletteShortcutLabel({ userAgentData: { platform: 'Windows' }, platform: 'MacIntel' })).toBe(
      'Ctrl+K',
    );
    expect(paletteShortcutLabel({ userAgentData: { platform: 'Linux' } })).toBe('Ctrl+K');
  });

  it('falls back to navigator.platform', () => {
    expect(paletteShortcutLabel({ platform: 'MacIntel' })).toBe('⌘K');
    expect(paletteShortcutLabel({ platform: 'iPhone' })).toBe('⌘K');
    expect(paletteShortcutLabel({ platform: 'iPad' })).toBe('⌘K');
    expect(paletteShortcutLabel({ platform: 'Win32' })).toBe('Ctrl+K');
    expect(paletteShortcutLabel({ platform: 'Linux x86_64' })).toBe('Ctrl+K');
    expect(paletteShortcutLabel({ platform: 'Linux armv8l' })).toBe('Ctrl+K');
  });

  it('then to the user-agent string, for a WebKit that reports an iPad as a Mac', () => {
    expect(
      isApplePlatform({
        platform: '',
        userAgent:
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
      }),
    ).toBe(true);
    expect(
      isApplePlatform({
        platform: '',
        userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
      }),
    ).toBe(false);
  });

  it('no navigator at all (SSR, a bare test) is not Apple', () => {
    expect(paletteShortcutLabel(undefined)).toBe('Ctrl+K');
    expect(paletteShortcutLabel(null)).toBe('Ctrl+K');
    expect(paletteShortcutLabel({})).toBe('Ctrl+K');
  });
});
