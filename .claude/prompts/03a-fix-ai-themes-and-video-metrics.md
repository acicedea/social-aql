# AI LICHIDITATE — Prompt 03a-fix: AI Theme Classification + Video Metrics

## Context

Three issues to address from 03a:

### Issue 1: Theme detection is too naive (keyword-only)

Current keyword-based theme detection has ~60% accuracy. Captions that USE financial terms as examples (e.g., "don't put all your eggs in one crypto basket") get mis-classified. Real captions often discuss CONCEPTS (diversification, compound interest, economic principles) that aren't keyword-matchable.

Solution: classify with Gemini 2.5 Flash at sync time, keyword detection as fallback when AI fails.

### Issue 2: Missing video metrics from Meta API

`has_video_views = 0` and `has_watch_time = 0` for all 63 snapshots, despite the user having 14 Reels. The `insights-config.ts` likely doesn't request the right metric names (Meta deprecated `impressions` for `views` in v22+, and Reels need `plays`/`reach`/`total_interactions`/`ig_reels_video_view_total_time`).

Solution: update insights config to request the correct 2026 metric names per media type.

### Issue 3: Need to add new theme categories

Current themes are too narrow. Add: `education`, `investing_principles`, `trading_strategy`, `emerging_markets`. These better describe captions like "compound interest" (education) or "don't put eggs in one basket" (investing_principles).

## SCOPE BOUNDARY

This prompt does FOUR things only:
1. Build minimal AI provider architecture (interface + Gemini implementation)
2. Replace keyword-only theme detection with AI classification + keyword fallback
3. Add new theme categories
4. Fix Meta API insights config to request correct metrics for Reels and standardize on `views`

NO AI analyses (weekly summary, patterns, ideation) yet — those come in Prompt 03b. NO new pages, NO new UI components beyond a backfill button in settings. If completing this requires touching files outside the "Files allowed to change" list, STOP and report.

## Carry-over (LOCKED, must not regress)

- All design system, theme tokens, fonts
- Visual identity (no shadows, flat)
- Auth flow, session persistence
- Disconnect / Sync button flows
- Meta OAuth
- Mock provider behavior
- KPI calculation engine from 03a — keep as-is, this only refines theme detection and adds video metrics
- DB schema except for one tiny addition (theme_secondary nullable column)
- Dashboard, posts page, post detail page — keep as-is, only theme labels improve
- All existing KPI snapshots — don't drop or alter them

## Files allowed to change

For AI provider architecture (minimal):
- New file: `src/ai/types.ts`
- New file: `src/ai/providers/gemini/manifest.ts`
- New file: `src/ai/providers/gemini/index.ts` (server-only)
- New file: `src/ai/registry.ts` (server-only)
- New file: `src/config/ai-providers.config.ts` (server-only)

For theme classification:
- `src/lib/themes/detect-theme.ts` — refactor to use AI primary + keyword fallback
- `src/lib/themes/theme-keywords.ts` — add 4 new themes
- `src/lib/themes/types.ts` — minor type additions
- New file: `src/lib/themes/classify-with-ai.ts`
- New file: `src/lib/themes/backfill-themes.ts`
- `src/lib/sync/sync-account.ts` — make theme detection async-aware

For video metrics:
- `src/providers/meta-instagram/insights-config.ts` — update metric names
- `src/providers/meta-instagram/mappers.ts` — handle new metric names
- `src/providers/meta-instagram/types.ts` — only if new types needed

For backfill UI (minimal):
- `src/app/dashboard/settings/page.tsx` — add "Re-clasifică toate postările cu AI" button section
- `src/app/dashboard/settings/actions.ts` (new or existing) — backfill server action

For DB migration:
- New file: `supabase/migrations/0003_theme_secondary_column.sql`

## DO NOT TOUCH

- Design system components, theme tokens, globals.css
- Auth flow, Supabase clients
- Token encryption
- KPI calculation engine (`src/lib/kpis/`) — keep working as-is
- Dashboard page rendering logic (the page will pick up new themes automatically via existing data flow)
- Posts page table layout
- Post detail page layout
- Provider files except the 3 listed above
- Mock provider files
- All design system components

## Environment variables

Add to `.env.example`:
```
# Google AI Studio API key for Gemini classification and analyses.
# Get at: https://aistudio.google.com/apikey
# Free tier: 1500 requests/day on gemini-2.5-flash. Sufficient for development.
GOOGLE_GENERATIVE_AI_API_KEY=
```

Update `src/lib/env.ts` Zod schema to include this as OPTIONAL (so the app doesn't crash if not set; classification falls back to keywords).

## Deliverable 1: Minimal AI provider architecture

### 1.1 Types

Create `src/ai/types.ts`:

```ts
/**
 * Manifest: serializable description of an AI provider.
 * Safe to import in Client Components.
 */
export interface AiProviderManifest {
  readonly id: string;                 // 'gemini', 'claude', ...
  readonly displayName: string;        // "Gemini 2.5 Flash"
  readonly model: string;              // 'gemini-2.5-flash'
  readonly supportsImages: boolean;
  readonly supportsJsonMode: boolean;  // structured outputs
  readonly maxInputTokens: number;
  readonly description: string;
}

/**
 * Server-only client with implementation functions.
 * NEVER import in Client Components.
 */
export interface AiProviderClient {
  readonly manifest: AiProviderManifest;

  /**
   * Run a text generation request with optional JSON mode.
   * Returns text response or parsed JSON object.
   */
  generate(input: AiGenerateInput): Promise<AiGenerateOutput>;
}

export interface AiGenerateInput {
  readonly systemPrompt?: string;
  readonly userPrompt: string;
  readonly temperature?: number;       // 0..1
  readonly maxOutputTokens?: number;
  readonly responseSchema?: object;    // JSON schema for structured output
  readonly jsonMode?: boolean;         // if true, expects JSON response (parsed)
}

export interface AiGenerateOutput {
  readonly text: string;
  readonly parsed?: unknown;           // populated if jsonMode=true
  readonly usage?: {
    readonly inputTokens: number;
    readonly outputTokens: number;
  };
  readonly model: string;
  readonly provider: string;
}

export class AiProviderError extends Error {
  constructor(
    message: string,
    public readonly code: 'rate_limit' | 'auth' | 'network' | 'invalid_response' | 'unknown',
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'AiProviderError';
  }
}
```

### 1.2 Gemini manifest

Create `src/ai/providers/gemini/manifest.ts`:

```ts
// NO 'server-only' — manifest is safe everywhere
import type { AiProviderManifest } from '@/ai/types';

export const GEMINI_MANIFEST: AiProviderManifest = {
  id: 'gemini',
  displayName: 'Gemini 2.5 Flash',
  model: 'gemini-2.5-flash',
  supportsImages: true,
  supportsJsonMode: true,
  maxInputTokens: 1_000_000,
  description: 'Google Gemini 2.5 Flash via AI Studio. Free tier: 1500 req/day.',
};
```

### 1.3 Gemini implementation

Create `src/ai/providers/gemini/index.ts`:

```ts
import 'server-only';
import type { AiProviderClient, AiGenerateInput, AiGenerateOutput } from '@/ai/types';
import { AiProviderError } from '@/ai/types';
import { GEMINI_MANIFEST } from './manifest';
import { env } from '@/lib/env';

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

async function callGemini(input: AiGenerateInput): Promise<AiGenerateOutput> {
  if (!env.GOOGLE_GENERATIVE_AI_API_KEY) {
    throw new AiProviderError(
      'GOOGLE_GENERATIVE_AI_API_KEY is not configured',
      'auth',
      false,
    );
  }

  const body = {
    contents: [
      {
        parts: [{ text: input.userPrompt }],
        role: 'user',
      },
    ],
    ...(input.systemPrompt && {
      systemInstruction: { parts: [{ text: input.systemPrompt }] },
    }),
    generationConfig: {
      temperature: input.temperature ?? 0.7,
      maxOutputTokens: input.maxOutputTokens ?? 2048,
      ...(input.jsonMode && {
        responseMimeType: 'application/json',
        ...(input.responseSchema && { responseSchema: input.responseSchema }),
      }),
    },
  };

  const url = `${API_BASE}/${GEMINI_MANIFEST.model}:generateContent?key=${env.GOOGLE_GENERATIVE_AI_API_KEY}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new AiProviderError(
      `Network error calling Gemini: ${err instanceof Error ? err.message : String(err)}`,
      'network',
      true,
    );
  }

  if (response.status === 429) {
    throw new AiProviderError('Gemini rate limit exceeded', 'rate_limit', true);
  }
  if (response.status === 401 || response.status === 403) {
    throw new AiProviderError('Gemini auth failed (check API key)', 'auth', false);
  }
  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new AiProviderError(
      `Gemini error ${response.status}: ${errText.slice(0, 200)}`,
      'unknown',
      response.status >= 500,
    );
  }

  const json = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  };

  const text = json.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  if (!text) {
    throw new AiProviderError('Gemini returned empty response', 'invalid_response', true);
  }

  let parsed: unknown;
  if (input.jsonMode) {
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      throw new AiProviderError(
        `Gemini returned invalid JSON: ${text.slice(0, 200)}`,
        'invalid_response',
        false,
      );
    }
  }

  return {
    text,
    parsed,
    usage: {
      inputTokens: json.usageMetadata?.promptTokenCount ?? 0,
      outputTokens: json.usageMetadata?.candidatesTokenCount ?? 0,
    },
    model: GEMINI_MANIFEST.model,
    provider: GEMINI_MANIFEST.id,
  };
}

export const geminiProvider: AiProviderClient = {
  manifest: GEMINI_MANIFEST,
  generate: callGemini,
};
```

### 1.4 Registry

Create `src/config/ai-providers.config.ts`:

```ts
import 'server-only';
import { geminiProvider } from '@/ai/providers/gemini';
import type { AiProviderClient } from '@/ai/types';

const providers: AiProviderClient[] = [geminiProvider];

const byId = new Map(providers.map((p) => [p.manifest.id, p]));

export function getAiProvider(id: string): AiProviderClient | undefined {
  return byId.get(id);
}

export function getDefaultAiProvider(): AiProviderClient {
  return geminiProvider;
}

export function listAiProviders(): AiProviderClient[] {
  return providers;
}
```

Create `src/ai/registry.ts` as a thin re-export:

```ts
import 'server-only';
export { getAiProvider, getDefaultAiProvider, listAiProviders } from '@/config/ai-providers.config';
```

## Deliverable 2: AI theme classification with keyword fallback

### 2.1 New types

Update `src/lib/themes/types.ts` to add:

```ts
export type ThemeId =
  | 'fed'
  | 'crypto'
  | 'stocks_us'
  | 'gold'
  | 'forex'
  | 'real_estate'
  | 'economy_eu'
  | 'macro'
  | 'education'              // NEW: financial concepts, definitions, how-things-work
  | 'investing_principles'   // NEW: diversification, risk management, allocation
  | 'trading_strategy'       // NEW: market psychology, timing, trading patterns
  | 'emerging_markets'       // NEW: dev countries, BRICS, etc.
  | 'other';

export interface ThemeDetectionResult {
  theme: ThemeId;
  themeSecondary: ThemeId | null;   // NEW: optional secondary theme
  confidence: ThemeConfidence;
  matchedKeywords?: string[];        // populated when keyword fallback is used
  source: 'ai' | 'keyword' | 'fallback';  // NEW: which method classified
}
```

### 2.2 Add new theme keywords

In `src/lib/themes/theme-keywords.ts`, add entries for the 4 new themes:

```ts
{
  id: 'education',
  displayName: 'Educație Financiară',
  shortLabel: 'EDUCATION',
  description: 'Concepte de bază, definiții, cum funcționează lucrurile în finanțe',
  keywords: [
    'compound interest', 'dobândă compusă', 'dobanda compusa',
    'inflație ce înseamnă', 'inflatie ce inseamna',
    'pib ce înseamnă', 'pib ce inseamna', 'gdp explained',
    'cum funcționează', 'cum functioneaza',
    'pe înțelesul tuturor', 'pe intelesul tuturor',
    'a opta minune', 'opta minune',
    'einstein', 'feynman', 'buffett a spus', 'warren buffett',
    'definiție', 'definitie', 'concept de bază', 'concept de baza',
    'educație financiară', 'educatie financiara',
    'lecții financiare', 'lectii financiare',
    'principii de bază', 'principii de baza',
  ],
},
{
  id: 'investing_principles',
  displayName: 'Principii Investiționale',
  shortLabel: 'INVESTING',
  description: 'Diversificare, risk management, alocare, dollar cost averaging',
  keywords: [
    'diversificare', 'diversifica',
    'toate ouăle', 'toate ouale', 'eggs in one basket',
    'risc', 'risk management', 'managementul riscului',
    'alocare', 'asset allocation', 'portofoliu',
    'portfolio', 'dca', 'dollar cost averaging',
    'rebalansare', 'rebalancing',
    'hedge', 'hedging', 'protecție', 'protectie',
    'long term', 'pe termen lung',
    'value investing', 'growth investing',
    'index fund', 'index funds', 'etf', 'etfs',
    'lump sum',
  ],
},
{
  id: 'trading_strategy',
  displayName: 'Strategie Trading',
  shortLabel: 'TRADING',
  description: 'Psihologia pieței, timing, trading patterns, technical analysis',
  keywords: [
    'trading', 'trader', 'day trading',
    'swing trade', 'scalping',
    'psihologia pieței', 'psihologia pietei',
    'fomo', 'fud', 'fear and greed',
    'support', 'resistance', 'rezistență', 'rezistenta',
    'breakout', 'breakdown',
    'momentum', 'trend',
    'algoritm', 'algoritmi',
    'curățare piață', 'curatare piata',
    'weekly brief', 'piața săptămânii', 'piata saptamanii',
    'luni și marți', 'luni si marti',
    'technical analysis', 'analiză tehnică', 'analiza tehnica',
  ],
},
{
  id: 'emerging_markets',
  displayName: 'Piețe Emergente',
  shortLabel: 'EMERGING',
  description: 'BRICS, piețe în dezvoltare, Asia, America Latină, MSCI EM',
  keywords: [
    'piețe emergente', 'piete emergente', 'emerging markets',
    'brics', 'china', 'india', 'brazilia', 'rusia',
    'msci em', 'em etf',
    'piețe în dezvoltare', 'piete in dezvoltare',
    'asia', 'asia-pacific',
    'america latină', 'america latina', 'latam',
    'turkey', 'turcia', 'south africa',
  ],
},
```

### 2.3 AI classifier

Create `src/lib/themes/classify-with-ai.ts`:

```ts
import 'server-only';
import { getDefaultAiProvider } from '@/config/ai-providers.config';
import { AiProviderError } from '@/ai/types';
import { THEMES } from './theme-keywords';
import type { ThemeId, ThemeDetectionResult } from './types';

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
- A weekly market brief covering multiple topics → PRIMARY: trading_strategy (because it's about market timing/strategy), SECONDARY: the dominant specific topic
- A caption JUST about FED rates → PRIMARY: fed
- A caption JUST about Bitcoin price → PRIMARY: crypto

Available themes (use EXACTLY these IDs):
${THEMES.map((t) => `- ${t.id}: ${t.description}`).join('\n')}

Return ONLY valid JSON. No commentary.`;

interface ClassifyInput {
  caption: string;
  hashtags?: string[];
}

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    primary_theme: {
      type: 'string',
      enum: [
        'fed', 'crypto', 'stocks_us', 'gold', 'forex', 'real_estate',
        'economy_eu', 'macro', 'education', 'investing_principles',
        'trading_strategy', 'emerging_markets', 'other',
      ],
    },
    secondary_theme: {
      type: ['string', 'null'],
      enum: [
        'fed', 'crypto', 'stocks_us', 'gold', 'forex', 'real_estate',
        'economy_eu', 'macro', 'education', 'investing_principles',
        'trading_strategy', 'emerging_markets', 'other', null,
      ],
    },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    reasoning: { type: 'string', description: '1 sentence in Romanian explaining the choice' },
  },
  required: ['primary_theme', 'confidence'],
};

/**
 * Classify a single caption using Gemini.
 * Throws AiProviderError on failure — caller should fallback to keyword.
 */
export async function classifyThemeWithAi(input: ClassifyInput): Promise<ThemeDetectionResult> {
  const provider = getDefaultAiProvider();

  const captionText = input.caption?.trim() ?? '';
  if (!captionText) {
    return {
      theme: 'other',
      themeSecondary: null,
      confidence: 'low',
      source: 'fallback',
    };
  }

  const hashtagsLine = input.hashtags && input.hashtags.length > 0
    ? `\n\nHashtags: ${input.hashtags.map((h) => `#${h}`).join(' ')}`
    : '';

  const userPrompt = `Caption:\n${captionText}${hashtagsLine}\n\nClassify this caption.`;

  const result = await provider.generate({
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
    temperature: 0.1,             // low for consistency
    maxOutputTokens: 256,
    jsonMode: true,
    responseSchema: RESPONSE_SCHEMA,
  });

  const parsed = result.parsed as {
    primary_theme: ThemeId;
    secondary_theme?: ThemeId | null;
    confidence: 'high' | 'medium' | 'low';
    reasoning?: string;
  };

  return {
    theme: parsed.primary_theme,
    themeSecondary: parsed.secondary_theme ?? null,
    confidence: parsed.confidence,
    source: 'ai',
  };
}

/**
 * Batch classify multiple captions in a single Gemini call.
 * Returns results in the same order as inputs.
 * Falls back to per-caption classification if batch fails.
 */
export async function classifyThemesBatch(
  inputs: ClassifyInput[]
): Promise<ThemeDetectionResult[]> {
  if (inputs.length === 0) return [];
  if (inputs.length === 1) {
    return [await classifyThemeWithAi(inputs[0])];
  }

  const provider = getDefaultAiProvider();

  const numbered = inputs.map((inp, idx) => {
    const hashtagsLine = inp.hashtags && inp.hashtags.length > 0
      ? `Hashtags: ${inp.hashtags.map((h) => `#${h}`).join(' ')}`
      : '';
    return `--- Caption ${idx + 1} ---\n${inp.caption ?? '(empty)'}\n${hashtagsLine}`;
  }).join('\n\n');

  const BATCH_SCHEMA = {
    type: 'object',
    properties: {
      classifications: {
        type: 'array',
        items: RESPONSE_SCHEMA,
      },
    },
    required: ['classifications'],
  };

  const userPrompt = `Classify each of the following ${inputs.length} captions. Return JSON object with "classifications" array (one per caption, in order).\n\n${numbered}`;

  const result = await provider.generate({
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
    temperature: 0.1,
    maxOutputTokens: 1024 + inputs.length * 128,
    jsonMode: true,
    responseSchema: BATCH_SCHEMA,
  });

  const parsed = result.parsed as {
    classifications: Array<{
      primary_theme: ThemeId;
      secondary_theme?: ThemeId | null;
      confidence: 'high' | 'medium' | 'low';
    }>;
  };

  if (!parsed.classifications || parsed.classifications.length !== inputs.length) {
    throw new AiProviderError(
      `Expected ${inputs.length} classifications, got ${parsed.classifications?.length ?? 0}`,
      'invalid_response',
      false,
    );
  }

  return parsed.classifications.map((c) => ({
    theme: c.primary_theme,
    themeSecondary: c.secondary_theme ?? null,
    confidence: c.confidence,
    source: 'ai' as const,
  }));
}
```

### 2.4 Refactor detect-theme.ts to orchestrate

Update `src/lib/themes/detect-theme.ts`:

```ts
// The OLD keyword-only detectTheme stays as a private helper, renamed:
function detectThemeByKeywords(input: { caption: string | null; hashtags: string[] }): ThemeDetectionResult {
  // ... existing keyword logic ...
  return {
    theme: bestThemeId,
    themeSecondary: null,
    confidence,
    matchedKeywords: bestMatches,
    source: 'keyword',
  };
}

/**
 * Public API: classify a caption.
 * Tries AI first, falls back to keyword on failure.
 * If AI returns 'low' confidence AND keyword returns medium/high, uses keyword.
 */
export async function detectTheme(input: {
  caption: string | null;
  hashtags: string[];
}): Promise<ThemeDetectionResult> {
  // No caption? Quick exit.
  if (!input.caption?.trim()) {
    return {
      theme: 'other',
      themeSecondary: null,
      confidence: 'low',
      source: 'fallback',
    };
  }

  try {
    const aiResult = await classifyThemeWithAi({
      caption: input.caption,
      hashtags: input.hashtags,
    });

    // If AI is unsure and keyword has high confidence, use keyword
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

// Export for batch use in backfill
export { classifyThemesBatch } from './classify-with-ai';
export { detectThemeByKeywords };
```

### 2.5 Batch detection helper

Create `src/lib/themes/backfill-themes.ts`:

```ts
import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { classifyThemesBatch } from './classify-with-ai';
import { detectThemeByKeywords } from './detect-theme';
import type { ThemeDetectionResult } from './types';

const BATCH_SIZE = 8;            // captions per Gemini call
const MAX_BATCHES = 20;          // safety: max 160 posts per backfill run

/**
 * Re-classify all posts for the current user using AI.
 * Server-side, idempotent. Returns summary.
 */
export async function backfillThemesForUser(userId: string): Promise<{
  processed: number;
  aiClassified: number;
  keywordClassified: number;
  errors: number;
}> {
  const supabase = await createSupabaseServerClient();

  // Get all posts (RLS enforces ownership via accounts table)
  const { data: posts, error } = await supabase
    .from('posts')
    .select('id, caption, hashtags, account_id')
    .order('published_at', { ascending: false })
    .limit(BATCH_SIZE * MAX_BATCHES);

  if (error || !posts) {
    throw new Error(`Failed to fetch posts: ${error?.message ?? 'unknown'}`);
  }

  let processed = 0;
  let aiClassified = 0;
  let keywordClassified = 0;
  let errors = 0;

  for (let i = 0; i < posts.length; i += BATCH_SIZE) {
    const batch = posts.slice(i, i + BATCH_SIZE);

    let results: ThemeDetectionResult[];
    try {
      results = await classifyThemesBatch(
        batch.map((p) => ({ caption: p.caption ?? '', hashtags: p.hashtags ?? [] }))
      );
      aiClassified += results.length;
    } catch (err) {
      console.warn(`[backfill] Batch ${i} failed, using keyword fallback:`, err);
      results = batch.map((p) =>
        detectThemeByKeywords({ caption: p.caption, hashtags: p.hashtags ?? [] })
      );
      keywordClassified += results.length;
    }

    // Update each post with classified theme
    for (let j = 0; j < batch.length; j++) {
      const post = batch[j];
      const result = results[j];
      const { error: updateErr } = await supabase
        .from('posts')
        .update({
          theme: result.theme,
          theme_secondary: result.themeSecondary,
          theme_confidence: result.confidence,
        })
        .eq('id', post.id);

      if (updateErr) errors++;
      else processed++;
    }
  }

  return { processed, aiClassified, keywordClassified, errors };
}
```

### 2.6 Wire into sync

In `src/lib/sync/sync-account.ts`, replace the synchronous `detectTheme` call with the async version. Since `detectTheme` is now async, wrap it appropriately:

```ts
import { detectTheme } from '@/lib/themes/detect-theme';

// During post upsert (only for NEW posts, not existing ones):
const themeResult = await detectTheme({
  caption: post.caption,
  hashtags: post.hashtags,
});

await supabase.from('posts').upsert({
  // ... existing fields
  theme: themeResult.theme,
  theme_secondary: themeResult.themeSecondary,
  theme_confidence: themeResult.confidence,
});
```

Note: AI classification adds 1-3 seconds per post. For sync of 30 posts, that's 30-90 seconds — but use `classifyThemesBatch` in sync if you have multiple new posts at once. If only 1-2 new posts are typical per sync, per-post is fine.

## Deliverable 3: DB Migration for secondary theme

Create `supabase/migrations/0003_theme_secondary_column.sql`:

```sql
-- Add secondary theme column for richer classification
alter table public.posts
  add column if not exists theme_secondary text;

create index if not exists posts_theme_secondary_idx
  on public.posts(theme_secondary) where theme_secondary is not null;

-- Update the view to include secondary theme
create or replace view public.posts_with_latest_metrics as
select
  p.id,
  p.account_id,
  p.external_post_id,
  p.published_at,
  p.media_type,
  p.caption,
  p.media_url,
  p.thumbnail_url,
  p.permalink,
  p.hashtags,
  p.mentions,
  p.theme,
  p.theme_secondary,
  p.theme_confidence,
  p.followers_at_publish,
  pms.captured_at as metrics_captured_at,
  pms.impressions,
  pms.reach,
  pms.likes,
  pms.comments,
  pms.shares,
  pms.saves,
  pms.video_views,
  pms.watch_time_seconds,
  pms.er_by_reach,
  pms.saves_per_reach,
  pms.sends_per_reach,
  pms.likes_per_reach,
  pms.save_to_like_ratio,
  pms.reach_rate,
  pms.completion_rate,
  pms.avg_watch_time_seconds
from public.posts p
left join lateral (
  select *
  from public.post_metrics_snapshots
  where post_id = p.id
  order by captured_at desc
  limit 1
) pms on true;
```

## Deliverable 4: Video metrics fix

### 4.1 Check current state

Read `src/providers/meta-instagram/insights-config.ts`. Identify which metrics are requested per media type.

### 4.2 Update to 2026 Meta API metric names

Update `src/providers/meta-instagram/insights-config.ts` to use the correct Meta Graph API v22 metric names:

```ts
// 2026 Meta Graph API v22 metric names per media type.
// Reference: https://developers.facebook.com/docs/instagram-platform/api-reference/instagram-media/insights

export const POST_METRICS_BY_TYPE: Record<string, string[]> = {
  IMAGE: [
    'reach',
    'likes',
    'comments',
    'shares',
    'saved',                  // note: Meta uses 'saved' not 'saves' in some endpoints
    'total_interactions',
    'views',                  // replaces 'impressions' in v22
  ],
  CAROUSEL: [
    'reach',
    'likes',
    'comments',
    'shares',
    'saved',
    'total_interactions',
    'views',
  ],
  VIDEO: [
    'reach',
    'likes',
    'comments',
    'shares',
    'saved',
    'total_interactions',
    'views',
    'ig_reels_video_view_total_time',   // total watch time in MS
    'ig_reels_aggregated_all_plays_count', // play count for non-Reel videos
  ],
  REEL: [
    'reach',
    'likes',
    'comments',
    'shares',
    'saved',
    'total_interactions',
    'views',                              // primary metric in v22+
    'ig_reels_video_view_total_time',     // total watch time in MS
    'ig_reels_avg_watch_time',            // avg watch time in MS per view
  ],
  STORY: [
    'reach',
    'replies',
    'shares',
    'total_interactions',
    'views',
    'navigation',
  ],
};

export const ACCOUNT_METRICS = [
  'reach',
  'follower_count',
  'profile_views',
  'website_clicks',
  'accounts_engaged',
];
```

### 4.3 Update mappers

Update `src/providers/meta-instagram/mappers.ts`. The `mapPostMetrics` function must:

1. Read the new metric names from the Graph API response
2. Map them to the normalized fields used by KPI calculation
3. Handle backward compatibility (if Meta still returns `impressions`, prefer `views`)
4. Convert watch time from milliseconds to seconds for normalization

```ts
export function mapPostMetrics(
  postExternalId: string,
  values: Record<string, number | null>,
  typeKey: string,
): NormalizedPostMetrics {
  // Meta sometimes returns 'saved', sometimes 'saves'
  const saves = values['saved'] ?? values['saves'] ?? null;

  // 'impressions' is deprecated in v22, use 'views'
  const impressions = values['views'] ?? values['impressions'] ?? null;

  // Watch time is in milliseconds, convert to seconds
  const watchTimeMs = values['ig_reels_video_view_total_time'] ?? null;
  const watchTimeSeconds = watchTimeMs != null ? Math.round(watchTimeMs / 1000) : null;

  // Video views for Reels = same as `views` in v22 if separate metric not available
  const videoViews = values['ig_reels_aggregated_all_plays_count'] ?? values['views'] ?? null;

  // Engagement rate (computed downstream, but we expose components)
  return {
    postExternalId,
    capturedAt: new Date().toISOString(),
    impressions,
    reach: values['reach'] ?? null,
    likes: values['likes'] ?? null,
    comments: values['comments'] ?? null,
    shares: values['shares'] ?? null,
    saves,
    videoViews,
    watchTimeSeconds,
    engagementRate: null,  // computed in KPI engine
    raw: values,
  };
}
```

### 4.4 Verify capability

After the fix, a re-sync of a Meta account that includes Reels should populate:
- `video_views` (was 0 before)
- `watch_time_seconds` (was 0 before)
- `impressions` (will be populated via `views` metric)

If Meta API returns errors for unknown metrics (the per-media-type endpoint is strict), the existing fallback in `fetchPostMetrics` (try batch, fall back to one-by-one) will handle them gracefully — metrics that fail will be `null` rather than crashing the sync.

## Deliverable 5: Backfill UI in Settings

In `src/app/dashboard/settings/page.tsx`, add a new section after existing content:

**Section title:** "RE-CLASIFICARE TEME"

**Body text (Romanian):**
"Postările existente sunt clasificate cu detecție de cuvinte cheie. Rulează re-clasificarea cu AI (Gemini) pentru rezultate mai precise. Pot dura câteva minute."

**Status display:** show currently classified count vs total
```
Postări AI clasificate: X / Y
Sursă: AI (Gemini) | Cuvinte cheie | Fallback
```

**Button:** primary "→ RE-CLASIFICĂ TOATE CU AI"
- On click: triggers `backfillThemesAction` server action
- During run: button disabled, text becomes "RE-CLASIFICARE ÎN CURS..."
- On success: toast message "Re-clasificate: N postări. AI: X. Cuvinte cheie: Y."
- On error: inline error message

### Server action

In `src/app/dashboard/settings/actions.ts`:

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { backfillThemesForUser } from '@/lib/themes/backfill-themes';

export async function backfillThemesAction(): Promise<{
  success: true;
  stats: { processed: number; aiClassified: number; keywordClassified: number; errors: number };
} | { success: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'unauthenticated' };

  try {
    const stats = await backfillThemesForUser(user.id);
    revalidatePath('/dashboard');
    revalidatePath('/dashboard/posts');
    revalidatePath('/dashboard/settings');
    return { success: true, stats };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error';
    return { success: false, error: msg };
  }
}
```

The UI component for the Settings page must be a Client Component (`'use client'`) for the loading state and toast.

## Verification checklist

1. `pnpm install` is unchanged
2. `pnpm dev` starts without errors
3. `pnpm build` succeeds with zero TypeScript errors
4. `pnpm lint` passes
5. **DB migration applied:** `0003_theme_secondary_column.sql` runs successfully in Supabase. `posts.theme_secondary` column exists. View updated.
6. **AI provider works in isolation:** add temporary test in any server file (or temporarily in a server action), call `classifyThemeWithAi({ caption: 'Bitcoin a depășit 100k!', hashtags: [] })` — should return `theme: 'crypto', confidence: 'high'`. Remove the test after.
7. **Without GOOGLE_GENERATIVE_AI_API_KEY set:** `detectTheme()` should fall back to keyword detection without crashing the app.
8. **With GOOGLE_GENERATIVE_AI_API_KEY set:** `detectTheme()` should use AI primarily.
9. **Backfill button works:** in `/dashboard/settings`, the new button triggers re-classification. After completion, posts table query shows updated themes:
```sql
   SELECT theme, theme_secondary, theme_confidence, COUNT(*)
   FROM posts GROUP BY theme, theme_secondary, theme_confidence;
```
10. **Specific re-classification examples:** after backfill, these specific posts should have improved themes:
    - "Nu pune toate ouăle într-un coș" → `investing_principles` (not `crypto`)
    - "Einstein a numit-o a opta minune" (compound interest) → `education`
    - "De ce suferă piețele emergente" → `emerging_markets`
    - "Nu hrăniți algoritmii — luni și marți" → `trading_strategy`
    - "PIB = Produsul Intern Brut" → `education` or `macro` (both acceptable)
11. **Reel metrics populated:** re-sync a Meta account that has Reels. After sync, query:
```sql
    SELECT
      COUNT(*) FILTER (WHERE video_views > 0) AS has_video_views,
      COUNT(*) FILTER (WHERE watch_time_seconds > 0) AS has_watch_time
    FROM post_metrics_snapshots pms
    JOIN posts p ON p.id = pms.post_id
    WHERE p.media_type IN ('reel', 'video');
```
    Both should be > 0.
12. **Impressions populated:** `SELECT COUNT(impressions) FROM post_metrics_snapshots` should now be > 0 (via the `views` metric mapping).
13. **No regression on dashboard:** `/dashboard` still renders all 4 KPI cards with correct values. New themes appear in the "Teme detectate" bar.
14. **No regression on posts table:** themes display correctly, including new theme categories.
15. **No design regression:** `/design-system` looks identical.
16. **Rate limiting graceful:** if backfill is run twice quickly and hits Gemini rate limit, the keyword fallback kicks in. No crash.
17. **Cost check:** during backfill of ~30 posts, the API uses ~4-6 Gemini batched calls. Verify in console logs that batching is happening.
18. **The `source` field is being tracked:** check `theme_confidence` distribution after backfill — most should be `high` or `medium` (AI is more confident than keyword).

## Notes for Claude Code

- **No client-side imports of Gemini code.** The `'server-only'` import on `src/ai/providers/gemini/index.ts` enforces this. The manifest at `src/ai/providers/gemini/manifest.ts` is safe everywhere (no `'server-only'`).
- **Romanian-aware prompts:** the SYSTEM_PROMPT for classification is in English (Gemini understands English best), but specifically tells the model that captions ARE in Romanian. Keep this.
- **Don't add a UI to switch AI providers.** The architecture supports it but for this prompt, Gemini is the only one.
- **Batch size 8** is chosen to balance latency and Gemini's max output limits. Don't go above 10.
- **Backfill safety:** the function processes up to 160 posts (BATCH_SIZE × MAX_BATCHES). For our scale this is more than enough.
- **The new themes need balanced keyword lists.** Even though AI is primary, the keyword fallback must still work for these.
- **Don't run the AI in tests/CI:** the code path only kicks in when `GOOGLE_GENERATIVE_AI_API_KEY` is set, so build/lint without the key works fine.
- **Don't change KPI calculation logic.** Themes are metadata, not metrics.

## What Andrei will do after this prompt

1. Get a Google AI Studio API key at https://aistudio.google.com/apikey (free)
2. Add `GOOGLE_GENERATIVE_AI_API_KEY=...` to `.env.local`
3. Restart `pnpm dev` (env vars require restart)
4. Apply migration `0003_theme_secondary_column.sql` in Supabase Dashboard
5. Navigate to `/dashboard/settings` → click "RE-CLASIFICĂ TOATE CU AI"
6. Wait for completion (estimated 30-60 seconds for ~30 posts)
7. Visit `/dashboard` → see the "Teme detectate" bar with improved categorization
8. Run these verification SQLs:
```sql
   -- Theme distribution
   SELECT theme, COUNT(*) FROM posts GROUP BY theme ORDER BY COUNT(*) DESC;
   
   -- Confidence distribution
   SELECT theme_confidence, COUNT(*) FROM posts GROUP BY theme_confidence;
   
   -- Secondary themes
   SELECT theme_secondary, COUNT(*) FROM posts WHERE theme_secondary IS NOT NULL GROUP BY theme_secondary;
```
9. Trigger a sync to verify new posts get classified correctly
10. Report:
    - Theme distribution after re-classify (is `other` reduced?)
    - Specific examples that improved (or didn't)
    - Whether video metrics are populated after re-sync
    - Whether the cost feels acceptable (free tier should easily handle this)

After 03a-fix is verified green, we proceed to **Prompt 03b: AI Analyses** — which builds on this AI provider foundation to add weekly summaries, content patterns, and ideation features.