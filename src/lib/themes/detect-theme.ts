import { THEMES, FALLBACK_THEME } from './theme-keywords';
import { classifyThemeWithAi } from './classify-with-ai';
import type { ThemeDetectionResult, ThemeId, ThemeConfidence } from './types';

interface DetectInput {
  caption: string | null;
  hashtags: string[];
}

export function detectThemeByKeywords(input: DetectInput): ThemeDetectionResult {
  const haystack = normalizeForMatch(
    [input.caption ?? '', ...(input.hashtags ?? [])].join(' ')
  );

  let bestThemeId: ThemeId = FALLBACK_THEME;
  let bestMatches: string[] = [];
  let bestCount = 0;

  for (const theme of THEMES) {
    const matched: string[] = [];
    for (const keyword of theme.keywords) {
      const normKw = normalizeForMatch(keyword);
      if (normKw.includes(' ')) {
        if (haystack.includes(normKw)) matched.push(keyword);
      } else {
        const re = new RegExp(`(^|[^a-z0-9])${escapeRegex(normKw)}([^a-z0-9]|$)`, 'i');
        if (re.test(haystack)) matched.push(keyword);
      }
    }

    if (matched.length > bestCount) {
      bestCount = matched.length;
      bestMatches = matched;
      bestThemeId = theme.id;
    }
  }

  let confidence: ThemeConfidence;
  if (bestCount >= 3) confidence = 'high';
  else if (bestCount === 2) confidence = 'medium';
  else confidence = 'low';

  return {
    theme: bestThemeId,
    themeSecondary: null,
    confidence,
    matchedKeywords: bestMatches,
    source: 'keyword',
  };
}

export async function detectTheme(input: DetectInput): Promise<ThemeDetectionResult> {
  if (!input.caption?.trim()) {
    return { theme: 'other', themeSecondary: null, confidence: 'low', source: 'fallback' };
  }

  try {
    const aiResult = await classifyThemeWithAi({
      caption: input.caption,
      hashtags: input.hashtags,
    });

    if (aiResult.confidence === 'low') {
      const keywordResult = detectThemeByKeywords(input);
      if (keywordResult.confidence === 'high' || keywordResult.confidence === 'medium') {
        return keywordResult;
      }
    }

    return aiResult;
  } catch (err) {
    console.warn('[detect-theme] AI failed, falling back to keyword:', err);
    return detectThemeByKeywords(input);
  }
}

export { classifyThemesBatch } from './classify-with-ai';

const DIACRITICS_RE = new RegExp('[̀-ͯ]', 'g');

function normalizeForMatch(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(DIACRITICS_RE, '');
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
