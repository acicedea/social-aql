# AI LICHIDITATE — Prompt 03b: AI Analyses (Weekly Summary, Content Patterns, Ideation)

## Context

The app has working KPIs, AI theme classification (Gemini), and synced Meta data. This prompt adds the AI ANALYSES layer — the feature that transforms raw KPIs into human-readable insights and recommendations.

Three analysis types:
1. **Weekly Summary** — what happened this week vs last, top performers, 3 concrete recommendations. Runs automatically (Vercel cron, Wednesday 16:00 UTC = 19:00 Romania EEST) AND on-demand.
2. **Content Patterns** — deeper analysis of what makes top content work, run on-demand.
3. **Content Ideation** — concrete post ideas based on what performs, run on-demand.

All analyses:
- Output STRUCTURED JSON (headline + key findings + recommendations + narrative), rendered as rich UI
- Use REASONING + CONCLUSION style (show how conclusions were reached)
- Are in ROMANIAN
- Are saved to `ai_analyses` table (full history kept)
- Use the existing Gemini provider from 03a-fix

## SCOPE BOUNDARY

This prompt does EIGHT things (listed in Deliverables). No features beyond these. No changes to KPI engine, theme detection, sync, or auth. If completing requires touching files outside the allowed list, STOP and report.

## Carry-over (LOCKED, must not regress)

- All design system, fonts, tokens, no-shadow rule
- KPIs, theme classification, sync — all working
- AI provider architecture (Gemini) from 03a-fix
- Auth, session, disconnect, manual sync
- Dashboard KPI cards, posts table, post detail
- Theme keywords and the 12 themes
- The `posts_with_latest_metrics` view

## Stack additions

- No new npm dependencies (reuse Gemini fetch-based provider)
- New env var: `CRON_SECRET` (random string to protect the cron endpoint)

## Files allowed to change

DB:
- New: `supabase/migrations/0004_analyses_enrichment.sql`

Analysis logic:
- New: `src/ai/analyses/types.ts`
- New: `src/ai/analyses/data-builders.ts`
- New: `src/ai/analyses/weekly-summary.ts`
- New: `src/ai/analyses/content-patterns.ts`
- New: `src/ai/analyses/content-ideation.ts`
- New: `src/ai/analyses/runner.ts`
- New: `src/ai/analyses/schemas.ts`

Server actions:
- New: `src/app/dashboard/analyses/actions.ts`

UI:
- `src/app/dashboard/analyses/page.tsx` — replace placeholder with real list
- New: `src/app/dashboard/analyses/[id]/page.tsx`
- New: `src/components/analyses/AnalysisCard.tsx`
- New: `src/components/analyses/AnalysisDetail.tsx`
- New: `src/components/analyses/RunAnalysisButton.tsx`
- New: `src/components/analyses/AnalysisTypeSelector.tsx`
- `src/app/dashboard/page.tsx` — add latest weekly summary widget

Cron:
- New: `vercel.json`
- New: `src/app/api/cron/weekly-summary/route.ts`
- `src/lib/env.ts` — add CRON_SECRET
- `.env.example` — add CRON_SECRET

## DO NOT TOUCH

- KPI calculation (`src/lib/kpis/`)
- Theme detection (`src/lib/themes/`)
- Sync logic
- Gemini provider (`src/ai/providers/`) — reuse as-is
- Auth, Supabase clients
- Design system components
- Posts page, post detail page (already done)

## Deliverable 1: Database migration

Create `supabase/migrations/0004_analyses_enrichment.sql`:

```sql
-- =====================================================================
-- 0004: Enrich ai_analyses for structured output + add run tracking
-- =====================================================================

-- The ai_analyses table exists from 0001. Enrich it.
alter table public.ai_analyses
  add column if not exists status text not null default 'completed'
    check (status in ('pending', 'running', 'completed', 'failed')),
  add column if not exists structured_output jsonb,  -- the JSON-mode result
  add column if not exists error_message text,
  add column if not exists trigger_source text not null default 'manual'
    check (trigger_source in ('manual', 'cron')),
  add column if not exists tokens_used integer,
  add column if not exists duration_ms integer;

-- analysis_type already exists; ensure it allows our 3 types
-- (no constraint change needed if it's a free text column)

create index if not exists ai_analyses_user_type_created_idx
  on public.ai_analyses(user_id, analysis_type, created_at desc);

create index if not exists ai_analyses_account_idx
  on public.ai_analyses(account_id) where account_id is not null;
```

Document in supabase migration README how to apply.

## Deliverable 2: Analysis types and schemas

### 2.1 Types

Create `src/ai/analyses/types.ts`:

```ts
export type AnalysisType = 'weekly_summary' | 'content_patterns' | 'content_ideation';

export interface AnalysisMetadata {
  id: string;
  userId: string;
  accountId: string | null;
  analysisType: AnalysisType;
  status: 'pending' | 'running' | 'completed' | 'failed';
  triggerSource: 'manual' | 'cron';
  createdAt: string;
  rangeFrom: string | null;
  rangeTo: string | null;
  model: string;
  tokensUsed: number | null;
  durationMs: number | null;
  errorMessage: string | null;
}

// ===== Structured output shapes (what Gemini returns, JSON mode) =====

export interface KeyFinding {
  title: string;          // short, e.g. "Saves au crescut cu 40%"
  detail: string;         // 1-2 sentences explaining, with the reasoning
  tone: 'positive' | 'negative' | 'neutral';
  metric?: string;        // optional, e.g. "Save Rate: 0.35% → 0.49%"
}

export interface Recommendation {
  action: string;         // concrete action, e.g. "Fă 2 postări despre FED săptămâna asta"
  rationale: string;      // why, based on data
  priority: 'high' | 'medium' | 'low';
}

export interface PostReference {
  postId: string;         // internal post id (for linking)
  caption: string;        // short preview
  metric: string;         // the standout metric, e.g. "ER 10.33%"
  theme: string | null;
}

// Weekly Summary output
export interface WeeklySummaryOutput {
  headline: string;                    // big one-liner, e.g. "Săptămână solidă: engagement peste medie"
  period_comparison: {
    summary: string;                   // narrative comparing this week vs last
    er_change: string;                 // e.g. "+12%" or "-3%"
    reach_change: string;
    follower_change: string;
  };
  top_performers: PostReference[];     // up to 3
  key_findings: KeyFinding[];          // 3-5
  recommendations: Recommendation[];   // exactly 3
  narrative_markdown: string;          // full prose, Romanian, with reasoning
}

// Content Patterns output
export interface ContentPatternsOutput {
  headline: string;
  patterns: Array<{
    pattern: string;                   // e.g. "Postările cu întrebare în primele 5 cuvinte"
    evidence: string;                  // data backing it
    impact: 'high' | 'medium' | 'low';
  }>;
  theme_performance: Array<{
    theme: string;
    avg_er: string;
    avg_saves: string;
    verdict: string;                   // short Romanian verdict
  }>;
  format_insights: KeyFinding[];       // Reels vs Carousel etc.
  recommendations: Recommendation[];
  narrative_markdown: string;
}

// Content Ideation output
export interface ContentIdeationOutput {
  headline: string;
  ideas: Array<{
    title: string;                     // post idea title
    hook: string;                      // suggested opening line (Romanian)
    format: string;                    // "Reel" | "Carousel" | etc.
    theme: string;                     // which theme
    rationale: string;                 // why this would work, based on data
    structure: string;                 // brief content structure
  }>;                                  // 3-5 ideas
  narrative_markdown: string;
}

export type AnalysisOutput =
  | WeeklySummaryOutput
  | ContentPatternsOutput
  | ContentIdeationOutput;
```

### 2.2 JSON schemas for Gemini

Create `src/ai/analyses/schemas.ts`:

Define Gemini-compatible responseSchema for each analysis type. Remember the lessons from theme classification:
- No union types
- No `null` in enums — use sentinels
- Uppercase or lowercase types consistent with what worked for classification

```ts
// Reuse the same format that worked for theme classification.
// All schemas are 'object' type with explicit properties.

export const WEEKLY_SUMMARY_SCHEMA = {
  type: 'object',
  properties: {
    headline: { type: 'string' },
    period_comparison: {
      type: 'object',
      properties: {
        summary: { type: 'string' },
        er_change: { type: 'string' },
        reach_change: { type: 'string' },
        follower_change: { type: 'string' },
      },
      required: ['summary', 'er_change', 'reach_change', 'follower_change'],
    },
    top_performers: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          post_id: { type: 'string' },
          caption: { type: 'string' },
          metric: { type: 'string' },
          theme: { type: 'string' },
        },
        required: ['post_id', 'caption', 'metric', 'theme'],
      },
    },
    key_findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          detail: { type: 'string' },
          tone: { type: 'string', enum: ['positive', 'negative', 'neutral'] },
          metric: { type: 'string' },
        },
        required: ['title', 'detail', 'tone'],
      },
    },
    recommendations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          action: { type: 'string' },
          rationale: { type: 'string' },
          priority: { type: 'string', enum: ['high', 'medium', 'low'] },
        },
        required: ['action', 'rationale', 'priority'],
      },
    },
    narrative_markdown: { type: 'string' },
  },
  required: ['headline', 'period_comparison', 'top_performers', 'key_findings', 'recommendations', 'narrative_markdown'],
};

// Similarly define CONTENT_PATTERNS_SCHEMA and CONTENT_IDEATION_SCHEMA
// matching the TS types in types.ts.
```

(Implement all three schemas fully, matching the TS interfaces.)

## Deliverable 3: Data builders

Create `src/ai/analyses/data-builders.ts`:

These functions gather and shape data from the DB into a compact form for the AI prompts. Keep the data small (token-efficient) — summarize aggregates, only include caption text for top/bottom performers.

```ts
import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export interface WeeklyDataBundle {
  accountName: string;
  handle: string;
  currentWeek: {
    from: string;
    to: string;
    postCount: number;
    avgErByReach: number | null;
    avgSavesPerReach: number | null;
    avgSendsPerReach: number | null;
    avgReach: number | null;
    totalReach: number | null;
    followerStart: number | null;
    followerEnd: number | null;
  };
  previousWeek: {
    /* same shape */
  };
  topPosts: Array<{
    postId: string;
    caption: string;
    mediaType: string;
    theme: string | null;
    erByReach: number | null;
    savesPerReach: number | null;
    sendsPerReach: number | null;
    reach: number | null;
    publishedAt: string;
  }>;
  themeBreakdown: Array<{
    theme: string;
    postCount: number;
    avgEr: number | null;
  }>;
}

export async function buildWeeklyData(
  userId: string,
  accountId: string
): Promise<WeeklyDataBundle> {
  // Query posts_with_latest_metrics for current week (last 7 days)
  // Query for previous week (8-14 days ago)
  // Aggregate KPIs in JS
  // Fetch top 5 posts by er_by_reach in current week
  // Fetch follower snapshots from account_metrics_snapshots
  // Build theme breakdown
  // Return compact bundle
}

export interface PatternsDataBundle {
  accountName: string;
  handle: string;
  rangeDays: number;
  totalPosts: number;
  posts: Array<{
    postId: string;
    caption: string;       // truncated to ~200 chars
    mediaType: string;
    theme: string | null;
    erByReach: number | null;
    savesPerReach: number | null;
    sendsPerReach: number | null;
    reach: number | null;
    publishedAt: string;
    dayOfWeek: string;     // computed
    hourOfDay: number;     // computed
    captionLength: number;
    hashtagCount: number;
  }>;
  themeStats: Array<{ theme: string; count: number; avgEr: number | null; avgSaves: number | null }>;
  formatStats: Array<{ mediaType: string; count: number; avgEr: number | null }>;
}

export async function buildPatternsData(
  userId: string,
  accountId: string,
  rangeDays = 60
): Promise<PatternsDataBundle> {
  // Fetch all posts in range, compute day-of-week, hour, caption length, hashtag count
  // Aggregate theme and format stats
  // Return bundle (cap at ~50 posts to stay token-efficient)
}

// buildIdeationData can reuse buildPatternsData output + top performers
export async function buildIdeationData(
  userId: string,
  accountId: string
): Promise<PatternsDataBundle> {
  return buildPatternsData(userId, accountId, 90);
}
```

Key principle: keep token usage reasonable. For ~30-50 posts with truncated captions, the input is ~10-20K tokens, well within Gemini's 1M context.

## Deliverable 4: Analysis prompt builders

### 4.1 Weekly Summary

Create `src/ai/analyses/weekly-summary.ts`:

```ts
import 'server-only';
import type { WeeklyDataBundle } from './data-builders';

export const WEEKLY_SUMMARY_SYSTEM_PROMPT = `Ești un analist de social media specializat în conținut financiar, care lucrează pentru un creator român (nișă: economie, trading, investiții, macro).

Sarcina ta: analizează datele săptămânale ale contului și produci un sumar acționabil ÎN LIMBA ROMÂNĂ.

Stil: REASONING + CONCLUSION. Arată cum ai ajuns la fiecare concluzie pe baza datelor concrete. Nu inventa cifre — folosește doar datele furnizate.

Focus principal (în ordine):
1. COMPARAȚIE cu săptămâna precedentă (ce s-a îmbunătățit, ce a scăzut)
2. TOP PERFORMERS (cele mai bune postări și DE CE au funcționat)
3. RECOMANDĂRI CONCRETE (exact 3 acțiuni pentru săptămâna următoare)

Reguli:
- Toate textele în română corectă, cu diacritice
- Fii specific cu cifre: "ER 9.2% vs 7.1% săptămâna trecută" nu "engagement mai bun"
- Recomandările trebuie să fie acționabile, nu generice ("Fă 2 Reels despre FED" nu "Postează mai mult")
- Pentru save rate scăzut, recomandă conținut mai "salvabil" (carouseluri educative, liste)
- Pentru send rate ridicat, recunoaște că audiența distribuie activ
- Ton: profesional dar direct, ca un consultant care vrea binele creatorului
- narrative_markdown: 200-350 cuvinte, prose cu reasoning, NU repeta exact key_findings

Returnează DOAR JSON valid conform schemei. Fără markdown code fences, fără comentarii.`;

export function buildWeeklySummaryPrompt(data: WeeklyDataBundle): string {
  return `Analizează datele săptămânale pentru contul @${data.handle} (${data.accountName}).

=== SĂPTĂMÂNA CURENTĂ (${data.currentWeek.from} → ${data.currentWeek.to}) ===
Postări: ${data.currentWeek.postCount}
ER mediu (by reach): ${fmtPct(data.currentWeek.avgErByReach)}
Save rate mediu: ${fmtPct(data.currentWeek.avgSavesPerReach)}
Send rate mediu: ${fmtPct(data.currentWeek.avgSendsPerReach)}
Reach mediu: ${data.currentWeek.avgReach ?? 'N/A'}
Followeri: ${data.currentWeek.followerStart ?? 'N/A'} → ${data.currentWeek.followerEnd ?? 'N/A'}

=== SĂPTĂMÂNA PRECEDENTĂ ===
Postări: ${data.previousWeek.postCount}
ER mediu: ${fmtPct(data.previousWeek.avgErByReach)}
Save rate mediu: ${fmtPct(data.previousWeek.avgSavesPerReach)}
Send rate mediu: ${fmtPct(data.previousWeek.avgSendsPerReach)}
Reach mediu: ${data.previousWeek.avgReach ?? 'N/A'}

=== TOP POSTĂRI SĂPTĂMÂNA CURENTĂ ===
${data.topPosts.map((p, i) => `${i + 1}. [${p.postId}] "${p.caption}" | ${p.mediaType} | temă: ${p.theme ?? 'other'} | ER ${fmtPct(p.erByReach)} | saves ${fmtPct(p.savesPerReach)} | sends ${fmtPct(p.sendsPerReach)} | reach ${p.reach}`).join('\n')}

=== DISTRIBUȚIE TEME ===
${data.themeBreakdown.map(t => `${t.theme}: ${t.postCount} postări, ER mediu ${fmtPct(t.avgEr)}`).join('\n')}

Produci sumarul săptămânal. Pentru top_performers, folosește post_id-urile exacte de mai sus.`;
}

function fmtPct(v: number | null): string {
  return v == null ? 'N/A' : `${v.toFixed(2)}%`;
}
```

### 4.2 Content Patterns

Create `src/ai/analyses/content-patterns.ts` with similar structure:
- System prompt: "Ești un analist care identifică PATTERN-URI ascunse în conținut..."
- Focus: ce caracteristici comune au postările de top (timing, format, temă, lungime caption, hook style)
- Output matches ContentPatternsOutput

### 4.3 Content Ideation

Create `src/ai/analyses/content-ideation.ts`:
- System prompt: "Ești un strategist de conținut care propune idei NOI de postări bazate pe ce funcționează..."
- Focus: 3-5 idei concrete cu hook-uri în română, structură, rationale bazat pe date
- Output matches ContentIdeationOutput

## Deliverable 5: Analysis runner

Create `src/ai/analyses/runner.ts`:

```ts
import 'server-only';
import { getDefaultAiProvider } from '@/config/ai-providers.config';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { buildWeeklyData, buildPatternsData, buildIdeationData } from './data-builders';
import { WEEKLY_SUMMARY_SYSTEM_PROMPT, buildWeeklySummaryPrompt } from './weekly-summary';
import { WEEKLY_SUMMARY_SCHEMA, CONTENT_PATTERNS_SCHEMA, CONTENT_IDEATION_SCHEMA } from './schemas';
// ... imports for patterns and ideation
import type { AnalysisType } from './types';

interface RunResult {
  analysisId: string;
  status: 'completed' | 'failed';
  error?: string;
}

export async function runAnalysis(params: {
  userId: string;
  accountId: string;
  analysisType: AnalysisType;
  triggerSource: 'manual' | 'cron';
}): Promise<RunResult> {
  const { userId, accountId, analysisType, triggerSource } = params;
  const supabase = await createSupabaseServerClient();
  const provider = getDefaultAiProvider();
  const startTime = Date.now();

  // 1. Insert a 'running' record
  const { data: record, error: insertErr } = await supabase
    .from('ai_analyses')
    .insert({
      user_id: userId,
      account_id: accountId,
      analysis_type: analysisType,
      status: 'running',
      trigger_source: triggerSource,
      model: provider.manifest.model,
      output_markdown: '',  // filled after
    })
    .select('id')
    .single();

  if (insertErr || !record) {
    return { analysisId: '', status: 'failed', error: 'Failed to create analysis record' };
  }

  try {
    // 2. Build data + prompt based on type
    let systemPrompt: string;
    let userPrompt: string;
    let schema: object;
    let rangeFrom: string | null = null;
    let rangeTo: string | null = null;

    if (analysisType === 'weekly_summary') {
      const data = await buildWeeklyData(userId, accountId);
      systemPrompt = WEEKLY_SUMMARY_SYSTEM_PROMPT;
      userPrompt = buildWeeklySummaryPrompt(data);
      schema = WEEKLY_SUMMARY_SCHEMA;
      rangeFrom = data.currentWeek.from;
      rangeTo = data.currentWeek.to;
    } else if (analysisType === 'content_patterns') {
      // ... build patterns
    } else {
      // ... build ideation
    }

    // 3. Call Gemini in JSON mode
    const result = await provider.generate({
      systemPrompt,
      userPrompt,
      temperature: 0.4,
      maxOutputTokens: 4096,
      jsonMode: true,
      responseSchema: schema,
    });

    const structured = result.parsed;
    const narrativeMarkdown = (structured as { narrative_markdown?: string }).narrative_markdown ?? '';

    // 4. Update record with result
    await supabase
      .from('ai_analyses')
      .update({
        status: 'completed',
        structured_output: structured,
        output_markdown: narrativeMarkdown,
        input_range_from: rangeFrom,
        input_range_to: rangeTo,
        tokens_used: (result.usage?.inputTokens ?? 0) + (result.usage?.outputTokens ?? 0),
        duration_ms: Date.now() - startTime,
      })
      .eq('id', record.id);

    return { analysisId: record.id, status: 'completed' };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[analysis runner] failed:', message);
    await supabase
      .from('ai_analyses')
      .update({
        status: 'failed',
        error_message: message,
        duration_ms: Date.now() - startTime,
      })
      .eq('id', record.id);
    return { analysisId: record.id, status: 'failed', error: message };
  }
}
```

## Deliverable 6: Server actions

Create `src/app/dashboard/analyses/actions.ts`:

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { runAnalysis } from '@/ai/analyses/runner';
import type { AnalysisType } from '@/ai/analyses/types';

export async function runAnalysisAction(
  analysisType: AnalysisType,
  accountId: string
): Promise<{ success: true; analysisId: string } | { success: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'unauthenticated' };

  // Verify account ownership
  const { data: account } = await supabase
    .from('accounts')
    .select('id')
    .eq('id', accountId)
    .eq('user_id', user.id)
    .single();
  if (!account) return { success: false, error: 'account_not_found' };

  const result = await runAnalysis({
    userId: user.id,
    accountId,
    analysisType,
    triggerSource: 'manual',
  });

  if (result.status === 'failed') {
    return { success: false, error: result.error ?? 'analysis_failed' };
  }

  revalidatePath('/dashboard/analyses');
  revalidatePath('/dashboard');
  return { success: true, analysisId: result.analysisId };
}
```

## Deliverable 7: UI — Analyses pages

### 7.1 Analyses list page

Replace `src/app/dashboard/analyses/page.tsx` placeholder:

Server component that:
- Fetches user's accounts (if multiple, default to first or show selector)
- Fetches all `ai_analyses` for the user, grouped by type, latest first
- Renders:
  - Eyebrow: `ANALIZE · AI`
  - H1: `ANALIZE.`
  - **Section: Generate new** — 3 cards (one per analysis type) with RunAnalysisButton. Each card explains what the analysis does (Romanian):
    - Weekly Summary: "Sumar săptămânal · ce a funcționat, comparație, 3 recomandări"
    - Content Patterns: "Tipare de conținut · ce caracteristici au postările de top"
    - Content Ideation: "Idei de conținut · sugestii noi bazate pe performanță"
  - **Section: History** — list of past analyses as AnalysisCards, each linking to detail page. Show type, date, headline, status.

### 7.2 AnalysisCard component

Create `src/components/analyses/AnalysisCard.tsx` (client):
- Shows analysis type label, relative date, headline (from structured_output), status badge
- Links to `/dashboard/analyses/[id]`
- If status='failed', show error indicator in coral
- If status='running', show pulsing "ÎN CURS..." (no actual polling needed, just visual)

### 7.3 RunAnalysisButton component

Create `src/components/analyses/RunAnalysisButton.tsx` (client):
- Primary button, e.g. "→ GENEREAZĂ"
- On click: `startTransition(() => runAnalysisAction(type, accountId))`
- While pending: "GENEREZ... (poate dura ~30s)" with disabled state
- On success: router.push to the new analysis detail page, OR revalidate and show in history
- On error: inline coral error message
- IMPORTANT: analyses take 10-40 seconds. The button must show clear progress. Consider using `useTransition` + a visual spinner. Do NOT let the user think it's frozen.

### 7.4 Analysis detail page

Create `src/app/dashboard/analyses/[id]/page.tsx`:

Server component that:
1. Fetches the analysis by id (RLS enforces ownership)
2. If not found → redirect to `/dashboard/analyses?error=not_found`
3. Parses `structured_output` based on `analysis_type`
4. Renders via AnalysisDetail component

### 7.5 AnalysisDetail component

Create `src/components/analyses/AnalysisDetail.tsx` (client or server):

Renders the structured output beautifully, differently per type:

**Weekly Summary:**
- Big headline (H1 style, from output.headline)
- Eyebrow with date range and "generat de Gemini · acum X"
- **Period comparison card**: 3 stat deltas (ER, Reach, Followers) using the Statistic component with tone colors
- **Top performers**: list of PostReference, each linking to `/dashboard/posts/[postId]`, showing the standout metric
- **Key findings**: grid of cards, each with title + detail, tone-colored (positive=lime border, negative=coral border)
- **Recommendations**: numbered list, each with action (bold) + rationale, priority badge
- **Narrative**: the narrative_markdown rendered as prose (use a lightweight markdown renderer or render as styled paragraphs)

**Content Patterns:** render patterns, theme_performance table, format_insights, recommendations.

**Content Ideation:** render ideas as cards (title, hook in quotes, format tag, theme tag, rationale, structure).

All visuals match the design system: no shadows, flat, lime/coral semantic colors, League Spartan headlines, JetBrains Mono for metrics.

For markdown rendering: a minimal renderer is fine (handle headers, bold, lists, paragraphs). Don't pull in a heavy library if avoidable — but if you use one, `react-markdown` is acceptable as it's lightweight. Match typography to design system.

## Deliverable 8: Dashboard widget + Vercel cron

### 8.1 Dashboard latest summary widget

In `src/app/dashboard/page.tsx`, add a section (in State C, after the KPI cards) showing the latest weekly summary if one exists:
- Eyebrow: `ULTIMA ANALIZĂ · SĂPTĂMÂNAL`
- The headline from the latest weekly_summary
- The 3 recommendations as a compact list
- "→ VEZI ANALIZA COMPLETĂ" link to the detail page
- If no weekly summary exists yet: a prompt "Generează prima analiză săptămânală" linking to `/dashboard/analyses`

### 8.2 Environment variable

Add to `src/lib/env.ts`:
```ts
CRON_SECRET: z.string().min(1).optional(),
```

Add to `.env.example`:
```
# Secret to protect the cron endpoint. Generate with:
# node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
CRON_SECRET=
```

### 8.3 Cron endpoint

Create `src/app/api/cron/weekly-summary/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { runAnalysis } from '@/ai/analyses/runner';
import { env } from '@/lib/env';

// This endpoint is called by Vercel Cron. Protected by CRON_SECRET.
export async function GET(request: NextRequest) {
  // Verify the request is from Vercel Cron
  const authHeader = request.headers.get('authorization');
  if (!env.CRON_SECRET || authHeader !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // Use service role client to access all users' accounts (cron has no user session)
  // NOTE: requires SUPABASE_SERVICE_ROLE_KEY
  const supabase = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } }
  );

  // Fetch all active accounts
  const { data: accounts } = await supabase
    .from('accounts')
    .select('id, user_id')
    .eq('status', 'active');

  if (!accounts || accounts.length === 0) {
    return NextResponse.json({ message: 'no accounts to process', processed: 0 });
  }

  const results: Array<{ accountId: string; status: string }> = [];

  // Process sequentially to avoid rate limits and timeout issues
  // NOTE: Vercel Hobby has 60s timeout. For many accounts, this needs a queue.
  // For POC scale (1-5 accounts), sequential is fine.
  for (const account of accounts) {
    try {
      const result = await runAnalysis({
        userId: account.user_id,
        accountId: account.id,
        analysisType: 'weekly_summary',
        triggerSource: 'cron',
      });
      results.push({ accountId: account.id, status: result.status });
    } catch (err) {
      results.push({ accountId: account.id, status: 'error' });
    }
  }

  return NextResponse.json({ processed: results.length, results });
}
```

### 8.4 Vercel cron config

Create `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/cron/weekly-summary",
      "schedule": "0 16 * * 3"
    }
  ]
}
```

Schedule `0 16 * * 3` = Wednesday 16:00 UTC = 19:00 Romania (EEST, summer). In winter (EET, UTC+2) this becomes 18:00 Romania. Acceptable for a weekly summary. Add a code comment documenting this.

NOTE: Vercel automatically sends the `Authorization: Bearer ${CRON_SECRET}` header to cron endpoints if `CRON_SECRET` env var is set in the Vercel project. Document this in the README — Andrei must set `CRON_SECRET` in both `.env.local` AND in the Vercel project environment variables.

### 8.5 Manual cron trigger for testing

Since the user can't wait until Wednesday to test, add a way to manually trigger the cron logic. Either:
- The existing RunAnalysisButton with weekly_summary already covers manual generation, OR
- A dev-only button in settings: "Simulează cron weekly summary"

The manual RunAnalysisButton is sufficient — no separate cron test button needed. The cron endpoint just calls the same `runAnalysis` function.

## Verification checklist

1. `pnpm install` unchanged (or only adds react-markdown if used)
2. `pnpm dev` starts clean
3. `pnpm build` succeeds, zero TS errors
4. `pnpm lint` passes
5. **Migration applied:** `0004_analyses_enrichment.sql` runs. `ai_analyses` has new columns (status, structured_output, trigger_source, etc.)
6. **Weekly summary generates:** on `/dashboard/analyses`, click "Generează" on Weekly Summary. Within ~30s, redirects to detail page (or shows in history). The terminal shows `[gemini]` logs with status 200.
7. **Structured output saved:** query `SELECT analysis_type, status, structured_output->>'headline' FROM ai_analyses ORDER BY created_at DESC LIMIT 3;` — headline is populated, status='completed'.
8. **Detail page renders:** the weekly summary detail page shows headline, period comparison stats, top performers (linking to posts), key findings, 3 recommendations, narrative.
9. **Romanian output:** all generated content is in Romanian with correct diacritics.
10. **Reasoning style:** the narrative explains HOW conclusions were reached (mentions specific numbers).
11. **Top performers link correctly:** clicking a top performer in the analysis navigates to that post's detail page.
12. **Content Patterns works:** generate it, verify it produces patterns + theme performance + recommendations.
13. **Content Ideation works:** generate it, verify it produces 3-5 concrete post ideas with hooks in Romanian.
14. **Dashboard widget:** `/dashboard` shows the latest weekly summary headline + recommendations after one is generated.
15. **History list:** `/dashboard/analyses` shows past analyses, newest first, with correct type labels and dates.
16. **Error handling:** if Gemini fails (e.g., temporarily remove API key), the analysis record gets status='failed' with error_message, and the UI shows the error gracefully (not a crash).
17. **Cron endpoint protected:** `curl http://localhost:3000/api/cron/weekly-summary` without auth returns 401. With `Authorization: Bearer <CRON_SECRET>` it runs.
18. **No design regression** anywhere.
19. **RLS enforced:** accessing another user's analysis by ID returns not-found.
20. **Cost reasonable:** generating all 3 analyses uses ~3-4 Gemini calls total. Check Google AI Studio.

## Notes for Claude Code

- **Reuse the Gemini provider as-is.** Don't modify `src/ai/providers/gemini/`. The runner calls `provider.generate()` with JSON mode.
- **JSON schemas must follow Gemini's constraints** (learned in 03a-fix): no union types, no null in enums, use required arrays. If a schema is rejected, the verbose Gemini logs will show the error.
- **Token efficiency:** data builders should truncate captions and aggregate where possible. Don't dump all raw data.
- **The runner is the single orchestration point.** Server actions and cron both call `runAnalysis()`. Don't duplicate logic.
- **Analyses take 10-40 seconds.** The UI MUST communicate this. Use `useTransition`, show a spinner with text like "Analizez datele... (~30s)". A frozen-looking button is the #1 UX failure here.
- **Markdown rendering:** if using react-markdown, style it to match the design system (League Spartan headers, Inter body, no shadows). Or write a minimal renderer for headers/bold/lists/paragraphs.
- **Romanian diacritics** must render correctly in the generated content. Gemini handles this, but verify the DB stores UTF-8 correctly (it does by default in Postgres).
- **The cron uses SERVICE_ROLE_KEY** to bypass RLS (it has no user session). Make sure that key is available. If not set, the cron endpoint should fail gracefully with a clear error, not crash.
- **For multi-account users:** the analyses page should let the user pick which account to analyze if they have more than one. For single-account (the common case), auto-select it.
- **Don't poll for analysis completion.** Since `runAnalysis` is awaited in the server action, by the time the action returns, it's done. The redirect/revalidate handles showing the result.

## What Andrei will do after this prompt

1. Apply migration `0004_analyses_enrichment.sql` in Supabase
2. Generate a `CRON_SECRET`: `node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"`
3. Add `CRON_SECRET=...` to `.env.local`
4. Restart `pnpm dev`
5. Go to `/dashboard/analyses`, click "Generează" on Weekly Summary
6. Wait ~30s, watch it generate
7. Review the output — is it accurate? In good Romanian? Are the recommendations useful?
8. Generate Content Patterns and Content Ideation too
9. Check the dashboard widget shows the latest summary
10. Report:
    - Quality of the Romanian output
    - Accuracy of the insights (do they match what you know about your content?)
    - Usefulness of recommendations
    - Any Gemini errors in logs
    - Token/cost usage from Google AI Studio
    - UX of the generation flow (was the wait clear?)

NOTE on cron: the Vercel cron only runs in PRODUCTION (deployed to Vercel), not locally. To test the weekly summary logic locally, use the manual "Generează" button which calls the same `runAnalysis` function. The cron will activate once deployed to Vercel with `CRON_SECRET` set in the Vercel project env vars.