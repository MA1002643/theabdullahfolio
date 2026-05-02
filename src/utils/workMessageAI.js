// Optional LLM message refiner. Disabled by default — gated behind
// WORK_STATUS_AI_ENABLED so the deterministic templates remain the
// production path until the user explicitly opts in. Any failure
// (missing key, timeout, malformed response) falls back to the
// deterministic message the caller passes in.

const OPENAI_ENDPOINT = 'https://api.openai.com/v1/chat/completions';
const REQUEST_TIMEOUT_MS = 4000;
const MAX_OUTPUT_CHARS = 220;

const isAIEnabled = () =>
  process.env.WORK_STATUS_AI_ENABLED === 'true' &&
  Boolean(process.env.OPENAI_API_KEY);

export async function refineMessageWithAI({ signal, fallback }) {
  if (!isAIEnabled()) return fallback;

  try {
    const refined = await callOpenAI({ signal, fallback });
    if (!refined) return fallback;
    const trimmed = refined.trim();
    if (!trimmed || trimmed.length > MAX_OUTPUT_CHARS) return fallback;
    return trimmed;
  } catch (err) {
    console.warn('AI message refinement failed, using fallback:', err?.message);
    return fallback;
  }
}

async function callOpenAI({ signal, fallback }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  // Prompt is intentionally narrow: the model rewrites a sentence the
  // user already approved (the deterministic fallback). It cannot make
  // up new facts because it doesn't see the raw GitHub data — only the
  // signal counts.
  const systemPrompt =
    'You rewrite a one-sentence maintenance status for a personal portfolio website. ' +
    'Keep it under 25 words, plain English, no emojis, no markdown, no GitHub jargon. ' +
    'Never invent details. If unsure, return the original sentence verbatim.';

  const userPrompt = JSON.stringify({
    state: signal.state,
    activePrs: signal.activePrs,
    activeIssues: signal.activeIssues,
    recentPushes: signal.recentPushes,
    deterministicMessage: fallback,
  });

  try {
    const response = await fetch(OPENAI_ENDPOINT, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.3,
        max_tokens: 120,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
    });

    if (!response.ok) return null;
    const json = await response.json();
    return json?.choices?.[0]?.message?.content ?? null;
  } finally {
    clearTimeout(timer);
  }
}
