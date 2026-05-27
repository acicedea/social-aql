# AI LICHIDITATE — Prompt 03a: KPI Foundation

## Context

The app currently has connected Meta Instagram accounts with synced posts and metric snapshots. The next step is transforming raw metrics into **actionable KPIs** that match 2026 industry best practices (engagement rate by reach, saves per reach, sends per reach, completion rate, theme detection).

This is the FIRST of TWO prompts (03a and 03b):
- **03a (this prompt):** KPI calculation, theme detection, enhanced UI for posts/dashboard. NO AI yet.
- **03b (next prompt):** AI provider architecture, weekly summary, content patterns, ideation. Done after 03a is verified green.

## SCOPE BOUNDARY

This prompt does FIVE things only:
1. Database migration to add KPI columns + theme column to existing tables
2. KPI calculation engine that runs at sync time
3. Hard-coded theme detection at sync time
4. Dashboard home page enriched with 4 KPI cards
5. Posts table enriched + new Post Detail page

If completing this requires touching files outside the "Files allowed to change" list, STOP and report. NO AI integration in this prompt. NO topical reactivity. NO charts/graphs (sparklines for KPI cards are OK; full charts come later).

## Carry-over (LOCKED, must not regress)

- All design tokens, fonts, design system components
- Visual identity (no shadows, flat)
- Auth flow, session persistence (from 02d, 02e)
- Disconnect flow (from 02d)
- Manual sync button (from 02e)
- Meta OAuth flow
- Mock provider behavior
- All other pages still work
- Theme detection must NOT break existing posts — handle gracefully if a post can't be classified (theme = 'other' fallback)

## Files allowed to change

For Deliverable 1 (DB Migration):
- New file: `supabase/migrations/0002_kpi_columns_and_themes.sql`

For Deliverable 2 (KPI engine):
- New file: `src/lib/kpis/calculate-post-kpis.ts`
- New file: `src/lib/kpis/types.ts`
- New file: `src/lib/kpis/benchmarks.ts`
- New file: `src/lib/kpis/formatters.ts`
- `src/lib/sync/sync-account.ts` — wire in KPI calculation after metric fetch

For Deliverable 3 (Theme detection):
- New file: `src/lib/themes/detect-theme.ts`
- New file: `src/lib/themes/theme-keywords.ts`
- New file: `src/lib/themes/types.ts`
- `src/lib/sync/sync-account.ts` — wire in theme detection at post insert time

For Deliverable 4 (Dashboard):
- `src/app/dashboard/page.tsx` — enrich with 4 KPI cards
- New file: `src/components/dashboard/KpiCard.tsx`
- New file: `src/components/dashboard/KpiSparkline.tsx`
- New file: `src/components/dashboard/TopPostsWidget.tsx`

For Deliverable 5 (Posts):
- `src/app/dashboard/posts/page.tsx` — enrich table with KPI columns + theme tag
- New file: `src/app/dashboard/posts/[id]/page.tsx`
- New file: `src/components/posts/PostKpiGrid.tsx`
- New file: `src/components/posts/PostMetricsTimeline.tsx`

## DO NOT TOUCH

- Design system components (`src/components/design-system/`)
- Theme files (`src/themes/`)
- Globals.css
- Provider files except `src/providers/meta-instagram/insights-config.ts` (and only to ADD metrics if missing — see below)
- Token encryption
- Login/signup
- Disconnect flow
- Meta OAuth flow
- Account-level sync logic

## Important: Meta API metric availability

Before writing KPI logic, ensure all required raw metrics are fetched from Meta. The provider's `insights-config.ts` defines which metrics get requested per media type.

**Required raw metrics for KPIs (per post):**
- `impressions` (or `views` in v22+ — fall back gracefully)
- `reach`
- `likes`
- `comments`
- `saves`
- `shares` (CRITICAL — this is the "sends" signal)
- `video_views` (for Reels)
- `total_interactions` (sometimes available, useful)
- `plays` (Reels-specific)

If `insights-config.ts` does NOT request `shares` and `saves` for IMAGE/CAROUSEL types, ADD them. This is the only allowed touch on a provider file.

Account-level metrics needed (already mostly there):
- `followers` over time (already in `account_metrics_snapshots`)

## Deliverable 1: Database migration

Create `supabase/migrations/0002_kpi_columns_and_themes.sql`:

```sql
-- =====================================================================
-- 0002: KPI columns and theme classification
-- =====================================================================

-- Add computed KPI columns to post_metrics_snapshots
-- These are calculated at sync time and stored for fast dashboard queries.
alter table public.post_metrics_snapshots
  add column if not exists er_by_reach numeric(7,4),       -- engagement rate by reach (%)
  add column if not exists saves_per_reach numeric(7,4),   -- saves / reach × 100
  add column if not exists sends_per_reach numeric(7,4),   -- shares / reach × 100
  add column if not exists likes_per_reach numeric(7,4),   -- likes / reach × 100
  add column if not exists save_to_like_ratio numeric(7,4),-- saves / likes
  add column if not exists reach_rate numeric(7,4),        -- reach / followers_at_time × 100
  add column if not exists completion_rate numeric(7,4),   -- watch_time / (length × views) × 100, null for non-video
  add column if not exists avg_watch_time_seconds numeric(7,2);

-- Index for sorting by KPIs on dashboard
create index if not exists post_metrics_er_idx
  on public.post_metrics_snapshots(er_by_reach desc nulls last);

create index if not exists post_metrics_saves_per_reach_idx
  on public.post_metrics_snapshots(saves_per_reach desc nulls last);

-- Theme classification on posts table
alter table public.posts
  add column if not exists theme text,
  add column if not exists theme_confidence text check (theme_confidence in ('high', 'medium', 'low', null));

create index if not exists posts_theme_idx
  on public.posts(theme) where theme is not null;

-- Followers snapshot at post time (for accurate reach_rate calc)
-- Some posts may have null here if synced before this migration
alter table public.posts
  add column if not exists followers_at_publish integer;

-- A view that joins posts with their latest snapshot — useful for dashboard queries
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

-- RLS for the view: enforced through the underlying tables' RLS
-- No separate policy needed.

-- updated_at trigger for posts table if not already there
do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'posts_touch'
  ) then
    create trigger posts_touch before update on public.posts
      for each row execute function public.touch_updated_at();
  end if;
end $$;
```

Create `supabase/README.md` update section or `supabase/migrations/README.md` explaining how to run this:

```
To apply this migration:
1. Open Supabase Dashboard → SQL Editor
2. Paste contents of 0002_kpi_columns_and_themes.sql
3. Run
4. Verify in Database → Tables that new columns exist on post_metrics_snapshots and posts
```

## Deliverable 2: KPI calculation engine

### 2.1 Types

Create `src/lib/kpis/types.ts`:

```ts
export interface RawPostMetrics {
  impressions: number | null;
  reach: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;     // "sends" in Instagram terms
  saves: number | null;
  videoViews: number | null;
  watchTimeSeconds: number | null;
  // From the post itself:
  mediaType: 'image' | 'video' | 'carousel' | 'story' | 'reel' | 'text';
  videoLengthSeconds?: number | null;  // estimated from views/watch if needed
  followersAtPublish: number | null;
}

export interface ComputedKpis {
  erByReach: number | null;          // (likes + comments + saves + shares) / reach × 100
  savesPerReach: number | null;
  sendsPerReach: number | null;
  likesPerReach: number | null;
  saveToLikeRatio: number | null;
  reachRate: number | null;          // reach / followers × 100
  completionRate: number | null;     // null for non-video
  avgWatchTimeSeconds: number | null;
}

export type KpiTier = 'excellent' | 'good' | 'average' | 'low';

export interface KpiBenchmark {
  excellent: number;
  good: number;
  average: number;
  // Below average = "low"
}
```

### 2.2 Calculation logic

Create `src/lib/kpis/calculate-post-kpis.ts`:

```ts
import type { RawPostMetrics, ComputedKpis } from './types';

const safeRatio = (numerator: number | null, denominator: number | null): number | null => {
  if (numerator == null || denominator == null || denominator === 0) return null;
  return numerator / denominator;
};

const safePct = (numerator: number | null, denominator: number | null): number | null => {
  const r = safeRatio(numerator, denominator);
  return r == null ? null : Number((r * 100).toFixed(4));
};

export function calculatePostKpis(raw: RawPostMetrics): ComputedKpis {
  const { reach, likes, comments, saves, shares, videoViews, watchTimeSeconds, mediaType, followersAtPublish } = raw;

  const totalEngagement =
    (likes ?? 0) + (comments ?? 0) + (saves ?? 0) + (shares ?? 0);

  const erByReach = reach && reach > 0
    ? Number(((totalEngagement / reach) * 100).toFixed(4))
    : null;

  const isVideo = mediaType === 'video' || mediaType === 'reel';
  
  // avg watch time: total watch time / video views
  const avgWatchTime = isVideo && videoViews && videoViews > 0 && watchTimeSeconds != null
    ? Number((watchTimeSeconds / videoViews).toFixed(2))
    : null;

  // completion rate: harder — we don't have video length from API directly
  // Estimate: if avgWatchTime > 0, completion rate = avgWatchTime / estimated_length × 100
  // For now, leave null if we can't compute. Future: store video duration on post.
  const completionRate = null; // TODO: requires storing video duration

  return {
    erByReach,
    savesPerReach: safePct(saves, reach),
    sendsPerReach: safePct(shares, reach),
    likesPerReach: safePct(likes, reach),
    saveToLikeRatio: likes && likes > 0 && saves != null
      ? Number((saves / likes).toFixed(4))
      : null,
    reachRate: safePct(reach, followersAtPublish),
    completionRate,
    avgWatchTimeSeconds: avgWatchTime,
  };
}
```

### 2.3 Benchmarks

Create `src/lib/kpis/benchmarks.ts`:

```ts
import type { KpiBenchmark, KpiTier } from './types';

// Industry benchmarks 2026, calibrated for creator accounts (5K-500K followers).
// Values are %. Source: Hootsuite, Sprout Social, Buffer research.

export const BENCHMARKS = {
  erByReach: { excellent: 6, good: 4, average: 2 } satisfies KpiBenchmark,
  savesPerReach: { excellent: 3, good: 1.5, average: 0.5 } satisfies KpiBenchmark,
  sendsPerReach: { excellent: 1.5, good: 0.5, average: 0.1 } satisfies KpiBenchmark,
  likesPerReach: { excellent: 8, good: 4, average: 2 } satisfies KpiBenchmark,
  reachRate: { excellent: 30, good: 15, average: 8 } satisfies KpiBenchmark,
  saveToLikeRatio: { excellent: 0.3, good: 0.15, average: 0.05 } satisfies KpiBenchmark,
} as const;

export function classifyKpi(value: number | null, benchmark: KpiBenchmark): KpiTier | null {
  if (value == null) return null;
  if (value >= benchmark.excellent) return 'excellent';
  if (value >= benchmark.good) return 'good';
  if (value >= benchmark.average) return 'average';
  return 'low';
}

export function kpiTierColor(tier: KpiTier | null): 'lime' | 'coral' | 'muted' | 'primary' {
  switch (tier) {
    case 'excellent': return 'lime';
    case 'good': return 'lime';
    case 'average': return 'primary';
    case 'low': return 'coral';
    default: return 'muted';
  }
}
```

### 2.4 Formatters

Create `src/lib/kpis/formatters.ts`:

```ts
export function formatKpiPercent(value: number | null, decimals = 2): string {
  if (value == null) return '—';
  return `${value.toFixed(decimals)}%`;
}

export function formatKpiNumber(value: number | null, decimals = 2): string {
  if (value == null) return '—';
  return value.toFixed(decimals);
}

export function formatLargeNumber(value: number | null): string {
  if (value == null) return '—';
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toString();
}

export function formatDelta(current: number | null, previous: number | null): {
  text: string;
  tone: 'lime' | 'coral' | 'muted';
} {
  if (current == null || previous == null || previous === 0) {
    return { text: '—', tone: 'muted' };
  }
  const delta = ((current - previous) / previous) * 100;
  const sign = delta >= 0 ? '+' : '';
  const tone = delta > 1 ? 'lime' : delta < -1 ? 'coral' : 'muted';
  return { text: `${sign}${delta.toFixed(1)}%`, tone };
}

export function formatRelativeTime(isoDate: string | null, locale: 'ro' | 'en' = 'ro'): string {
  if (!isoDate) return '—';
  const date = new Date(isoDate);
  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);
  
  if (locale === 'ro') {
    if (minutes < 1) return 'acum';
    if (minutes < 60) return `acum ${minutes} min`;
    if (hours < 24) return `acum ${hours}h`;
    if (days < 7) return `acum ${days} zile`;
    return date.toLocaleDateString('ro-RO');
  }
  // English fallback
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString('en-US');
}
```

### 2.5 Wire into sync

In `src/lib/sync/sync-account.ts`, after fetching post metrics from the provider but BEFORE inserting into `post_metrics_snapshots`, compute KPIs:

```ts
import { calculatePostKpis } from '@/lib/kpis/calculate-post-kpis';

// ... existing code that gets normalizedMetrics from provider.fetchPostMetrics()

// Look up the post's followersAtPublish (or use current account followers)
const followersAtPublish = post.followersAtPublish ?? account.currentFollowers ?? null;

const kpis = calculatePostKpis({
  impressions: normalizedMetrics.impressions,
  reach: normalizedMetrics.reach,
  likes: normalizedMetrics.likes,
  comments: normalizedMetrics.comments,
  shares: normalizedMetrics.shares,
  saves: normalizedMetrics.saves,
  videoViews: normalizedMetrics.videoViews,
  watchTimeSeconds: normalizedMetrics.watchTimeSeconds,
  mediaType: post.mediaType,
  followersAtPublish,
});

// Insert into post_metrics_snapshots with KPI columns populated
await supabase.from('post_metrics_snapshots').insert({
  post_id: post.id,
  captured_at: new Date().toISOString(),
  // raw metrics:
  impressions: normalizedMetrics.impressions,
  reach: normalizedMetrics.reach,
  likes: normalizedMetrics.likes,
  comments: normalizedMetrics.comments,
  shares: normalizedMetrics.shares,
  saves: normalizedMetrics.saves,
  video_views: normalizedMetrics.videoViews,
  watch_time_seconds: normalizedMetrics.watchTimeSeconds,
  // computed KPIs:
  er_by_reach: kpis.erByReach,
  saves_per_reach: kpis.savesPerReach,
  sends_per_reach: kpis.sendsPerReach,
  likes_per_reach: kpis.likesPerReach,
  save_to_like_ratio: kpis.saveToLikeRatio,
  reach_rate: kpis.reachRate,
  completion_rate: kpis.completionRate,
  avg_watch_time_seconds: kpis.avgWatchTimeSeconds,
  raw: normalizedMetrics.raw,
});
```

When inserting a NEW post (first time discovered), also populate `followers_at_publish` on the post row using the account's current follower count.

## Deliverable 3: Theme detection

### 3.1 Types

Create `src/lib/themes/types.ts`:

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
  | 'other';

export interface Theme {
  id: ThemeId;
  displayName: string;       // for UI: "FED · Banca Centrală"
  shortLabel: string;        // for tags: "FED"
  description: string;       // Romanian: "Federal Reserve, dobânzi, decizii de politică monetară"
  keywords: string[];        // matched case-insensitively against caption + hashtags
}

export type ThemeConfidence = 'high' | 'medium' | 'low';

export interface ThemeDetectionResult {
  theme: ThemeId;
  confidence: ThemeConfidence;
  matchedKeywords: string[];  // for debugging/transparency
}
```

### 3.2 Keywords (Romanian + English mixed, financial creator focus)

Create `src/lib/themes/theme-keywords.ts`:

```ts
import type { Theme } from './types';

export const THEMES: readonly Theme[] = [
  {
    id: 'fed',
    displayName: 'FED · Politică Monetară',
    shortLabel: 'FED',
    description: 'Federal Reserve, dobânzi americane, Powell, FOMC',
    keywords: [
      'fed', 'powell', 'fomc', 'jerome powell', 'rezerva federală',
      'rezerva federala', 'federal reserve', 'fed minutes', 'fed funds',
      'rata dobânzii', 'rata dobanzii', 'dobanda fed', 'minutele fed',
      'majorare dobandă', 'majorare dobanda', 'cut dobandă', 'cut dobanda',
      'tapering', 'qe', 'quantitative easing',
    ],
  },
  {
    id: 'crypto',
    displayName: 'Crypto · Digital Assets',
    shortLabel: 'CRYPTO',
    description: 'Bitcoin, Ethereum, alte criptomonede, DeFi',
    keywords: [
      'bitcoin', 'btc', 'ethereum', 'eth', 'crypto', 'criptomonedă',
      'criptomoneda', 'cripto', 'altcoin', 'defi', 'nft', 'blockchain',
      'binance', 'coinbase', 'solana', 'sol', 'xrp', 'doge', 'stablecoin',
      'usdt', 'usdc', 'web3', 'mining', 'staking', 'halving',
    ],
  },
  {
    id: 'stocks_us',
    displayName: 'Acțiuni SUA · Wall Street',
    shortLabel: 'STOCKS US',
    description: 'S&P 500, NASDAQ, tech stocks, big caps americane',
    keywords: [
      's&p 500', 'sp500', 'spx', 'nasdaq', 'dow jones', 'dow', 'wall street',
      'nvidia', 'nvda', 'apple', 'aapl', 'microsoft', 'msft', 'tesla', 'tsla',
      'meta', 'amazon', 'amzn', 'google', 'googl', 'magnificent seven',
      'mag 7', 'mag7', 'tech stocks', 'big tech', 'earnings season',
      'raport nvidia', 'raport apple', 'q3 earnings', 'q4 earnings',
      'wall street', 'bursa americană', 'bursa americana',
    ],
  },
  {
    id: 'gold',
    displayName: 'Aur · Metale Prețioase',
    shortLabel: 'AUR',
    description: 'Aur, argint, metale prețioase ca refugiu',
    keywords: [
      'aur', 'xau', 'gold', 'argint', 'silver', 'metale prețioase',
      'metale pretioase', 'refugiu tradițional', 'refugiu traditional',
      'safe haven', 'comex', 'lingouri', 'gold standard',
    ],
  },
  {
    id: 'forex',
    displayName: 'Forex · Valute',
    shortLabel: 'FOREX',
    description: 'Dolar, euro, valute, DXY, carry trade',
    keywords: [
      'dxy', 'dolar', 'dollar', 'usd', 'eur/usd', 'eurusd', 'forex',
      'valută', 'valuta', 'carry trade', 'yen', 'jpy', 'gbp', 'cnh',
      'cny', 'aud', 'cad', 'paritate', 'curs valutar', 'eur',
      'aspiratorul global', 'lichiditate globală', 'lichiditate globala',
    ],
  },
  {
    id: 'real_estate',
    displayName: 'Imobiliare · Locuințe',
    shortLabel: 'IMOBILIARE',
    description: 'Piață imobiliară, locuințe, ipoteci, construcții',
    keywords: [
      'imobiliar', 'imobiliare', 'real estate', 'locuințe', 'locuinte',
      'apartament', 'ipotec', 'mortgage', 'casă', 'casa', 'construc',
      'home depot', 'housing', 'piața imobiliară', 'piata imobiliara',
      'renovă', 'renova', 'renovări', 'renovari',
    ],
  },
  {
    id: 'economy_eu',
    displayName: 'Economie UE · BCE',
    shortLabel: 'EU',
    description: 'BCE, euro, Uniunea Europeană, Lagarde, Germania, Franța',
    keywords: [
      'bce', 'ecb', 'banca centrală europeană', 'banca centrala europeana',
      'lagarde', 'christine lagarde', 'uniunea europeană', 'uniunea europeana',
      'germania', 'bundesbank', 'franța', 'franta', 'italia', 'spania',
      'eurozonă', 'eurozona', 'euro area', 'pib germania',
    ],
  },
  {
    id: 'macro',
    displayName: 'Macro · Economia Globală',
    shortLabel: 'MACRO',
    description: 'Inflație, recesiune, PIB, șomaj, indicatori macro generali',
    keywords: [
      'inflație', 'inflatia', 'inflation', 'cpi', 'ppi', 'pce',
      'recesiune', 'recession', 'pib', 'gdp', 'șomaj', 'somaj',
      'unemployment', 'nfp', 'non-farm payrolls', 'jobs report',
      'consumer confidence', 'pmi', 'manufacturing pmi', 'iss',
      'trade-down', 'walmart', 'target', 'tjx', 'consumer spending',
      'retail sales', 'yield curve', 'curba randamentelor',
    ],
  },
];

export const FALLBACK_THEME: Theme['id'] = 'other';
```

### 3.3 Detection logic

Create `src/lib/themes/detect-theme.ts`:

```ts
import { THEMES, FALLBACK_THEME } from './theme-keywords';
import type { ThemeDetectionResult, ThemeId, ThemeConfidence } from './types';

interface DetectInput {
  caption: string | null;
  hashtags: string[];
}

/**
 * Detects the most likely theme for a post based on keyword matching.
 *
 * Algorithm:
 * 1. Normalize text (lowercase, strip diacritics for matching only)
 * 2. For each theme, count matched keywords in caption + hashtags
 * 3. Theme with most matches wins
 * 4. Confidence:
 *    - high: 3+ keyword matches
 *    - medium: 2 matches
 *    - low: 1 match
 *    - falls through to 'other' with confidence 'low' if no matches
 */
export function detectTheme(input: DetectInput): ThemeDetectionResult {
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
      // Word-boundary-like match for keywords without spaces; substring for multi-word
      if (normKw.includes(' ')) {
        if (haystack.includes(normKw)) matched.push(keyword);
      } else {
        // Match as whole word: bounded by non-letters
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
  else if (bestCount === 1) confidence = 'low';
  else confidence = 'low'; // 'other' is always low

  return {
    theme: bestThemeId,
    confidence,
    matchedKeywords: bestMatches,
  };
}

function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, ''); // strip diacritics
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
```

### 3.4 Wire into sync

In `src/lib/sync/sync-account.ts`, when inserting a NEW post (not updating an existing one), compute theme:

```ts
import { detectTheme } from '@/lib/themes/detect-theme';

const themeResult = detectTheme({
  caption: post.caption,
  hashtags: post.hashtags,
});

await supabase.from('posts').upsert({
  // ... existing fields
  theme: themeResult.theme,
  theme_confidence: themeResult.confidence,
});
```

Note: theme is computed at post-insert time only. For existing posts inserted before this migration, write a one-time backfill: run `detectTheme` on each post.caption and update. This can be a SQL or a server action — pragmatic choice: add a server action `backfillThemesAction` callable from settings, but not required to ship in this prompt.

Better: include backfill at the end of the migration script as a NOTE only (don't auto-run in SQL, JavaScript-level logic).

## Deliverable 4: Dashboard home enrichment

### 4.1 KpiCard component

Create `src/components/dashboard/KpiCard.tsx`:

```tsx
'use client';

import type { KpiTier } from '@/lib/kpis/types';
import { kpiTierColor } from '@/lib/kpis/benchmarks';
import { Card, Eyebrow, Mono, H3 } from '@/components/design-system';
import { KpiSparkline } from './KpiSparkline';

interface KpiCardProps {
  label: string;            // e.g. "ENGAGEMENT RATE"
  eyebrow: string;          // e.g. "BY REACH · ULTIMELE 30 ZILE"
  value: string;            // formatted, e.g. "4.32%"
  delta?: { text: string; tone: 'lime' | 'coral' | 'muted' };
  tier?: KpiTier | null;
  benchmark?: { excellent: number; good: number; average: number };
  sparklineData?: number[]; // daily values for last 30 days
  variant?: 'positive' | 'negative' | 'default';
}

export function KpiCard(props: KpiCardProps) {
  const tone = props.tier ? kpiTierColor(props.tier) : 'primary';
  // Card variant: positive if excellent/good, negative if low, default otherwise
  const variant = props.variant ??
    (props.tier === 'excellent' || props.tier === 'good' ? 'positive' :
     props.tier === 'low' ? 'negative' : 'default');

  return (
    <Card variant={variant}>
      <Eyebrow tone={tone === 'coral' ? 'coral' : tone === 'lime' ? 'lime' : 'muted'}>
        {props.eyebrow}
      </Eyebrow>
      <H3>{props.label}</H3>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginTop: 8 }}>
        <Mono tone={tone} style={{ fontSize: 32, fontWeight: 700 }}>
          {props.value}
        </Mono>
        {props.delta && (
          <Mono tone={props.delta.tone} style={{ fontSize: 13 }}>
            {props.delta.text}
          </Mono>
        )}
      </div>
      {props.sparklineData && props.sparklineData.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <KpiSparkline values={props.sparklineData} tone={tone} />
        </div>
      )}
      {props.tier && props.benchmark && (
        <div style={{ marginTop: 8 }}>
          <Mono tone="muted" style={{ fontSize: 11 }}>
            BENCHMARK · BUN > {props.benchmark.good}% · EXCELENT > {props.benchmark.excellent}%
          </Mono>
        </div>
      )}
    </Card>
  );
}
```

### 4.2 KpiSparkline component

Create `src/components/dashboard/KpiSparkline.tsx`:

```tsx
'use client';

interface KpiSparklineProps {
  values: number[];
  tone?: 'lime' | 'coral' | 'muted' | 'primary';
  height?: number;
}

export function KpiSparkline({ values, tone = 'primary', height = 32 }: KpiSparklineProps) {
  if (values.length < 2) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const width = 200;
  
  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * width;
      const y = height - ((v - min) / range) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  const strokeColor = tone === 'lime' ? 'var(--color-accent-lime)' :
                      tone === 'coral' ? 'var(--color-accent-coral)' :
                      tone === 'muted' ? 'var(--color-text-muted)' :
                      'var(--color-text-primary)';

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} preserveAspectRatio="none">
      <polyline
        fill="none"
        stroke={strokeColor}
        strokeWidth={1.5}
        points={points}
      />
    </svg>
  );
}
```

### 4.3 TopPostsWidget component

Create `src/components/dashboard/TopPostsWidget.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { Card, Eyebrow, H3, Mono, Body } from '@/components/design-system';
import { formatKpiPercent, formatLargeNumber } from '@/lib/kpis/formatters';

interface TopPost {
  id: string;
  caption: string | null;
  mediaType: string;
  publishedAt: string;
  theme: string | null;
  savesPerReach: number | null;
  erByReach: number | null;
  reach: number | null;
}

interface Props {
  posts: TopPost[];
  metricLabel: string;   // "DUPĂ SAVE RATE" etc.
  metricKey: 'savesPerReach' | 'erByReach' | 'sendsPerReach';
}

export function TopPostsWidget({ posts, metricLabel, metricKey }: Props) {
  return (
    <Card>
      <Eyebrow tone="lime">TOP POSTĂRI · {metricLabel}</Eyebrow>
      <H3>Cele mai performante</H3>
      <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {posts.length === 0 ? (
          <Body tone="muted">Niciun post disponibil în această perioadă.</Body>
        ) : (
          posts.map((p, idx) => (
            <Link key={p.id} href={`/dashboard/posts/${p.id}`} style={{ textDecoration: 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <Mono tone="muted" style={{ width: 24 }}>0{idx + 1}</Mono>
                <div style={{ flex: 1, overflow: 'hidden' }}>
                  <Body style={{
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}>
                    {p.caption?.slice(0, 80) ?? '(fără caption)'}
                  </Body>
                  <Mono tone="muted" style={{ fontSize: 11, marginTop: 4 }}>
                    {p.mediaType.toUpperCase()} · {p.theme?.toUpperCase() ?? 'OTHER'} · REACH {formatLargeNumber(p.reach)}
                  </Mono>
                </div>
                <Mono tone="lime">
                  {formatKpiPercent(p[metricKey])}
                </Mono>
              </div>
            </Link>
          ))
        )}
      </div>
    </Card>
  );
}
```

### 4.4 Dashboard page

Update `src/app/dashboard/page.tsx` to compute and render the 4 KPI cards + top posts widget.

The page is a server component. Fetch logic (pseudocode):

```ts
// For the user's connected accounts:
// 1. Fetch all posts in last 30 days + the 30 days before that (for delta)
// 2. Aggregate KPIs: average er_by_reach, saves_per_reach, sends_per_reach
// 3. Fetch follower count snapshots for growth velocity
// 4. Fetch top 5 posts by saves_per_reach (or er_by_reach)
// 5. Build sparkline data: daily aggregates for last 30 days
```

Use Supabase queries on `posts_with_latest_metrics` view. Aggregations done in JS (Postgres aggregations are also fine, choose whichever is cleaner).

Render states:
- **No accounts:** existing State A from prompt 02e
- **Accounts but no posts:** existing State B
- **Accounts + posts:** **NEW State C**:
  - Eyebrow: `DASHBOARD · OVERVIEW · ULTIMELE 30 ZILE`
  - H1: `OVERVIEW.`
  - **Row 1:** Grid of 4 KpiCards (2x2 on desktop, 1x4 on mobile):
    - Engagement Rate by Reach
    - Saves per Reach
    - Sends per Reach
    - Follower Growth (count + delta)
  - **Row 2:** 2-column grid:
    - Left: TopPostsWidget by saves_per_reach
    - Right: TopPostsWidget by sends_per_reach
  - **Row 3:** Optional small section: theme distribution (small list of themes with post counts: "FED · 8 postări", etc.)

If multiple accounts, show one section per account OR aggregate (decide: aggregate is simpler, show per-account in /dashboard/accounts).

For Prompt 03a: aggregate across all user's accounts in the dashboard cards. Per-account view comes in a later prompt if needed.

## Deliverable 5: Posts enrichment + Post Detail

### 5.1 Enhanced Posts list

Update `src/app/dashboard/posts/page.tsx`:

Current table likely has columns: thumbnail, caption, type, date, basic metrics. Enrich to:

| Column | Source |
|--------|--------|
| Thumbnail (or media type icon) | `thumbnail_url` or media type |
| Caption (truncated 80 chars) | `caption` |
| Theme tag | `theme` displayed as Tag component, lime variant if confidence='high', muted otherwise |
| Type | `media_type` (REEL, IMAGE, CAROUSEL) — mono |
| Published | `published_at` (formatted: "20 Mai · 09:30") |
| Reach | `reach` (large number formatted) |
| ER% | `er_by_reach` (tone-colored based on tier) |
| Saves% | `saves_per_reach` |
| Sends% | `sends_per_reach` |
| → | Link to `/dashboard/posts/[id]` |

Use AD Table wrapped to match design system. Sortable by any KPI column. Default sort: published_at desc.

Add filter row above table:
- Theme dropdown (multi-select) — filter by theme
- Media type dropdown — REEL / IMAGE / CAROUSEL / VIDEO
- Date range — last 7 / 30 / 90 days (default 30)

### 5.2 PostKpiGrid component

Create `src/components/posts/PostKpiGrid.tsx`:

A 6-card grid showing all KPIs for a single post (compact KpiCards):
- ER by Reach
- Saves per Reach
- Sends per Reach
- Likes per Reach
- Save-to-Like Ratio
- Reach Rate

Each card uses the KpiCard component but in a compact mode (no sparkline, smaller).

### 5.3 PostMetricsTimeline component

Create `src/components/posts/PostMetricsTimeline.tsx`:

For a single post, show how its metrics evolved over time. If we have multiple snapshots in `post_metrics_snapshots` for this post, render a small timeline (use the KpiSparkline component for each metric, stacked).

If only one snapshot exists, show a message: "Sincronizează din nou pentru a vedea evoluția."

### 5.4 Post Detail page

Create `src/app/dashboard/posts/[id]/page.tsx`:

Server component that:
1. Validates user owns the post (via account ownership through RLS)
2. Fetches the post + all its metric snapshots + theme
3. Renders:
   - Eyebrow: `POSTARE · {THEME_LABEL} · {MEDIA_TYPE}`
   - H1: caption first 60 chars (or "POSTARE FĂRĂ CAPTION")
   - Meta info: published_at (formatted), permalink link, reach, theme tag
   - Section 1: PostKpiGrid (all 6 KPIs)
   - Section 2: PostMetricsTimeline (evolution if multi-snapshot)
   - Section 3: Caption full (expandable), hashtags as Tags, mentions
   - Section 4: Insights placeholder ("Analiză AI · disponibil în Prompt 03b")
   - Footer: "← Înapoi la postări" link

If the post doesn't exist or RLS denies: redirect to `/dashboard/posts` with `?error=post_not_found`.

## Verification checklist

1. `pnpm install` is unchanged
2. `pnpm dev` starts without errors
3. `pnpm build` succeeds with zero TypeScript errors
4. `pnpm lint` passes
5. **DB migration runs:** apply `0002_kpi_columns_and_themes.sql` in Supabase. Verify new columns exist on `post_metrics_snapshots` and `posts`. Verify the `posts_with_latest_metrics` view exists.
6. **KPIs compute on new sync:** disconnect Meta account, reconnect, watch sync. After sync, query `SELECT * FROM post_metrics_snapshots ORDER BY captured_at DESC LIMIT 1;` — KPI columns should be populated (not all null).
7. **Themes detect on new posts:** after re-sync, query `SELECT theme, theme_confidence, COUNT(*) FROM posts GROUP BY theme, theme_confidence;` — expect mostly populated themes, with FED, CRYPTO, etc. detected based on caption content. `other` is acceptable for posts that don't match keywords.
8. **Dashboard renders State C:** with synced posts, visiting `/dashboard` shows the 4 KPI cards in a 2x2 grid with values (not all em-dashes)
9. **Sparklines render:** each KpiCard has a small line under the value showing trend
10. **Top posts widget renders:** shows up to 5 top posts by saves_per_reach with handle to click through
11. **Posts page table is enriched:** new columns for Theme, ER%, Saves%, Sends% appear with values formatted as percentages
12. **Theme filter works:** selecting a theme in the filter shows only matching posts
13. **Post detail page works:** clicking a post in the table navigates to `/dashboard/posts/{id}` and shows the KPI grid + metadata
14. **No regression on /design-system page**
15. **No regression on /dashboard/accounts** — connect, disconnect, sync all still work
16. **No shadows added anywhere** — inspect KpiCard, KpiSparkline in DevTools, computed box-shadow must be 'none'
17. **Romanian copy throughout** — all eyebrows, titles, body text in Romanian
18. **No NaN/Infinity in UI:** edge cases (0 reach, null values) render as `—` not `NaN%` or `Infinity%`
19. **RLS preserved:** post detail page returns "not found" if accessing another user's post (test by manipulating URL with foreign UUID)
20. **One-time backfill (optional):** for old posts (pre-migration), KPIs will be null. Acceptable. Either: (a) let users re-sync to populate, OR (b) run a one-time backfill server action that the user clicks. Choose (a) for this prompt — re-sync is cheaper.

## Notes for Claude Code

- **Don't over-engineer the KPI engine.** It's pure functions. Keep it simple.
- **The view `posts_with_latest_metrics`** is the primary data source for dashboard and posts page. Use it instead of doing JOINs in every query.
- **All numbers in DB are stored as numeric(7,4) for percentages.** Frontend formats to 2 decimals.
- **Theme detection runs ONLY at post insert time**, not on every read. If we add new keywords later, old posts keep their old classification until re-classified.
- **Edge case: 0 reach.** If reach is 0, all percentage KPIs should be null. The `safeRatio` helper handles this.
- **Edge case: missing follower count at publish.** If the post was inserted before we tracked this, `reach_rate` will be null. Acceptable.
- **Mock provider posts** should also work with KPIs — the calculate function is provider-agnostic. Mock data has reasonable values for likes/saves/shares.
- **Performance: don't fetch ALL metrics snapshots for the dashboard query.** Use `posts_with_latest_metrics` which already gets the latest snapshot per post via LATERAL join.
- **The `theme` column on `posts`** can be NULL initially (for posts synced before this migration). Handle NULL gracefully in UI: show as "OTHER" or "—".
- **Sparkline data** is daily aggregates over last 30 days. If a day has no posts, value is null and the line should skip that point (or use 0, your choice — null gives cleaner trends).
- **Don't add charts beyond the sparkline.** Resist scope creep. Bar charts, pie charts, time series — all come later if needed.

## What Andrei will do after this prompt

1. Apply `0002_kpi_columns_and_themes.sql` migration in Supabase Dashboard
2. `pnpm dev` — verify no errors
3. Trigger a re-sync (click Sync button on Meta account in `/dashboard/accounts`)
4. Verify in Supabase: `SELECT theme, COUNT(*) FROM posts GROUP BY theme` — themes should be classified
5. Verify `SELECT er_by_reach, saves_per_reach, sends_per_reach FROM post_metrics_snapshots LIMIT 5` — KPIs should be populated
6. Visit `/dashboard` — see the 4 KPI cards with real values
7. Visit `/dashboard/posts` — see the enriched table
8. Click any post → land on `/dashboard/posts/[id]` → see the KPI grid
9. Report:
   - Which themes were detected correctly vs. mis-classified
   - Whether KPI values "feel right" (sanity check against industry benchmarks)
   - Any visual issues with the design system integration
   - Any console errors or warnings

After 03a is verified green, we proceed to **Prompt 03b: AI Analyses** — which adds the Gemini provider, the 3 analysis types (weekly summary, content patterns, ideation), the Vercel cron job, and the analyses pages. That prompt assumes 03a's KPIs are working and reads from them.