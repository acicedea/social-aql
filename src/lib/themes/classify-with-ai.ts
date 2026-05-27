import 'server-only';
import { getDefaultAiProvider } from '@/ai/registry';
import { THEMES } from './theme-keywords';
import type { ThemeId, ThemeDetectionResult } from './types';

const THEME_IDS = [
  'fed', 'crypto', 'stocks_us', 'gold', 'forex', 'real_estate',
  'economy_eu', 'macro', 'education', 'investing_principles',
  'trading_strategy', 'emerging_markets', 'other',
] as const;

const THEME_ENUM_VALUES = [...THEME_IDS] as string[];

const SINGLE_ITEM_SCHEMA = {
  type: 'object',
  properties: {
    primary_theme: { type: 'string', enum: THEME_ENUM_VALUES },
    // 'none' is the sentinel for "no secondary theme" — null/union types rejected by Gemini
    secondary_theme: { type: 'string', enum: [...THEME_ENUM_VALUES, 'none'] },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
  },
  required: ['primary_theme', 'secondary_theme', 'confidence'],
};

const SINGLE_RESPONSE_SCHEMA = SINGLE_ITEM_SCHEMA;

const BATCH_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    classifications: {
      type: 'array',
      items: SINGLE_ITEM_SCHEMA,
    },
  },
  required: ['classifications'],
};

const SYSTEM_PROMPT = `You are classifying Romanian financial content for a creator's Instagram analytics dashboard.

The creator posts about economics, finance, trading, and investing. Many captions are EDUCATIONAL and use specific topics as EXAMPLES — you must distinguish between the MAIN topic of the caption and the examples used.

For each caption, identify:
1. PRIMARY THEME: the central topic of the caption
2. SECONDARY THEME (optional): a strongly related theme also present
3. CONFIDENCE: "high" (clear central topic), "medium" (somewhat clear), or "low" (ambiguous or off-topic)

CRITICAL RULES:
- "Don't put all eggs in one basket" with crypto/stocks examples → PRIMARY: investing_principles, SECONDARY: maybe crypto or stocks_us
- "Compound interest explained" → PRIMARY: education (NOT a specific market)
- "Why emerging markets are struggling" → PRIMARY: emerging_markets
- A weekly market brief covering multiple topics → PRIMARY: trading_strategy, SECONDARY: the dominant specific topic
- A caption JUST about FED rates → PRIMARY: fed
- A caption JUST about Bitcoin price → PRIMARY: crypto

Available themes (use EXACTLY these IDs):
${THEMES.map((t) => `- ${t.id}: ${t.description}`).join('\n')}

For secondary_theme: if there is no clear secondary theme, return the string 'none' (not null, not empty string).

Return ONLY valid JSON matching the response schema. No commentary, no markdown formatting.`;

interface ClassifyInput {
  caption: string;
  hashtags?: string[];
}

interface ClassifyRaw {
  primary_theme: ThemeId;
  secondary_theme?: ThemeId | null;
  confidence: 'high' | 'medium' | 'low';
  reasoning?: string;
}

function isValidThemeId(v: unknown): v is ThemeId {
  return typeof v === 'string' && (THEME_IDS as readonly string[]).includes(v);
}

function normalizeSecondary(value: string | null | undefined): ThemeId | null {
  if (!value || value === 'none') return null;
  return isValidThemeId(value) ? value : null;
}

function parseClassifyRaw(parsed: unknown): ClassifyRaw {
  if (!parsed || typeof parsed !== 'object') throw new Error('Not an object');
  const obj = parsed as Record<string, unknown>;
  if (!isValidThemeId(obj.primary_theme)) throw new Error(`Invalid primary_theme: ${obj.primary_theme}`);
  return {
    primary_theme: obj.primary_theme,
    secondary_theme: normalizeSecondary(obj.secondary_theme as string | null | undefined),
    confidence: (obj.confidence === 'high' || obj.confidence === 'medium' || obj.confidence === 'low')
      ? obj.confidence
      : 'low',
  };
}

export async function classifyThemeWithAi(input: ClassifyInput): Promise<ThemeDetectionResult> {
  const captionText = input.caption?.trim() ?? '';
  if (!captionText) {
    return { theme: 'other', themeSecondary: null, confidence: 'low', source: 'fallback' };
  }

  const provider = getDefaultAiProvider();

  const hashtagsLine = input.hashtags && input.hashtags.length > 0
    ? `\n\nHashtags: ${input.hashtags.map((h) => `#${h}`).join(' ')}`
    : '';

  const userPrompt = `Caption:\n${captionText}${hashtagsLine}\n\nClassify this caption.`;

  const result = await provider.generate({
    systemPrompt: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
    maxTokens: 256,
    temperature: 0.1,
    jsonMode: true,
    responseSchema: SINGLE_RESPONSE_SCHEMA,
  });

  const c = parseClassifyRaw(result.parsed);
  return {
    theme: c.primary_theme,
    themeSecondary: normalizeSecondary(c.secondary_theme),
    confidence: c.confidence,
    source: 'ai',
  };
}

export async function classifyThemesBatch(inputs: ClassifyInput[]): Promise<ThemeDetectionResult[]> {
  if (inputs.length === 0) return [];
  if (inputs.length === 1) return [await classifyThemeWithAi(inputs[0])];

  const provider = getDefaultAiProvider();

  const numbered = inputs.map((inp, idx) => {
    const hashtagsLine = inp.hashtags && inp.hashtags.length > 0
      ? `Hashtags: ${inp.hashtags.map((h) => `#${h}`).join(' ')}`
      : '';
    return `--- Caption ${idx + 1} ---\n${inp.caption ?? '(empty)'}\n${hashtagsLine}`;
  }).join('\n\n');

  const userPrompt = `Classify each of the following ${inputs.length} captions. Return a JSON object with a "classifications" array (one per caption, in order). Each item: { primary_theme, secondary_theme, confidence }.\n\n${numbered}`;

  const result = await provider.generate({
    systemPrompt: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
    maxTokens: 2048 + inputs.length * 256,
    temperature: 0.1,
    jsonMode: true,
    responseSchema: BATCH_RESPONSE_SCHEMA,
  });

  const parsed = result.parsed as { classifications?: unknown[] };
  if (!Array.isArray(parsed?.classifications) || parsed.classifications.length !== inputs.length) {
    throw new Error(`Expected ${inputs.length} classifications, got ${parsed?.classifications?.length ?? 0}`);
  }

  return parsed.classifications.map((c) => {
    try {
      const item = parseClassifyRaw(c);
      return {
        theme: item.primary_theme,
        themeSecondary: normalizeSecondary(item.secondary_theme),
        confidence: item.confidence,
        source: 'ai' as const,
      };
    } catch {
      return { theme: 'other' as ThemeId, themeSecondary: null, confidence: 'low' as const, source: 'ai' as const };
    }
  });
}
