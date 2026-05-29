# AI LICHIDITATE — Prompt 04: Comprehensive Dashboard Redesign

## Context

The current dashboard has 4 KPI cards, a top posts widget, a theme distribution bar, and a latest analysis preview. This prompt transforms it into a comprehensive analytics hub with tabbed navigation, a date range picker, per-account selector, and dense but readable reporting across four tabs.

Reference design language: same as the existing app (flat, no shadows, League Spartan headlines, JetBrains Mono for metrics, lime/coral semantic colors). This is a Bloomberg terminal meets Swiss editorial poster — information-dense but visually clear.

## SCOPE BOUNDARY

This prompt changes ONLY the dashboard (`/dashboard`) and its supporting components. No changes to:
- `/dashboard/posts` or `/dashboard/posts/[id]`
- `/dashboard/analyses`
- Auth, sync, providers
- KPI calculation engine
- AI analyses runner
- Any other page

New files are allowed. The existing `src/app/dashboard/page.tsx` is completely replaced.

## Carry-over (LOCKED)

- All design tokens, fonts, no-shadow rule
- All other pages unchanged
- KPI engine values correct (er_by_reach = 9.28 = 9.28%)
- Theme detection
- Existing `posts_with_latest_metrics` view
- Existing `account_metrics_snapshots` table
- Existing `ai_analyses` table

## Stack additions

- `recharts` — already available in the React artifact environment, use for sparklines and bar charts. Import as: `import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'`
- No other new dependencies

## Files allowed to change

- `src/app/dashboard/page.tsx` — completely replaced
- `src/app/dashboard/layout.tsx` — only if needed for date range param passing
- New: `src/components/dashboard/tabs/OverviewTab.tsx`
- New: `src/components/dashboard/tabs/PerformanceTab.tsx`
- New: `src/components/dashboard/tabs/ContentTab.tsx`
- New: `src/components/dashboard/tabs/AiInsightsTab.tsx`
- New: `src/components/dashboard/DashboardShell.tsx`
- New: `src/components/dashboard/DateRangePicker.tsx`
- New: `src/components/dashboard/AccountSelector.tsx`
- New: `src/components/dashboard/MetricDelta.tsx`
- New: `src/components/dashboard/MiniChart.tsx`
- New: `src/components/dashboard/DiagnosticItem.tsx`
- New: `src/lib/dashboard/data.ts` — all dashboard queries centralized here

Existing dashboard components (`KpiCard.tsx`, `KpiSparkline.tsx`, `TopPostsWidget.tsx`) can be reused or extended.

## DO NOT TOUCH

- `src/lib/kpis/` — KPI engine unchanged
- `src/lib/themes/` — theme detection unchanged
- `src/lib/sync/` — sync unchanged
- `src/ai/` — AI analyses unchanged
- `src/providers/` — providers unchanged
- All other dashboard pages
- Design system components

---

## Architecture overview

```
/dashboard
├── URL params: ?account={accountId}&range={7|14|30|90|custom}&from={date}&to={date}
├── Server component: fetches account list, validates params, fetches all tab data
└── Client component: DashboardShell (handles tab switching, date picker interaction)
    ├── Tab: OVERVIEW
    ├── Tab: PERFORMANȚĂ
    ├── Tab: CONȚINUT
    └── Tab: ANALIZE AI
```

The page is mostly server-rendered. Tab switching is client-side (no page reload — tabs show/hide pre-rendered content or use Suspense). Date range changes cause a server re-fetch (URL param change → full server re-render).

---

## Deliverable 1: Dashboard data layer

Create `src/lib/dashboard/data.ts` with all queries needed for all tabs. This keeps the page component clean.

```ts
import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export interface DashboardParams {
  userId: string;
  accountId: string;
  from: string;   // ISO date
  to: string;     // ISO date
  // Previous period (same duration, immediately before)
  prevFrom: string;
  prevTo: string;
}

// ====== OVERVIEW TAB DATA ======

export interface OverviewData {
  account: {
    id: string;
    displayName: string;
    handle: string | null;
    platform: string;
    lastSyncAt: string | null;
    status: string;
  };
  current: PeriodMetrics;
  previous: PeriodMetrics;
  followerHistory: Array<{ date: string; followers: number }>;
  topPostsBySaveRate: PostSummary[];
  topPostsBySendRate: PostSummary[];
  themeBreakdown: ThemeStats[];
  diagnostics: DiagnosticFlag[];   // from the actionable items checklist
}

export interface PeriodMetrics {
  postCount: number;
  avgErByReach: number | null;
  avgSavesPerReach: number | null;
  avgSendsPerReach: number | null;
  avgReach: number | null;
  totalReach: number | null;
  followerStart: number | null;
  followerEnd: number | null;
  sampleSizeWarning: boolean;
}

export interface PostSummary {
  id: string;
  externalPostId: string;
  caption: string | null;
  mediaType: string;
  theme: string | null;
  publishedAt: string;
  erByReach: number | null;
  savesPerReach: number | null;
  sendsPerReach: number | null;
  reach: number | null;
}

export interface ThemeStats {
  theme: string;
  postCount: number;
  avgEr: number | null;
  avgSaves: number | null;
  avgSends: number | null;
}

export interface DiagnosticFlag {
  id: string;
  category: 'hook' | 'caption_seo' | 'hashtags' | 'engagement' | 'strategy' | 'financial_creator';
  severity: 'critical' | 'warning' | 'info';
  title: string;          // short Romanian label
  detail: string;         // specific detail with numbers
  affectedPostIds: string[];
  benchmark: string | null;
}

// ====== PERFORMANCE TAB DATA ======

export interface PerformanceData {
  erTimeline: Array<{ date: string; er: number | null; posts: number }>;
  reachTimeline: Array<{ date: string; reach: number }>;
  followerTimeline: Array<{ date: string; followers: number }>;
  kpiByDayOfWeek: Array<{
    day: string;
    postCount: number;
    avgEr: number | null;
    avgSaves: number | null;
    avgSends: number | null;
  }>;
  kpiByHour: Array<{
    hour: number;
    postCount: number;
    avgEr: number | null;
  }>;
  kpiByMediaType: Array<{
    mediaType: string;
    postCount: number;
    avgEr: number | null;
    avgSaves: number | null;
    avgSends: number | null;
    avgReach: number | null;
  }>;
}

// ====== CONTENT TAB DATA ======

export interface ContentData {
  hookTypeStats: Array<{
    hookType: string;
    postCount: number;
    avgEr: number | null;
    avgSaves: number | null;
    avgSends: number | null;
  }>;
  captionLengthStats: Array<{
    length: 'short' | 'medium' | 'long';
    postCount: number;
    avgEr: number | null;
    avgSaves: number | null;
  }>;
  hashtagCountStats: Array<{
    bucket: '0' | '1-3' | '4-6' | '7-15' | '15+';
    postCount: number;
    avgEr: number | null;
    avgReach: number | null;
  }>;
  themePerformanceMatrix: Array<{
    theme: string;
    postCount: number;
    avgEr: number | null;
    avgSaves: number | null;
    avgSends: number | null;
    avgSaveToLike: number | null;
    bestPost: PostSummary | null;
  }>;
  topPosts: PostSummary[];         // top 10 by ER for the period
  bottomPosts: PostSummary[];      // bottom 5 by ER (only posts with reach > 50)
}

// ====== AI INSIGHTS TAB DATA ======

export interface AiInsightsData {
  latestWeeklySummary: AnalysisSummary | null;
  latestContentPatterns: AnalysisSummary | null;
  latestContentIdeation: AnalysisSummary | null;
  recentAnalyses: AnalysisSummary[];
}

export interface AnalysisSummary {
  id: string;
  analysisType: string;
  status: string;
  createdAt: string;
  headline: string | null;
  recommendations: Array<{ action: string; priority: string }> | null;
  keyFindings: Array<{ title: string; tone: string }> | null;
  durationMs: number | null;
}
```

### Query implementations

Implement the following query functions:

```ts
export async function fetchOverviewData(params: DashboardParams): Promise<OverviewData>
export async function fetchPerformanceData(params: DashboardParams): Promise<PerformanceData>
export async function fetchContentData(params: DashboardParams): Promise<ContentData>
export async function fetchAiInsightsData(params: DashboardParams): Promise<AiInsightsData>
export async function fetchUserAccounts(userId: string): Promise<AccountOption[]>
export function buildDashboardParams(userId: string, accountId: string, range: number): DashboardParams
```

Key implementation notes:
- Use `posts_with_latest_metrics` view for all post queries
- Timelines (ER, reach, followers) are daily aggregates — group by date
- `kpiByDayOfWeek` and `kpiByHour` help with timing optimization
- Hook type, caption length, hashtag count stats require the `hookType`, `captionLength`, `hashtagCount` fields computed in the data builder (from 03b)
- All null/zero KPI values excluded from averages using `safeAvg` logic
- DiagnosticFlags computed in TypeScript (NOT a DB query) from the fetched post data

### Diagnostic flags computation

Add `computeDiagnosticFlags` function that takes an array of posts and period metrics and returns `DiagnosticFlag[]`:

```ts
export function computeDiagnosticFlags(
  posts: PostWithMetrics[],
  periodMetrics: PeriodMetrics,
): DiagnosticFlag[] {
  const flags: DiagnosticFlag[] = [];

  // FLAG: Save rate chronically low
  if (periodMetrics.avgSavesPerReach != null && periodMetrics.avgSavesPerReach < 0.5) {
    flags.push({
      id: 'save_rate_low',
      category: 'engagement',
      severity: 'critical',
      title: 'Save Rate sub benchmark',
      detail: `Save rate mediu ${periodMetrics.avgSavesPerReach.toFixed(2)}% (benchmark: >1%). Conținutul e consumat, nu reținut.`,
      affectedPostIds: posts
        .filter(p => (p.savesPerReach ?? 0) < 0.3)
        .map(p => p.id),
      benchmark: '1% = bun, 3%+ = excelent',
    });
  }

  // FLAG: Send/Save imbalance
  if (
    periodMetrics.avgSendsPerReach != null && periodMetrics.avgSendsPerReach > 1 &&
    periodMetrics.avgSavesPerReach != null && periodMetrics.avgSavesPerReach < 0.5
  ) {
    flags.push({
      id: 'send_save_imbalance',
      category: 'engagement',
      severity: 'warning',
      title: 'Dezechilibru Send/Save',
      detail: `Send ${periodMetrics.avgSendsPerReach.toFixed(2)}% (excelent) dar Save ${periodMetrics.avgSavesPerReach.toFixed(2)}% (sub medie). Conținut de "distribuit", nu de "reținut".`,
      affectedPostIds: [],
      benchmark: null,
    });
  }

  // FLAG: Posts without save CTA + low saves
  const noCtaLowSave = posts.filter(
    p => !p.hasSaveCta && (p.savesPerReach ?? 0) < 0.5 && p.mediaType === 'carousel'
  );
  if (noCtaLowSave.length > 0) {
    flags.push({
      id: 'no_save_cta',
      category: 'caption_seo',
      severity: 'warning',
      title: 'Carousel fără CTA de salvare',
      detail: `${noCtaLowSave.length} carousels fără apel la salvare. Postările cu CTA explicit obțin 40-60% mai multe saves.`,
      affectedPostIds: noCtaLowSave.map(p => p.id),
      benchmark: 'CTA: "Salvează pentru mai târziu" sau "Trimite cuiva care..."',
    });
  }

  // FLAG: Missing hashtags
  const noHashtags = posts.filter(p => p.hashtagCount === 0);
  if (noHashtags.length > posts.length * 0.3) {
    flags.push({
      id: 'no_hashtags',
      category: 'hashtags',
      severity: 'warning',
      title: 'Postări fără hashtag-uri',
      detail: `${noHashtags.length} din ${posts.length} postări fără hashtag-uri. Algoritmul folosește hashtag-urile ca etichete de categorizare.`,
      affectedPostIds: noHashtags.map(p => p.id),
      benchmark: '3-5 hashtag-uri relevante per postare',
    });
  }

  // FLAG: Too many "other" theme posts
  const otherTheme = posts.filter(p => p.theme === 'other' || p.theme == null);
  if (otherTheme.length > posts.length * 0.35) {
    flags.push({
      id: 'theme_clarity',
      category: 'strategy',
      severity: 'warning',
      title: 'Claritate tematică scăzută',
      detail: `${otherTheme.length} din ${posts.length} postări (${Math.round(otherTheme.length / posts.length * 100)}%) neclasificate. Algoritmul nu construiește "niche authority".`,
      affectedPostIds: otherTheme.map(p => p.id),
      benchmark: 'Sub 20% "other" pentru autoritate tematică',
    });
  }

  // FLAG: Keyword absent from first 125 chars
  const noKeywordInPreview = posts.filter(p => {
    if (!p.theme || p.theme === 'other' || !p.caption) return false;
    const preview = p.caption.slice(0, 125).toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    // Check if any keyword for the theme appears in preview
    // Import THEMES from theme-keywords if needed
    return !themeHasKeywordInPreview(p.theme, preview);
  });
  if (noKeywordInPreview.length > 0) {
    flags.push({
      id: 'keyword_in_preview',
      category: 'caption_seo',
      severity: 'info',
      title: 'Keyword absent din preview caption',
      detail: `${noKeywordInPreview.length} postări nu menționează tema principală în primele 125 caractere (zona vizibilă fără "Mai mult").`,
      affectedPostIds: noKeywordInPreview.map(p => p.id),
      benchmark: 'Keyword principal în primul paragraf',
    });
  }

  // FLAG: Sub-optimal hook type
  // Compare hook type performance; flag if recent posts use lower-performing type
  const hookTypePerf = computeHookTypePerformance(posts);
  const bestHookType = hookTypePerf[0];
  const recentPosts = [...posts]
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
    .slice(0, 3);
  const recentHookTypes = recentPosts.map(p => p.hookType);
  if (
    bestHookType &&
    recentHookTypes.every(h => h !== bestHookType.hookType) &&
    bestHookType.avgEr != null && bestHookType.count >= 3
  ) {
    flags.push({
      id: 'suboptimal_hook_type',
      category: 'hook',
      severity: 'warning',
      title: 'Tip hook sub-optimal recent',
      detail: `Ultimele ${recentPosts.length} postări nu folosesc hook tip "${bestHookType.hookType}" (ER mediu ${bestHookType.avgEr.toFixed(2)}% — cel mai bun al tău). Ultimele hook-uri: ${[...new Set(recentHookTypes)].join(', ')}.`,
      affectedPostIds: recentPosts.map(p => p.id),
      benchmark: `Hook tip "${bestHookType.hookType}": ER ${bestHookType.avgEr.toFixed(2)}%`,
    });
  }

  // FLAG: Low education save-to-like ratio
  const eduPosts = posts.filter(
    p => (p.theme === 'education' || p.theme === 'investing_principles') &&
         p.saveToLikeRatio != null
  );
  const avgEduStl = safeAvg(eduPosts.map(p => p.saveToLikeRatio));
  if (avgEduStl != null && avgEduStl < 0.1 && eduPosts.length >= 2) {
    flags.push({
      id: 'edu_save_to_like_low',
      category: 'financial_creator',
      severity: 'warning',
      title: 'Conținut educațional perceput ca entertainment',
      detail: `Save-to-like ratio mediu ${avgEduStl.toFixed(3)} pe postările educaționale (benchmark: >0.2). Oamenii apreciază ("like") dar nu salvează pentru referință.`,
      affectedPostIds: eduPosts.filter(p => (p.saveToLikeRatio ?? 1) < 0.1).map(p => p.id),
      benchmark: '>0.2 pentru conținut educațional financiar',
    });
  }

  return flags.sort((a, b) => {
    const order = { critical: 0, warning: 1, info: 2 };
    return order[a.severity] - order[b.severity];
  });
}
```

---

## Deliverable 2: Dashboard shell and controls

### 2.1 AccountSelector component

Create `src/components/dashboard/AccountSelector.tsx` (client):

- Dropdown (AD Select) showing connected accounts by name + platform badge
- On change: updates URL param `?account={id}` → triggers server re-render
- Shows platform icon placeholder (lime square for Meta, muted for Mock)
- Only shows accounts with status = 'active'

### 2.2 DateRangePicker component

Create `src/components/dashboard/DateRangePicker.tsx` (client):

- Row of quick-select buttons: `7D` `14D` `30D` `90D` `CUSTOM`
- Style: mono uppercase, small, lime when active, muted when not — matches design system
- `CUSTOM` opens an AD DatePicker.RangePicker styled flat (no shadows)
- On change: updates URL params `?range=30` or `?from=2026-04-01&to=2026-05-01`
- No shadows on the datepicker dropdown — override with CSS

### 2.3 MetricDelta component

Create `src/components/dashboard/MetricDelta.tsx`:

```tsx
// Shows delta between current and previous period
// Examples: "+24.8%" in lime, "-8.6%" in coral, "—" in muted
interface MetricDeltaProps {
  current: number | null;
  previous: number | null;
  format?: 'percent' | 'number' | 'count';
  invertColors?: boolean;  // for metrics where lower is better
}
```

### 2.4 MiniChart component

Create `src/components/dashboard/MiniChart.tsx` (client):

Thin wrapper around recharts `LineChart`. Used for sparklines inside KPI cards and timeline sections.

```tsx
interface MiniChartProps {
  data: Array<{ date: string; value: number | null }>;
  color?: string;   // defaults to var(--color-accent-lime)
  height?: number;  // defaults to 40
  showDots?: boolean;
  showTooltip?: boolean;
}
```

Uses recharts `LineChart` with `ResponsiveContainer`. No axes shown in sparkline mode (height=40). Shows axes in chart mode (height=120+).

### 2.5 DiagnosticItem component

Create `src/components/dashboard/DiagnosticItem.tsx`:

```tsx
// Renders a single diagnostic flag
// Critical: coral left-border + coral eye-catching label
// Warning: orange-ish or coral dim left-border
// Info: muted left-border
interface DiagnosticItemProps {
  flag: DiagnosticFlag;
  onPostClick?: (postId: string) => void;
}
```

Layout: severity indicator (colored left bar, same pattern as DataRow) + category badge (mono, uppercase, small) + title (bold) + detail (body, secondary color) + affected posts count (link: "→ 3 postări afectate" that links to posts page filtered by those IDs).

### 2.6 DashboardShell component

Create `src/components/dashboard/DashboardShell.tsx` (client):

Handles tab switching with AD Tabs component. Receives all pre-fetched tab data as props. No data fetching in this component.

```tsx
'use client';
interface DashboardShellProps {
  account: AccountOption;
  allAccounts: AccountOption[];
  dateRange: { from: string; to: string; label: string };
  overviewData: OverviewData;
  performanceData: PerformanceData;
  contentData: ContentData;
  aiInsightsData: AiInsightsData;
}
```

Tabs use AD `Tabs` component with `tabBarStyle` overriding the default to match design system (no shadows, flat underline, lime active color, mono uppercase labels).

---

## Deliverable 3: Four tab implementations

### TAB 1: OVERVIEW

Create `src/components/dashboard/tabs/OverviewTab.tsx`.

**Section 1: KPI Summary Row (4 cards)**

Same as current but enriched. 2×2 grid:

Card 1 — ENGAGEMENT RATE
- Big number: current period avgErByReach
- Delta vs previous period (MetricDelta)
- MiniChart sparkline (daily ER last 30d)
- Benchmark bar: shows where current value falls (low/average/good/excellent)
- Tier label: "EXCELENT" in lime or "SUB MEDIE" in coral

Card 2 — SAVE RATE
- Same structure
- Extra: "Save-to-Like ratio: X.XX" as a small sub-metric in mono

Card 3 — SEND RATE
- Same structure
- Extra: "Send/Save ratio: X.XX" — contextualizes the imbalance

Card 4 — URMĂRITORI
- Current follower count (big mono number)
- Gained this period: "+X" in lime
- MiniChart of follower growth curve
- NOT a percentage — this is a count

**Section 2: Diagnostic Flags**

This is the "at a glance health check" — shows all critical and warning flags from `computeDiagnosticFlags`.

Header: eyebrow "DIAGNOSTIC · PERIOADĂ SELECTATĂ" + count badge (e.g., "3 probleme detectate")

If zero flags: a single "TOTUL ÎN REGULĂ" row in lime. Rare but satisfying.

List of DiagnosticItem components, sorted critical → warning → info.

Important: This section gives immediate actionability without even clicking into analysis. It's the "lighthouse audit" for Instagram.

**Section 3: Top Performers (2 columns)**

Left: Top 5 by Save Rate — showing post preview + save% in lime
Right: Top 5 by Send Rate — showing post preview + send% in lime

Each post row: media type tag + caption truncated + theme tag + metric value. Click → `/dashboard/posts/[id]`.

**Section 4: Theme Performance Overview**

A horizontal bar chart (recharts `BarChart`) showing ER by theme. Each bar colored by value (lime if > account average, coral if below). X-axis: theme names. Y-axis: ER%.

Below the chart: a compact table showing all themes with post count, avg ER, avg Save Rate, avg Send Rate.

### TAB 2: PERFORMANȚĂ

Create `src/components/dashboard/tabs/PerformanceTab.tsx`.

**Section 1: Timeline Charts (3 charts stacked)**

Chart 1 — ER over time (MiniChart, height=120, with axes)
- Daily ER average line
- Reference line at account's 30-day average (dashed, muted)
- Shows dots for days with posts, empty for days without

Chart 2 — Reach over time (MiniChart, height=100)
- Daily total reach bars (recharts BarChart)
- Overlaid line for moving average

Chart 3 — Follower growth (MiniChart, height=80)
- Cumulative follower count line
- Shows +/- delta per data point in tooltip

**Section 2: Timing Heatmap (Day × Hour)**

A grid showing ER performance by day of week + hour of day. Since we don't have granular hour data on all posts, use what we have from `hourOfDay` field.

Layout: 7 rows (Mon-Sun) × simplified time buckets (Morning 6-12, Afternoon 12-18, Evening 18-22, Night 22-6). Each cell shows: post count + avg ER. Color intensity scaled by ER (brighter lime = better performing).

If a cell has 0 posts: show "—" in muted. Minimum 1 post needed to show data.

**Section 3: Format Performance Comparison**

Three side-by-side stat cards (not KpiCards — smaller, compact):
- REELS: post count, avg ER, avg Reach, avg Saves
- CAROUSEL: same
- IMAGE: same (if any)

Below: a short text interpretation: "Reels aduc X% mai mult reach. Carouselurile au Y% mai multe saves. Mix optimal: 60% Reels, 40% Carousel."

**Section 4: Growth Velocity**

Three numbers in big mono:
- Followeri câștigați în perioadă: "+162"
- Medie per zi: "+5.4/zi"
- Proiecție la 90 zile (dacă trendul continuă): "+486" (with disclaimer "estimare liniară")

### TAB 3: CONȚINUT

Create `src/components/dashboard/tabs/ContentTab.tsx`.

**Section 1: Hook Type Analysis**

The star of this tab. A bar chart (recharts) showing ER by hook type, sorted best → worst.

Below: a data table with columns:
| Tip Hook | Postări | ER Mediu | Save Rate | Send Rate |
|----------|---------|----------|-----------|-----------|

Winner highlighted with lime left-bar. Use the same DataRow pattern from design system.

Interpretation text below: "Hook-urile tip [WINNER] performează cu X% mai bine pe audiența ta. Ultimele [N] postări folosesc [CURRENT_TYPE]."

**Section 2: Caption Length Analysis**

Three columns: SHORT / MEDIUM / LONG

Each shows:
- Post count
- ER mediu
- Save rate
- Verdict: "prea scurt" / "optimal" / "detaliat"

**Section 3: Hashtag Strategy**

Bar chart: post count by hashtag bucket (0, 1-3, 4-6, 7-15, 15+). Line overlay: avg ER per bucket.

The optimal range (highest ER) gets a lime band highlight. Text: "Postările tale cu X-Y hashtag-uri au cel mai bun engagement."

**Section 4: Theme Performance Matrix**

Full matrix table with all themes + all KPIs:

| Temă | Postări | ER Mediu | Save Rate | Send Rate | Save/Like | Top Post |
|------|---------|----------|-----------|-----------|-----------|----------|

Rows sorted by ER descending. Color cells: lime if above account average, coral if below. "Top Post" column: truncated caption linking to post detail.

Below table: compact "verdicts" — a list of 3-5 one-liners:
- "FED = motor de engagement (ER 9.3%)"
- "EDUCATION = conținut de referință (Save/Like 0.31)"
- "OTHER = 45% din postări — claritate tematică necesară"

**Section 5: Content Health Checklist**

The same DiagnosticFlags from Overview but expanded with more detail and grouped by category. Each category is a collapsible section (AD Collapse, flat styled):

- 🔴 HOOK (N probleme)
- 🟡 CAPTION & SEO (N probleme)  
- 🟡 HASHTAG-URI (N probleme)
- 🟡 ENGAGEMENT (N probleme)
- 🔵 STRATEGIE (N probleme)
- 🔵 CREATOR FINANCIAR (N probleme)

### TAB 4: ANALIZE AI

Create `src/components/dashboard/tabs/AiInsightsTab.tsx`.

**Section 1: Latest Analysis Previews (3 cards)**

Three cards side by side (or stacked on mobile):

Card: Weekly Summary
- Last generated: "acum 2 ore" / "acum 3 zile" / "Niciodată"
- Headline from structured_output (if exists)
- Top 2 recommendations (from structured_output.recommendations)
- Button: "→ CITEȘTE COMPLET" linking to /dashboard/analyses/[id]
- OR: "→ GENEREAZĂ" button (RunAnalysisButton) if no recent analysis

Card: Content Patterns
- Same structure

Card: Content Ideation
- Same structure — for ideation show "3 idei disponibile" instead of headline if exists

**Section 2: Analysis History Timeline**

A chronological list of all past analyses:
- Type label + timestamp + headline + status badge
- Click → /dashboard/analyses/[id]
- Shows last 10 analyses

**Section 3: Analysis Performance (meta)**

Small stats about the AI analyses themselves:
- Total analyses generated
- Average generation time
- Most analyzed period
- "Ultima sincronizare: X" — reminder to sync before running new analysis

---

## Deliverable 4: Updated dashboard page

Replace `src/app/dashboard/page.tsx`:

```tsx
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import {
  fetchOverviewData,
  fetchPerformanceData,
  fetchContentData,
  fetchAiInsightsData,
  fetchUserAccounts,
  buildDashboardParams,
} from '@/lib/dashboard/data';
import { DashboardShell } from '@/components/dashboard/DashboardShell';

interface Props {
  searchParams: Promise<{
    account?: string;
    range?: string;
    from?: string;
    to?: string;
    tab?: string;
  }>;
}

export default async function DashboardPage({ searchParams }: Props) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const params = await searchParams;
  const accounts = await fetchUserAccounts(user.id);

  // No accounts connected
  if (accounts.length === 0) {
    return <EmptyStateNoAccounts />;
  }

  // Determine active account
  const activeAccountId = params.account ?? accounts[0].id;
  const activeAccount = accounts.find(a => a.id === activeAccountId) ?? accounts[0];

  // Determine date range
  const rangeDays = parseInt(params.range ?? '30', 10);
  const dashParams = buildDashboardParams(user.id, activeAccount.id, rangeDays);

  // Check if account has posts
  // (simple count check before fetching all data)
  const { count } = await supabase
    .from('posts')
    .select('id', { count: 'exact', head: true })
    .eq('account_id', activeAccount.id);

  if (!count || count === 0) {
    return <EmptyStateNoPosts account={activeAccount} />;
  }

  // Fetch all tab data in parallel
  const [overviewData, performanceData, contentData, aiInsightsData] = await Promise.all([
    fetchOverviewData(dashParams),
    fetchPerformanceData(dashParams),
    fetchContentData(dashParams),
    fetchAiInsightsData(dashParams),
  ]);

  return (
    <DashboardShell
      account={activeAccount}
      allAccounts={accounts}
      dateRange={{
        from: dashParams.from,
        to: dashParams.to,
        label: `Ultimele ${rangeDays} zile`,
      }}
      overviewData={overviewData}
      performanceData={performanceData}
      contentData={contentData}
      aiInsightsData={aiInsightsData}
      defaultTab={params.tab ?? 'overview'}
    />
  );
}
```

---

## Deliverable 5: TopBar date range integration

The existing TopBar shows "LAST 30D" in the top-right corner (from Prompt 02). Replace this static text with the DateRangePicker component, integrated into the TopBar.

In `src/components/layout/TopBar.tsx`, replace the static "LAST 30D" with:

```tsx
{isOnDashboard && <DateRangePicker currentRange={range} />}
```

The TopBar already receives the current page — add a prop or use `usePathname()` to show the picker only on `/dashboard`.

---

## Verification checklist

1. `pnpm install` — only recharts added if not already present
2. `pnpm dev` starts without errors
3. `pnpm build` succeeds, zero TypeScript errors
4. `pnpm lint` passes
5. **Tab switching:** all 4 tabs render without errors. No console warnings.
6. **Date range picker:** changing from 30D to 7D updates all numbers on all tabs. URL reflects `?range=7`.
7. **Account selector:** if multiple accounts, switching updates all data.
8. **Overview — KPI cards:** ER shows correct value (9.28% not 928%). Delta shows correctly in lime/coral.
9. **Overview — Diagnostic flags:** at least one flag detected (save rate < 0.5% should trigger for this account). Each flag has detail text with numbers.
10. **Overview — Top performers:** posts clickable, link to `/dashboard/posts/[id]`.
11. **Overview — Theme chart:** recharts BarChart renders without errors.
12. **Performanță — Timeline:** line chart renders with daily data points. Tooltip shows date + value.
13. **Performanță — Timing grid:** day-of-week × time-bucket grid renders (may have many "—" cells if limited data).
14. **Performanță — Format comparison:** Reels vs Carousel stats show.
15. **Conținut — Hook analysis:** bar chart shows hook types. Table shows ER per type. Winner highlighted in lime.
16. **Conținut — Theme matrix:** full table with all detected themes. Color cells working.
17. **Conținut — Checklist:** collapsible sections, at least some flags visible.
18. **Analize AI — Cards:** if analyses exist, headline and recommendations show. If not, "Generează" button present.
19. **Analize AI — History:** past analyses list renders.
20. **No shadows:** inspect every new component in DevTools. No box-shadow anywhere.
21. **Mobile responsive (basic):** no horizontal overflow on viewport 375px wide.
22. **No regression:** `/dashboard/posts`, `/dashboard/analyses`, `/dashboard/accounts` still work.
23. **Empty states:** with no posts synced (test by disconnecting an account), proper empty state shown.
24. **Parallel data fetching:** `Promise.all` for 4 queries — verify in dev network tab they fire simultaneously.
25. **Romanian copy:** all labels, verdicts, diagnostic messages in Romanian with diacritice corecte.

## Notes for Claude Code

- **recharts in client components only.** All chart components must be `'use client'`. Server components cannot render recharts. Use a thin client wrapper if needed.
- **No `useEffect` for data fetching.** All data is server-fetched and passed as props to client components. Client components only handle interactivity (tab switching, tooltip, date picker).
- **AD Tabs styling:** to match the flat design system, override AD Tabs ink-bar color to lime and tab text to mono uppercase. Use the `tabBarStyle` prop and className overrides.
- **recharts styling:** use `stroke="var(--color-accent-lime)"` for lime lines, `stroke="var(--color-accent-coral)"` for coral. Background transparent. No grid lines that are too prominent — use `strokeDasharray="3 3"` on grid lines with muted color.
- **The DiagnosticFlags computation is pure TypeScript** — no async, no DB calls. It runs on already-fetched data. Keep it fast.
- **`posts_with_latest_metrics` view** should be used for all post queries. Don't JOIN manually.
- **Performance:** 4 parallel queries on page load. Each should return in <500ms for ~30 posts. If any query is slow, add DB indexes. The existing indexes from migrations 0001-0003 should cover the common cases.
- **Empty cells in timing grid:** most cells will be empty (you post 3-4x/week, not every hour of every day). That's fine — show "—". The cells with data are the valuable ones.
- **Follower data from account_metrics_snapshots:** this table has daily snapshots from each sync. Use it for the follower timeline. If gaps exist (days without sync), interpolate or show gaps.
- **Mock account data:** if the user has both Meta and Mock accounts connected, the Mock account will show fake data. That's fine — the AccountSelector lets them switch. Don't try to hide or merge them.

## What Andrei will do after this prompt

1. Apply prompt, `pnpm dev`, verify build clean
2. Navigate to `/dashboard` — should show 4 tabs
3. Click through each tab and verify it renders without errors
4. **Overview tab:** check KPI values are correct (9.28% ER), check at least one diagnostic flag appears
5. **Performanță tab:** verify charts render with data from the last 30 days
6. **Conținut tab:** check hook type analysis — does it show the winner clearly?
7. **Analize AI tab:** check latest analysis cards, verify "Generează" buttons work
8. Change date range to 7D and 90D — verify numbers change
9. Report: screenshot of each tab + any bugs found