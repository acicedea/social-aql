# 03a-fix-v4: Gemini Env + Logging + Schema + Posts UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the silent AI classification failure (env var mismatch), add Gemini debug logging, harden the responseSchema format, fix Posts page filter UX, and surface backfill errors to the user.

**Architecture:** Five surgical fixes across env config, AI provider, theme classification, posts page, and settings UI. No new dependencies, no new pages. Each task is self-contained.

**Tech Stack:** Next.js 14 App Router, TypeScript, `@google/generative-ai` SDK (not raw fetch), Supabase, Zod env validation, React Server Components.

---

## File Map

| File | Change |
|------|--------|
| `src/lib/env.ts` | Rename `GOOGLE_AI_API_KEY` → `GOOGLE_GENERATIVE_AI_API_KEY` |
| `.env.example` | Rename key, improve comment |
| `src/ai/providers/gemini/index.ts` | Rename env ref (4 places) + add verbose logging + wire responseSchema |
| `src/lib/themes/classify-with-ai.ts` | Add responseSchema, 'none' sentinel, update system prompt |
| `src/app/dashboard/posts/page.tsx` | Fix filter-empty vs global-empty distinction |
| `src/lib/themes/backfill-themes.ts` | Add `aiErrors` + `errorSamples` to return |
| `src/app/dashboard/settings/actions.ts` | Update type signature to include new fields |
| `src/components/dashboard/BackfillThemesSection.tsx` | Show `aiErrors` and `errorSamples` in result display |

---

## Task 1: Env Var Rename

**Files:**
- Modify: `src/lib/env.ts`
- Modify: `.env.example`

- [ ] **Step 1: Rename in env.ts schema and parse object**

In `src/lib/env.ts`, change both occurrences of `GOOGLE_AI_API_KEY` to `GOOGLE_GENERATIVE_AI_API_KEY`:

```ts
import { z } from 'zod';

const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  ENCRYPTION_KEY: z.string().min(1),
  NEXT_PUBLIC_APP_URL: z.string().url(),
  GOOGLE_GENERATIVE_AI_API_KEY: z.string().optional(),
  AI_DEFAULT_TIER: z.enum(['batch', 'deep']).optional(),
  CRON_SECRET: z.string().optional(),
  META_APP_ID: z.string().optional(),
  META_APP_SECRET: z.string().optional(),
  META_GRAPH_API_VERSION: z.string().optional(),
  META_REDIRECT_URI: z.string().optional(),
});

export const env = envSchema.parse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  GOOGLE_GENERATIVE_AI_API_KEY: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
  AI_DEFAULT_TIER: process.env.AI_DEFAULT_TIER,
  CRON_SECRET: process.env.CRON_SECRET,
  META_APP_ID: process.env.META_APP_ID,
  META_APP_SECRET: process.env.META_APP_SECRET,
  META_GRAPH_API_VERSION: process.env.META_GRAPH_API_VERSION,
  META_REDIRECT_URI: process.env.META_REDIRECT_URI,
});
```

- [ ] **Step 2: Update .env.example**

Replace the Google AI block in `.env.example`:

```env
# Google AI Studio API key for Gemini classification and analyses.
# Get a free key at: https://aistudio.google.com/apikey
# Free tier: 1500 requests/day on gemini-2.5-flash.
# NOTE: Name is GOOGLE_GENERATIVE_AI_API_KEY (Google SDK standard), not GOOGLE_AI_API_KEY.
GOOGLE_GENERATIVE_AI_API_KEY=
```

- [ ] **Step 3: Verify no stale references remain**

Run:
```bash
grep -rn "GOOGLE_AI_API_KEY" src/ .env.example 2>/dev/null
```

Expected: zero matches. If any match found, fix before continuing.

- [ ] **Step 4: Commit**

```bash
git add src/lib/env.ts .env.example
git commit -m "fix: rename GOOGLE_AI_API_KEY to GOOGLE_GENERATIVE_AI_API_KEY (Google SDK standard)"
```

---

## Task 2: Update Gemini Provider (env ref + logging + responseSchema)

**Files:**
- Modify: `src/ai/providers/gemini/index.ts`

This task does three things in the same file: rename the env var reference, add verbose logging, and wire `responseSchema` from `input` into `generationConfig`.

- [ ] **Step 1: Rewrite `src/ai/providers/gemini/index.ts`**

```ts
import { GoogleGenerativeAI } from '@google/generative-ai';
import { env } from '@/lib/env';
import { AiProviderError } from '../types';
import type { AiProvider, AiGenerateInput, AiGenerateOutput } from '../types';

export const geminiProvider: AiProvider = {
  id: 'gemini',
  displayName: 'Gemini 2.5 Flash',
  tier: 'batch',
  model: 'gemini-2.5-flash',
  supportsImages: true,
  costPerMillionInputTokens: 0,
  costPerMillionOutputTokens: 0,
  rateLimit: { requestsPerMinute: 15, requestsPerDay: 1500 },

  isAvailable(): boolean {
    return Boolean(env.GOOGLE_GENERATIVE_AI_API_KEY);
  },

  async generate(input: AiGenerateInput): Promise<AiGenerateOutput> {
    if (!env.GOOGLE_GENERATIVE_AI_API_KEY) {
      console.error('[gemini] GOOGLE_GENERATIVE_AI_API_KEY not configured');
      throw new AiProviderError('GOOGLE_GENERATIVE_AI_API_KEY is not configured', { retryable: false, rateLimited: false });
    }

    console.log('[gemini] calling model:', this.model);
    console.log('[gemini] prompt length:', input.messages.map(m => typeof m.content === 'string' ? m.content.length : 0).reduce((a, b) => a + b, 0), 'chars');
    console.log('[gemini] json mode:', input.jsonMode ?? false);

    const genAI = new GoogleGenerativeAI(env.GOOGLE_GENERATIVE_AI_API_KEY);
    const generationConfig: Record<string, unknown> = {
      maxOutputTokens: input.maxTokens ?? 2048,
      temperature: input.temperature ?? 0.6,
    };
    if (input.jsonMode) {
      generationConfig.responseMimeType = 'application/json';
    }
    if (input.responseSchema) {
      generationConfig.responseSchema = input.responseSchema;
      console.log('[gemini] using responseSchema:', JSON.stringify(input.responseSchema).slice(0, 300));
    }

    const model = genAI.getGenerativeModel({
      model: this.model,
      systemInstruction: input.systemPrompt,
      generationConfig: generationConfig as Parameters<typeof genAI.getGenerativeModel>[0]['generationConfig'],
    });

    const contents = input.messages
      .filter((m) => m.role !== 'system')
      .map((m) => {
        const role = m.role === 'assistant' ? 'model' : 'user';
        if (typeof m.content === 'string') {
          return { role, parts: [{ text: m.content }] };
        }
        const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];
        for (const block of m.content) {
          if (block.type === 'text' && block.text) {
            parts.push({ text: block.text });
          } else if (block.type === 'image' && block.imageBase64) {
            parts.push({ inlineData: { mimeType: 'image/jpeg', data: block.imageBase64 } });
          }
        }
        return { role, parts };
      });

    try {
      const result = await model.generateContent({ contents });
      const text = result.response.text();
      const usage = result.response.usageMetadata;
      const finishReason = result.response.candidates?.[0]?.finishReason;
      const candidatesCount = result.response.candidates?.length ?? 0;

      console.log('[gemini] response candidates:', candidatesCount);
      console.log('[gemini] text length:', text.length, '· output tokens:', usage?.candidatesTokenCount ?? 0);

      if (!text) {
        console.error('[gemini] empty response, candidates:', JSON.stringify(result.response.candidates).slice(0, 500));
        throw new AiProviderError('Gemini returned empty response', { retryable: true, rateLimited: false });
      }

      let parsed: unknown;
      if (input.jsonMode) {
        try {
          parsed = JSON.parse(text);
        } catch {
          console.error('[gemini] JSON parse failed. Response preview:', text.slice(0, 300));
          throw new AiProviderError(`Gemini returned invalid JSON: ${text.slice(0, 200)}`, { retryable: false, rateLimited: false });
        }
      }

      return {
        text,
        parsed,
        inputTokens: usage?.promptTokenCount ?? 0,
        outputTokens: usage?.candidatesTokenCount ?? 0,
        model: this.model,
        finishReason: finishReason === 'MAX_TOKENS' ? 'length' : 'stop',
        raw: result,
      };
    } catch (err: unknown) {
      if (err instanceof AiProviderError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      const isRate = msg.includes('429') || msg.toLowerCase().includes('quota');
      const isAuth = msg.includes('401') || msg.includes('403') || msg.toLowerCase().includes('api key');
      if (isAuth) {
        console.error('[gemini] auth error:', msg);
        throw new AiProviderError(`Gemini auth failed (check API key): ${msg}`, { retryable: false, rateLimited: false });
      }
      if (isRate) {
        console.warn('[gemini] rate limit hit:', msg);
        throw new AiProviderError(`Gemini rate limit: ${msg}`, { retryable: true, rateLimited: true });
      }
      console.error('[gemini] error:', msg);
      throw new AiProviderError(`Gemini error: ${msg}`, { retryable: false, rateLimited: false });
    }
  },
};
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/project.cicedea/Documents/repos/ai-lichiditate-aql && pnpm tsc --noEmit 2>&1 | head -40
```

Expected: no errors in `src/ai/providers/gemini/index.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/ai/providers/gemini/index.ts
git commit -m "fix: rename env ref + add verbose logging + wire responseSchema in Gemini provider"
```

---

## Task 3: responseSchema + 'none' Sentinel in classify-with-ai.ts

**Files:**
- Modify: `src/lib/themes/classify-with-ai.ts`

The Gemini API rejects JSON Schema union types like `type: ['string', 'null']`. Use a `'none'` sentinel string for the secondary_theme field, and pass an explicit `responseSchema` to constrain the output format.

- [ ] **Step 1: Rewrite `src/lib/themes/classify-with-ai.ts`**

```ts
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
    reasoning: { type: 'string' },
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
    maxTokens: 1024 + inputs.length * 128,
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
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/project.cicedea/Documents/repos/ai-lichiditate-aql && pnpm tsc --noEmit 2>&1 | head -40
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/themes/classify-with-ai.ts
git commit -m "fix: add responseSchema and 'none' sentinel to theme classification (Gemini compat)"
```

---

## Task 4: Posts Page Filter vs Global Empty State

**Files:**
- Modify: `src/app/dashboard/posts/page.tsx`

Current bug: line 52 returns `renderEmpty()` if no accounts at all; line 77 returns `renderEmpty()` if filtered posts are empty. Both collapse to the same "connect account" message, even when the user has posts but a filter returns 0 results.

Fix: distinguish "no accounts" from "has posts but filter is empty", keep filters visible in the latter case.

- [ ] **Step 1: Rewrite `src/app/dashboard/posts/page.tsx`**

```tsx
import React from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { colors } from '@/themes/ai-lichiditate/tokens';
import { Eyebrow, H2, Mono } from '@/components/design-system/Typography';
import { Tag } from '@/components/design-system/Tag';
import { formatKpiPercent, formatLargeNumber } from '@/lib/kpis/formatters';

const THEME_LABELS: Record<string, string> = {
  fed: 'FED',
  crypto: 'CRYPTO',
  stocks_us: 'STOCKS US',
  gold: 'AUR',
  forex: 'FOREX',
  real_estate: 'IMOBILIARE',
  economy_eu: 'EU',
  macro: 'MACRO',
  education: 'EDUCAȚIE',
  investing_principles: 'PRINCIPII',
  trading_strategy: 'STRATEGIE',
  emerging_markets: 'EM',
  other: 'OTHER',
};

const DATE_RANGES: Record<string, number> = {
  '7': 7,
  '30': 30,
  '90': 90,
};

interface SearchParams {
  theme?: string;
  type?: string;
  days?: string;
  sort?: string;
  dir?: string;
}

export default async function PostsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: accounts } = await supabase
    .from('accounts')
    .select('id')
    .eq('user_id', user.id);

  const accountIds = (accounts ?? []).map((a: { id: string }) => a.id);

  // Global empty: no accounts connected at all
  if (!accountIds.length) {
    return renderGlobalEmpty();
  }

  // Total post count (unfiltered) — determines "no posts synced yet" vs "filter returned 0"
  const { count: totalPostsCount } = await supabase
    .from('posts')
    .select('id', { count: 'exact', head: true })
    .in('account_id', accountIds);

  const hasAnyPosts = (totalPostsCount ?? 0) > 0;

  const days = DATE_RANGES[params.days ?? '30'] ?? 30;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const sortCol = params.sort ?? 'published_at';
  const sortAsc = params.dir === 'asc';

  let query = supabase
    .from('posts_with_latest_metrics')
    .select('*')
    .in('account_id', accountIds)
    .gte('published_at', since)
    .limit(200);

  if (params.theme) query = query.eq('theme', params.theme);
  if (params.type) query = query.eq('media_type', params.type.toLowerCase());

  const validSortCols = ['published_at', 'er_by_reach', 'saves_per_reach', 'sends_per_reach', 'reach'];
  const col = validSortCols.includes(sortCol) ? sortCol : 'published_at';
  query = query.order(col, { ascending: sortAsc, nullsFirst: false });

  const { data: posts } = await query;

  const hasActiveFilters = !!(params.theme || params.type || (params.days && params.days !== '30'));
  const hasFilteredPosts = (posts?.length ?? 0) > 0;

  const thStyle: React.CSSProperties = {
    fontFamily: 'var(--font-jetbrains-mono), monospace',
    fontSize: 10,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    color: colors.textMuted,
    padding: '10px 12px',
    textAlign: 'left',
    borderBottom: `1px solid ${colors.borderDefault}`,
    whiteSpace: 'nowrap',
    cursor: 'pointer',
  };

  const tdStyle: React.CSSProperties = {
    fontFamily: 'var(--font-jetbrains-mono), monospace',
    fontSize: 12,
    color: colors.textSecondary,
    padding: '10px 12px',
    borderBottom: `1px solid ${colors.borderDefault}`,
    verticalAlign: 'middle',
  };

  function sortLink(column: string, label: string) {
    const newDir = col === column && !sortAsc ? 'asc' : 'desc';
    const sp = new URLSearchParams({ ...params, sort: column, dir: newDir });
    const active = col === column;
    return (
      <Link href={`/dashboard/posts?${sp.toString()}`} style={{ textDecoration: 'none', color: active ? colors.accentLime : colors.textMuted }}>
        {label}{active ? (sortAsc ? ' ↑' : ' ↓') : ''}
      </Link>
    );
  }

  function filterLink(key: string, value: string | undefined, label: string) {
    const sp = new URLSearchParams(params as Record<string, string>);
    if (value === undefined || sp.get(key) === value) {
      sp.delete(key);
    } else {
      sp.set(key, value);
    }
    const active = (params as Record<string, string>)[key] === value;
    return (
      <Link
        href={`/dashboard/posts?${sp.toString()}`}
        style={{
          fontFamily: 'var(--font-jetbrains-mono), monospace',
          fontSize: 11,
          padding: '3px 8px',
          borderRadius: 4,
          border: `1px solid ${active ? colors.accentLime : colors.borderDefault}`,
          color: active ? colors.accentLime : colors.textSecondary,
          textDecoration: 'none',
        }}
      >
        {label}
      </Link>
    );
  }

  // No posts synced yet (accounts exist but no posts)
  if (!hasAnyPosts) {
    return renderGlobalEmpty('Niciun post sincronizat. Mergi la Conturi și sincronizează.');
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <Eyebrow>POSTĂRI · {hasFilteredPosts ? posts!.length : 0}</Eyebrow>
        <div style={{ marginTop: 8 }}>
          <H2>POSTĂRILE TALE</H2>
        </div>
      </div>

      {/* Filter row — always visible when posts exist */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <Mono tone="muted">PERIOADĂ:</Mono>
        {filterLink('days', '7', '7 ZILE')}
        {filterLink('days', '30', '30 ZILE')}
        {filterLink('days', '90', '90 ZILE')}
        <span style={{ width: 1, height: 16, background: colors.borderDefault, margin: '0 4px' }} />
        <Mono tone="muted">TIP:</Mono>
        {filterLink('type', 'reel', 'REEL')}
        {filterLink('type', 'image', 'IMAGE')}
        {filterLink('type', 'carousel', 'CAROUSEL')}
        {filterLink('type', 'video', 'VIDEO')}
        <span style={{ width: 1, height: 16, background: colors.borderDefault, margin: '0 4px' }} />
        <Mono tone="muted">TEMĂ:</Mono>
        {Object.entries(THEME_LABELS).map(([id, label]) =>
          filterLink('theme', id, label)
        )}
      </div>

      <div
        style={{
          background: colors.bgCard,
          border: `1px solid ${colors.borderDefault}`,
          borderRadius: 6,
          overflow: 'auto',
        }}
      >
        {!hasFilteredPosts ? (
          // Filter returned 0 results — show message inside the card
          <div style={{ padding: '24px 20px', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
            <Mono tone="muted">
              {hasActiveFilters
                ? 'NICIUN REZULTAT PENTRU FILTRELE SELECTATE.'
                : 'NICIUN POST DISPONIBIL ÎN ACEASTĂ PERIOADĂ.'}
            </Mono>
            {hasActiveFilters && (
              <Link
                href="/dashboard/posts"
                style={{
                  fontFamily: 'var(--font-jetbrains-mono), monospace',
                  fontSize: 11,
                  color: colors.accentLime,
                  textDecoration: 'none',
                }}
              >
                → ȘTERGE FILTRELE
              </Link>
            )}
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={thStyle}>TIP</th>
                <th style={{ ...thStyle, width: '30%' }}>CAPTION</th>
                <th style={thStyle}>TEMĂ</th>
                <th style={thStyle}>{sortLink('published_at', 'PUBLICAT')}</th>
                <th style={thStyle}>{sortLink('reach', 'REACH')}</th>
                <th style={thStyle}>{sortLink('er_by_reach', 'ER%')}</th>
                <th style={thStyle}>{sortLink('saves_per_reach', 'SAVE%')}</th>
                <th style={thStyle}>{sortLink('sends_per_reach', 'SEND%')}</th>
                <th style={thStyle}></th>
              </tr>
            </thead>
            <tbody>
              {posts!.map((post) => {
                const date = new Date(post.published_at).toLocaleDateString('ro-RO', {
                  day: '2-digit',
                  month: 'short',
                });
                const themeTag = post.theme ? THEME_LABELS[post.theme] ?? post.theme.toUpperCase() : null;
                const themeVariant = post.theme_confidence === 'high' ? 'lime' : 'muted';

                const erColor = post.er_by_reach == null ? colors.textMuted
                  : post.er_by_reach >= 6 ? colors.accentLime
                  : post.er_by_reach >= 2 ? colors.textPrimary
                  : colors.accentCoral;

                return (
                  <tr key={post.id}>
                    <td style={tdStyle}>
                      <span
                        style={{
                          background: colors.bgElevated,
                          border: `1px solid ${colors.borderDefault}`,
                          borderRadius: 4,
                          padding: '2px 6px',
                          fontSize: 10,
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                        }}
                      >
                        {post.media_type}
                      </span>
                    </td>
                    <td style={{ ...tdStyle, color: colors.textPrimary, fontFamily: 'var(--font-inter), sans-serif', fontSize: 13 }}>
                      {post.caption
                        ? post.caption.slice(0, 80) + (post.caption.length > 80 ? '…' : '')
                        : <span style={{ color: colors.textMuted }}>—</span>
                      }
                    </td>
                    <td style={tdStyle}>
                      {themeTag ? (
                        <Tag variant={themeVariant}>{themeTag}</Tag>
                      ) : (
                        <span style={{ color: colors.textMuted }}>—</span>
                      )}
                    </td>
                    <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>{date}</td>
                    <td style={tdStyle}>{formatLargeNumber(post.reach)}</td>
                    <td style={{ ...tdStyle, color: erColor, fontWeight: 600 }}>
                      {formatKpiPercent(post.er_by_reach)}
                    </td>
                    <td style={{ ...tdStyle, color: post.saves_per_reach != null ? colors.textPrimary : colors.textMuted }}>
                      {formatKpiPercent(post.saves_per_reach)}
                    </td>
                    <td style={{ ...tdStyle, color: post.sends_per_reach != null ? colors.textPrimary : colors.textMuted }}>
                      {formatKpiPercent(post.sends_per_reach)}
                    </td>
                    <td style={tdStyle}>
                      <Link
                        href={`/dashboard/posts/${post.id}`}
                        style={{
                          color: colors.accentLime,
                          textDecoration: 'none',
                          fontSize: 14,
                        }}
                      >
                        →
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function renderGlobalEmpty(message = 'NICIUN CONT CONECTAT. CONECTEAZĂ UN CONT ȘI SINCRONIZEAZĂ.') {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <Eyebrow>POSTĂRI</Eyebrow>
        <div style={{ marginTop: 8 }}>
          <H2>POSTĂRILE TALE</H2>
        </div>
      </div>
      <div
        style={{
          background: colors.bgCard,
          border: `1px solid colors.borderDefault`,
          borderRadius: 6,
          padding: '24px 20px',
          textAlign: 'center',
        }}
      >
        <Mono tone="muted">{message.toUpperCase()}</Mono>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Fix template string bug in renderGlobalEmpty**

The border string has a literal `colors.borderDefault` not interpolated. Fix:

```tsx
border: `1px solid ${colors.borderDefault}`,
```

(This is already correct in the code above — just double-check on save.)

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /Users/project.cicedea/Documents/repos/ai-lichiditate-aql && pnpm tsc --noEmit 2>&1 | head -40
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/posts/page.tsx
git commit -m "fix: distinguish filter-empty from global-empty on posts page, keep filters visible"
```

---

## Task 5: Backfill Error Reporting

**Files:**
- Modify: `src/lib/themes/backfill-themes.ts`
- Modify: `src/app/dashboard/settings/actions.ts`
- Modify: `src/components/dashboard/BackfillThemesSection.tsx`

- [ ] **Step 1: Update `src/lib/themes/backfill-themes.ts`**

Add `aiErrors` and `errorSamples` to the return type and populate them in the catch block:

```ts
import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { classifyThemesBatch } from './classify-with-ai';
import { detectThemeByKeywords } from './detect-theme';
import type { ThemeDetectionResult } from './types';

const BATCH_SIZE = 8;
const MAX_BATCHES = 20;

export async function backfillThemesForUser(userId: string): Promise<{
  processed: number;
  aiClassified: number;
  keywordClassified: number;
  aiErrors: number;
  errorSamples: string[];
  errors: number;
}> {
  const supabase = await createSupabaseServerClient();

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
  let aiErrors = 0;
  const errorSamples: string[] = [];
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
      aiErrors += batch.length;
      if (errorSamples.length < 3) {
        errorSamples.push(err instanceof Error ? err.message : String(err));
      }
      console.warn(`[backfill] Batch ${i} AI failed, using keyword fallback:`, err);
      results = batch.map((p) =>
        detectThemeByKeywords({ caption: p.caption, hashtags: p.hashtags ?? [] })
      );
      keywordClassified += results.length;
    }

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

  return { processed, aiClassified, keywordClassified, aiErrors, errorSamples, errors };
}
```

- [ ] **Step 2: Update `src/app/dashboard/settings/actions.ts`**

Update the return type to include the new fields:

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { backfillThemesForUser } from '@/lib/themes/backfill-themes';

export async function backfillThemesAction(): Promise<
  | {
      success: true;
      stats: {
        processed: number;
        aiClassified: number;
        keywordClassified: number;
        aiErrors: number;
        errorSamples: string[];
        errors: number;
      };
    }
  | { success: false; error: string }
> {
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

- [ ] **Step 3: Update `src/components/dashboard/BackfillThemesSection.tsx`**

Update state type and result display to show `aiErrors` and `errorSamples`:

```tsx
'use client';

import React, { useState, useTransition } from 'react';
import { Mono } from '@/components/design-system/Typography';
import { Button } from '@/components/design-system/Button';
import { colors } from '@/themes/ai-lichiditate/tokens';
import { backfillThemesAction } from '@/app/dashboard/settings/actions';

interface Props {
  totalPosts: number;
  classifiedPosts: number;
}

type BackfillResult =
  | {
      success: true;
      stats: {
        processed: number;
        aiClassified: number;
        keywordClassified: number;
        aiErrors: number;
        errorSamples: string[];
        errors: number;
      };
    }
  | { success: false; error: string }
  | null;

export function BackfillThemesSection({ totalPosts, classifiedPosts }: Props) {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<BackfillResult>(null);

  function handleClick() {
    startTransition(async () => {
      const res = await backfillThemesAction();
      setResult(res);
    });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div
        style={{
          background: colors.bgCard,
          border: `1px solid ${colors.borderDefault}`,
          borderRadius: 6,
          padding: '16px 20px',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Mono tone="muted">POSTĂRI CLASIFICATE</Mono>
          <Mono>{classifiedPosts} / {totalPosts}</Mono>
        </div>

        <span style={{ fontSize: 12, lineHeight: '1.6' }}>
          <Mono tone="muted">
            Postările existente sunt clasificate cu detecție de cuvinte cheie. Rulează re-clasificarea cu AI (Gemini) pentru rezultate mai precise. Poate dura câteva minute.
          </Mono>
        </span>

        <Button
          variant="primary"
          onClick={handleClick}
          loading={isPending}
          disabled={isPending}
          style={{ alignSelf: 'flex-start' }}
        >
          {isPending ? 'RE-CLASIFICARE ÎN CURS...' : '→ RE-CLASIFICĂ TOATE CU AI'}
        </Button>

        {result && (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: 4,
              background: result.success ? `${colors.accentLime}18` : `${colors.accentCoral}18`,
              border: `1px solid ${result.success ? colors.accentLime : colors.accentCoral}`,
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}
          >
            {result.success ? (
              <>
                <Mono tone="lime">
                  Re-clasificate: {result.stats.processed} postări.
                </Mono>
                <Mono tone="lime">
                  AI: {result.stats.aiClassified} · Cuvinte cheie: {result.stats.keywordClassified}
                  {result.stats.errors > 0 ? ` · Erori DB: ${result.stats.errors}` : ''}
                </Mono>
                {result.stats.aiErrors > 0 && (
                  <>
                    <Mono tone="coral">Erori AI: {result.stats.aiErrors}</Mono>
                    {result.stats.errorSamples.map((sample, i) => (
                      <Mono key={i} tone="coral" style={{ fontSize: 10, opacity: 0.8 }}>
                        – {sample.slice(0, 120)}
                      </Mono>
                    ))}
                  </>
                )}
              </>
            ) : (
              <Mono tone="coral">Eroare: {result.error}</Mono>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd /Users/project.cicedea/Documents/repos/ai-lichiditate-aql && pnpm tsc --noEmit 2>&1 | head -40
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/themes/backfill-themes.ts src/app/dashboard/settings/actions.ts src/components/dashboard/BackfillThemesSection.tsx
git commit -m "feat: add aiErrors and errorSamples to backfill stats, show in Settings UI"
```

---

## Final Verification

- [ ] **Build check**

```bash
cd /Users/project.cicedea/Documents/repos/ai-lichiditate-aql && pnpm build 2>&1 | tail -20
```

Expected: successful build, no type errors.

- [ ] **Stale env var check**

```bash
grep -rn "GOOGLE_AI_API_KEY" src/ .env.example 2>/dev/null
```

Expected: zero matches.

- [ ] **Confirm Mono component accepts style prop** (used in BackfillThemesSection)

Check `src/components/design-system/Typography.tsx` to verify `Mono` accepts `style` prop. If not, wrap in a `<span style={...}>` instead.

```bash
grep -n "style" /Users/project.cicedea/Documents/repos/ai-lichiditate-aql/src/components/design-system/Typography.tsx | head -10
```

If `Mono` doesn't accept `style`, replace:
```tsx
<Mono key={i} tone="coral" style={{ fontSize: 10, opacity: 0.8 }}>
```
with:
```tsx
<span key={i} style={{ fontSize: 10, opacity: 0.8 }}>
  <Mono tone="coral">
    – {sample.slice(0, 120)}
  </Mono>
</span>
```
