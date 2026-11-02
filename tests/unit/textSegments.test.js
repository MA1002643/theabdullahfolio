import { describe, expect, it } from 'vitest';

import {
  breaksWhenSplit,
  glyphUnits,
  graphemes,
  wordChunks,
} from '@/components/ui/textSegments';

// The shared splitter behind every per-glyph animation on the site — the
// PageTitle ignite, the footer's split-flap cascade and hover roll, the privacy
// notice's fire ramp (issue #82). Two promises are pinned here: English is cut
// EXACTLY as the old `split('')` / `split(' ')` cut it (so the English pages are
// byte-identical), and scripts whose letters join are never cut per letter (an
// Arabic letter in its own inline-block loses its connected form).

describe('glyphUnits', () => {
  it('cuts English exactly as split("") did', () => {
    for (const s of ['ABOUT ME', 'CONTACT ME', '© 2026 Muhammad Abdullah', 'Hover the lines']) {
      expect(glyphUnits(s)).toEqual(s.split(''));
    }
  });

  it('keeps a grapheme cluster whole (combining accent, emoji, flag)', () => {
    expect(glyphUnits('éa')).toEqual(['é', 'a']);
    expect(glyphUnits('🇬🇧!')).toEqual(['🇬🇧', '!']);
    expect(graphemes('👍🏽')).toHaveLength(1);
  });

  it('cuts Arabic-script text by WORD, never by letter', () => {
    const units = glyphUnits('من أنا');
    expect(units).toEqual(['من', ' ', 'أنا']);
    expect(glyphUnits('درباره من')).toEqual(['درباره', ' ', 'من']); // Persian
    expect(glyphUnits('میرے بارے میں')).toEqual(['میرے', ' ', 'بارے', ' ', 'میں']); // Urdu
  });

  it('cuts Devanagari by word, so a conjunct is never split from its virama', () => {
    expect(glyphUnits('मेरे बारे में')).toEqual(['मेरे', ' ', 'बारे', ' ', 'में']);
    expect(glyphUnits('क्षमा')).toEqual(['क्षमा']);
  });

  it('still cuts per letter where letters do not join (Hebrew, Cyrillic, CJK)', () => {
    expect(glyphUnits('אודות')).toHaveLength(5);
    expect(glyphUnits('ОБО МНЕ')).toEqual('ОБО МНЕ'.split(''));
    expect(glyphUnits('关于我')).toEqual(['关', '于', '我']);
  });

  it('always reassembles to the original string', () => {
    for (const s of ['ABOUT ME', 'من أنا', 'मेरे बारे में', '关于我', '', 'a  b']) {
      expect(glyphUnits(s).join('')).toBe(s);
    }
  });
});

describe('breaksWhenSplit', () => {
  it('flags joined scripts only', () => {
    expect(breaksWhenSplit('العربية')).toBe(true);
    expect(breaksWhenSplit('हिन्दी')).toBe(true);
    expect(breaksWhenSplit('About')).toBe(false);
    expect(breaksWhenSplit('עברית')).toBe(false);
    expect(breaksWhenSplit('日本語')).toBe(false);
    expect(breaksWhenSplit(undefined)).toBe(false);
  });
});

describe('wordChunks', () => {
  it('splits spaced text exactly as split(" ") did, with the gap before each word', () => {
    const s = 'Now playing — a calming guitar';
    const chunks = wordChunks(s);
    expect(chunks.map((c) => c.word)).toEqual(s.split(' '));
    expect(chunks.map((c) => c.gap)).toEqual(['', ' ', ' ', ' ', ' ', ' ']);
    expect(chunks.map((c) => c.gap + c.word).join('')).toBe(s);
  });

  it('segments unspaced Japanese into several words so a nowrap run can still wrap', () => {
    const chunks = wordChunks('サウンドをオンにしてください');
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => c.gap === '')).toBe(true);
    expect(chunks.map((c) => c.word).join('')).toBe('サウンドをオンにしてください');
  });
});

describe('wordChunks is the same on every runtime (the /ja hydration fix)', () => {
  // The cut decides which <span>s render, so the server and the browser must
  // agree on it. A dictionary segmenter did not (Chromium's CJK dictionary is
  // smaller than Node's): /ja/about threw React #418. The cut is now a pure
  // function of the characters.
  const ja = '私のウェブ開発の旅は、JavaScript です。「こんにちは」と言った';

  it('cuts CJK by script: one Han or kana per chunk, whole loanwords and Latin words', () => {
    expect(wordChunks(ja).map((c) => c.gap + c.word)).toEqual([
      '私', 'の', 'ウェブ', '開', '発', 'の', '旅', 'は、', 'JavaScript', ' で', 'す。',
      '「こ', 'ん', 'に', 'ち', 'は」', 'と', '言', 'っ', 'た',
    ]);
  });

  it('never starts a chunk with closing punctuation, never ends one with an opening bracket', () => {
    for (const { word } of wordChunks(`${ja}我的网站：现代（Web）开发。`)) {
      expect(word, word).not.toMatch(/^[、。：」）]/u);
      expect(word, word).not.toMatch(/[「（]$/u);
    }
  });

  it('never leaves a Chinese sentence as one unbreakable chunk', () => {
    const zh = '我的网站使用现代开发技术构建';
    expect(wordChunks(zh)).toHaveLength([...zh].length);
  });

  it('does not depend on the word segmenter at all', () => {
    const before = wordChunks(ja);
    const Real = Intl.Segmenter;
    // A segmenter that cuts words differently, as Chromium's did.
    Intl.Segmenter = class extends Real {
      constructor(locale, options) {
        super(locale, options);
        if (options?.granularity === 'word') throw new Error('word segmentation used');
      }
    };
    try {
      expect(wordChunks(ja)).toEqual(before);
    } finally {
      Intl.Segmenter = Real;
    }
  });
});
