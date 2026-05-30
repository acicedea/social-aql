import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { GeminiTool } from './types';

// =====================================================================
// TOOL DEFINITIONS (sent to Gemini so it knows what tools exist)
// =====================================================================

export const CHAT_TOOLS: GeminiTool[] = [
  {
    name: 'getAccountKpis',
    description: 'Get key performance indicators for the connected Instagram account over a date range. Returns engagement rate, save rate, send rate, reach, and follower growth.',
    parameters: {
      type: 'object',
      properties: {
        dateRange: {
          type: 'string',
          enum: ['7d', '14d', '30d', '90d'],
          description: 'Date range to analyze. Default: 30d',
        },
      },
    },
  },
  {
    name: 'getTopPosts',
    description: 'Get top performing posts ranked by a specific metric. Use to answer questions like "what are my best posts?" or "which posts got the most saves?"',
    parameters: {
      type: 'object',
      properties: {
        metric: {
          type: 'string',
          enum: ['er_by_reach', 'saves_per_reach', 'sends_per_reach', 'reach', 'likes'],
          description: 'Metric to rank posts by',
        },
        limit: {
          type: 'string',
          description: 'Number of posts to return (1-20). Default: 5',
        },
        dateRange: {
          type: 'string',
          enum: ['7d', '14d', '30d', '90d', 'all'],
          description: 'Date range. Default: 30d',
        },
      },
      required: ['metric'],
    },
  },
  {
    name: 'getPostingTimingAnalysis',
    description: 'Analyze which days and times generate the best engagement. Use to answer questions about optimal posting times.',
    parameters: {
      type: 'object',
      properties: {
        dateRange: {
          type: 'string',
          enum: ['30d', '90d', 'all'],
          description: 'Date range for analysis. More data = more reliable results.',
        },
      },
    },
  },
  {
    name: 'comparePeriods',
    description: 'Compare KPI performance between two time periods. Use to answer "how did I do this week vs last week?" or similar comparison questions.',
    parameters: {
      type: 'object',
      properties: {
        period1Days: {
          type: 'string',
          description: 'Number of days for current period (e.g., "7" for last 7 days)',
        },
        period2Days: {
          type: 'string',
          description: 'Number of days for comparison period (e.g., "7" for the 7 days before that). Usually same as period1Days.',
        },
      },
      required: ['period1Days', 'period2Days'],
    },
  },
  {
    name: 'getThemePerformance',
    description: 'Get performance metrics broken down by content theme (FED, crypto, macro, education, etc.). Use to answer questions about which topics work best.',
    parameters: {
      type: 'object',
      properties: {
        theme: {
          type: 'string',
          description: 'Specific theme to analyze. If omitted, returns all themes.',
          enum: [
            'fed', 'crypto', 'stocks_us', 'gold', 'forex',
            'real_estate', 'economy_eu', 'macro',
            'education', 'investing_principles', 'trading_strategy',
            'emerging_markets', 'other',
          ],
        },
        dateRange: {
          type: 'string',
          enum: ['30d', '90d', 'all'],
          description: 'Date range. Default: 30d',
        },
      },
    },
  },
  {
    name: 'getHookTypeAnalysis',
    description: 'Analyze which types of opening hooks (question, statement, quote, number, command) perform best in terms of engagement rate.',
    parameters: {
      type: 'object',
      properties: {
        dateRange: {
          type: 'string',
          enum: ['30d', '90d', 'all'],
          description: 'Date range. Default: 30d',
        },
      },
    },
  },
  {
    name: 'getDiagnosticFlags',
    description: 'Get the current list of detected issues and recommendations for the account. Use to answer questions about what needs improvement.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'getPostDetails',
    description: 'Get detailed information about a specific post including all metrics. Use when the user asks about a specific post.',
    parameters: {
      type: 'object',
      properties: {
        postId: {
          type: 'string',
          description: 'The UUID of the post',
        },
      },
      required: ['postId'],
    },
  },
];

// =====================================================================
// TOOL IMPLEMENTATIONS (actual DB queries)
// =====================================================================

interface ToolContext {
  userId: string;
  accountId: string;
}

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<unknown> {
  const supabase = await createSupabaseServerClient();

  switch (name) {
    case 'getAccountKpis':
      return getAccountKpis(supabase, ctx, String(args.dateRange ?? '30d'));

    case 'getTopPosts':
      return getTopPosts(
        supabase, ctx,
        String(args.metric ?? 'er_by_reach'),
        parseInt(String(args.limit ?? '5'), 10),
        String(args.dateRange ?? '30d'),
      );

    case 'getPostingTimingAnalysis':
      return getPostingTimingAnalysis(supabase, ctx, String(args.dateRange ?? '30d'));

    case 'comparePeriods':
      return comparePeriods(
        supabase, ctx,
        parseInt(String(args.period1Days ?? '7'), 10),
        parseInt(String(args.period2Days ?? '7'), 10),
      );

    case 'getThemePerformance':
      return getThemePerformance(
        supabase, ctx,
        args.theme ? String(args.theme) : undefined,
        String(args.dateRange ?? '30d'),
      );

    case 'getHookTypeAnalysis':
      return getHookTypeAnalysis(supabase, ctx, String(args.dateRange ?? '30d'));

    case 'getDiagnosticFlags':
      return getDiagnosticFlags(supabase, ctx);

    case 'getPostDetails':
      return getPostDetails(supabase, ctx, String(args.postId ?? ''));

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ---- Individual tool implementations ----

function buildDateFilter(dateRange: string): string {
  const days: Record<string, number> = {
    '7d': 7, '14d': 14, '30d': 30, '90d': 90, 'all': 36500,
  };
  const d = days[dateRange] ?? 30;
  return new Date(Date.now() - d * 86400000).toISOString();
}

async function getAccountKpis(supabase: any, ctx: ToolContext, dateRange: string) {
  const since = buildDateFilter(dateRange);
  const { data: posts } = await supabase
    .from('posts_with_latest_metrics')
    .select('er_by_reach, saves_per_reach, sends_per_reach, reach, published_at')
    .eq('account_id', ctx.accountId)
    .gte('published_at', since)
    .not('er_by_reach', 'is', null)
    .gt('er_by_reach', 0);

  if (!posts || posts.length === 0) {
    return { error: 'No data for this period', postCount: 0 };
  }

  const safeAvg = (vals: any[]) => {
    const v = vals.filter((x: number) => x > 0);
    return v.length ? v.reduce((a: number, b: number) => a + b, 0) / v.length : null;
  };

  return {
    period: dateRange,
    postCount: posts.length,
    avgErByReach: safeAvg(posts.map((p: any) => p.er_by_reach)),
    avgSavesPerReach: safeAvg(posts.map((p: any) => p.saves_per_reach).filter(Boolean)),
    avgSendsPerReach: safeAvg(posts.map((p: any) => p.sends_per_reach).filter(Boolean)),
    avgReach: safeAvg(posts.map((p: any) => p.reach).filter(Boolean)),
    benchmarks: {
      erByReach: { excellent: 6, good: 4, average: 2 },
      savesPerReach: { excellent: 3, good: 1, average: 0.5 },
      sendsPerReach: { excellent: 1.5, good: 0.5, average: 0.1 },
    },
  };
}

async function getTopPosts(
  supabase: any, ctx: ToolContext,
  metric: string, limit: number, dateRange: string,
) {
  const since = buildDateFilter(dateRange);
  const { data } = await supabase
    .from('posts_with_latest_metrics')
    .select(`
      id, caption, media_type, theme, published_at,
      er_by_reach, saves_per_reach, sends_per_reach, reach
    `)
    .eq('account_id', ctx.accountId)
    .gte('published_at', since)
    .not(metric, 'is', null)
    .gt(metric, 0)
    .order(metric, { ascending: false })
    .limit(Math.min(limit, 20));

  return (data ?? []).map((p: any) => ({
    id: p.id,
    caption: (p.caption ?? '').slice(0, 120),
    mediaType: p.media_type,
    theme: p.theme,
    publishedAt: p.published_at,
    erByReach: p.er_by_reach,
    savesPerReach: p.saves_per_reach,
    sendsPerReach: p.sends_per_reach,
    reach: p.reach,
  }));
}

async function getPostingTimingAnalysis(supabase: any, ctx: ToolContext, dateRange: string) {
  const since = buildDateFilter(dateRange);
  const { data: posts } = await supabase
    .from('posts_with_latest_metrics')
    .select('published_at, er_by_reach, reach')
    .eq('account_id', ctx.accountId)
    .gte('published_at', since)
    .not('er_by_reach', 'is', null)
    .gt('er_by_reach', 0);

  if (!posts || posts.length === 0) return { error: 'Insufficient data' };

  const days = ['Duminică', 'Luni', 'Marți', 'Miercuri', 'Joi', 'Vineri', 'Sâmbătă'];
  const byDay: Record<string, number[]> = {};
  const byHour: Record<number, number[]> = {};

  for (const p of posts) {
    const d = new Date(p.published_at);
    const day = days[d.getDay()];
    const hour = d.getHours();
    if (!byDay[day]) byDay[day] = [];
    if (!byHour[hour]) byHour[hour] = [];
    byDay[day].push(p.er_by_reach);
    byHour[hour].push(p.er_by_reach);
  }

  const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;

  const dayStats = Object.entries(byDay)
    .map(([day, ers]) => ({ day, postCount: ers.length, avgEr: avg(ers) }))
    .sort((a, b) => b.avgEr - a.avgEr);

  const hourStats = Object.entries(byHour)
    .map(([hour, ers]) => ({ hour: parseInt(hour), postCount: ers.length, avgEr: avg(ers) }))
    .sort((a, b) => b.avgEr - a.avgEr)
    .slice(0, 5);

  return {
    bestDays: dayStats.slice(0, 3),
    worstDays: dayStats.slice(-2),
    bestHours: hourStats,
    totalPostsAnalyzed: posts.length,
    note: posts.length < 10 ? 'Date limitate — recomandare cu rezerve' : null,
  };
}

async function comparePeriods(
  supabase: any, ctx: ToolContext,
  period1Days: number, period2Days: number,
) {
  const now = Date.now();
  const p1Start = new Date(now - period1Days * 86400000).toISOString();
  const p2Start = new Date(now - (period1Days + period2Days) * 86400000).toISOString();
  const p2End = new Date(now - period1Days * 86400000).toISOString();

  const fetchPeriod = async (from: string, to: string) => {
    const { data } = await supabase
      .from('posts_with_latest_metrics')
      .select('er_by_reach, saves_per_reach, sends_per_reach, reach')
      .eq('account_id', ctx.accountId)
      .gte('published_at', from)
      .lte('published_at', to)
      .not('er_by_reach', 'is', null)
      .gt('er_by_reach', 0);
    return data ?? [];
  };

  const p1 = await fetchPeriod(p1Start, new Date(now).toISOString());
  const p2 = await fetchPeriod(p2Start, p2End);

  const safeAvg = (posts: any[], key: string) => {
    const vals = posts.map((p: any) => p[key]).filter((v: any) => v != null && v > 0);
    return vals.length ? vals.reduce((a: number, b: number) => a + b, 0) / vals.length : null;
  };

  const delta = (curr: number | null, prev: number | null) => {
    if (!curr || !prev) return null;
    return ((curr - prev) / prev * 100).toFixed(1) + '%';
  };

  const p1Stats = {
    postCount: p1.length,
    avgEr: safeAvg(p1, 'er_by_reach'),
    avgSaves: safeAvg(p1, 'saves_per_reach'),
    avgSends: safeAvg(p1, 'sends_per_reach'),
    avgReach: safeAvg(p1, 'reach'),
  };

  const p2Stats = {
    postCount: p2.length,
    avgEr: safeAvg(p2, 'er_by_reach'),
    avgSaves: safeAvg(p2, 'saves_per_reach'),
    avgSends: safeAvg(p2, 'sends_per_reach'),
    avgReach: safeAvg(p2, 'reach'),
  };

  return {
    currentPeriod: { days: period1Days, ...p1Stats },
    previousPeriod: { days: period2Days, ...p2Stats },
    deltas: {
      er: delta(p1Stats.avgEr, p2Stats.avgEr),
      saves: delta(p1Stats.avgSaves, p2Stats.avgSaves),
      sends: delta(p1Stats.avgSends, p2Stats.avgSends),
      reach: delta(p1Stats.avgReach, p2Stats.avgReach),
    },
  };
}

async function getThemePerformance(
  supabase: any, ctx: ToolContext,
  theme: string | undefined, dateRange: string,
) {
  const since = buildDateFilter(dateRange);
  let query: any = supabase
    .from('posts_with_latest_metrics')
    .select('theme, er_by_reach, saves_per_reach, sends_per_reach, reach, caption, published_at')
    .eq('account_id', ctx.accountId)
    .gte('published_at', since)
    .not('er_by_reach', 'is', null)
    .gt('er_by_reach', 0);

  if (theme) query = query.eq('theme', theme);

  const { data: posts } = await query;
  if (!posts || posts.length === 0) return { error: 'No data', theme };

  if (theme) {
    const safeAvg = (arr: number[]) => {
      const v = arr.filter(x => x > 0);
      return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
    };
    return {
      theme,
      postCount: posts.length,
      avgEr: safeAvg(posts.map((p: any) => p.er_by_reach)),
      avgSaves: safeAvg(posts.map((p: any) => p.saves_per_reach).filter(Boolean)),
      avgSends: safeAvg(posts.map((p: any) => p.sends_per_reach).filter(Boolean)),
      topPost: posts.sort((a: any, b: any) => b.er_by_reach - a.er_by_reach)[0],
    };
  }

  // Group by theme
  const grouped: Record<string, any[]> = {};
  for (const p of posts) {
    const t = p.theme ?? 'other';
    if (!grouped[t]) grouped[t] = [];
    grouped[t].push(p);
  }

  return Object.entries(grouped).map(([t, ps]) => {
    const safeAvg = (arr: number[]) => {
      const v = arr.filter(x => x > 0);
      return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
    };
    return {
      theme: t,
      postCount: ps.length,
      avgEr: safeAvg(ps.map((p: any) => p.er_by_reach)),
      avgSaves: safeAvg(ps.map((p: any) => p.saves_per_reach).filter(Boolean)),
      avgSends: safeAvg(ps.map((p: any) => p.sends_per_reach).filter(Boolean)),
    };
  }).sort((a, b) => (b.avgEr ?? 0) - (a.avgEr ?? 0));
}

async function getHookTypeAnalysis(supabase: any, ctx: ToolContext, dateRange: string) {
  const since = buildDateFilter(dateRange);
  const { data: posts } = await supabase
    .from('posts_with_latest_metrics')
    .select('caption, er_by_reach, saves_per_reach')
    .eq('account_id', ctx.accountId)
    .gte('published_at', since)
    .not('er_by_reach', 'is', null)
    .gt('er_by_reach', 0);

  if (!posts || posts.length === 0) return { error: 'Insufficient data' };

  const { classifyHookType } = await import('@/lib/content-analysis/caption-utils');

  const byType: Record<string, number[]> = {};
  for (const p of posts) {
    const hookType = classifyHookType(p.caption);
    if (!byType[hookType]) byType[hookType] = [];
    byType[hookType].push(p.er_by_reach);
  }

  return Object.entries(byType).map(([type, ers]) => ({
    hookType: type,
    postCount: ers.length,
    avgEr: ers.reduce((a, b) => a + b, 0) / ers.length,
  })).sort((a, b) => b.avgEr - a.avgEr);
}

async function getDiagnosticFlags(supabase: any, ctx: ToolContext) {
  const { data: posts } = await supabase
    .from('posts_with_latest_metrics')
    .select(`
      id, caption, media_type, theme, theme_confidence, hashtags,
      er_by_reach, saves_per_reach, sends_per_reach, reach,
      save_to_like_ratio, published_at
    `)
    .eq('account_id', ctx.accountId)
    .gte('published_at', buildDateFilter('30d'));

  if (!posts || posts.length === 0) return { flags: [], message: 'Insufficient data' };

  const { computeDiagnosticFlags } = await import('@/lib/dashboard/data');
  const { detectSaveCta, classifyHookType, countCaptionWords } =
    await import('@/lib/content-analysis/caption-utils');

  const enriched = posts.map((p: any) => ({
    ...p,
    hasSaveCta: detectSaveCta(p.caption),
    hookType: classifyHookType(p.caption),
    captionWordCount: countCaptionWords(p.caption),
    hashtagCount: (p.hashtags ?? []).length,
  }));

  const safeAvg = (vals: number[]) => {
    const v = vals.filter(x => x > 0);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };

  const flags = computeDiagnosticFlags(enriched, {
    postCount: posts.length,
    avgErByReach: safeAvg(posts.map((p: any) => p.er_by_reach)),
    avgSavesPerReach: safeAvg(posts.map((p: any) => p.saves_per_reach).filter(Boolean)),
    avgSendsPerReach: safeAvg(posts.map((p: any) => p.sends_per_reach).filter(Boolean)),
    avgReach: safeAvg(posts.map((p: any) => p.reach).filter(Boolean)),
    followerStart: null,
    followerEnd: null,
    sampleSizeWarning: posts.length < 5,
    totalReach: null,
  });

  return flags.map((f: any) => ({
    severity: f.severity,
    title: f.title,
    detail: f.detail,
    affectedCount: f.affectedPostIds.length,
    benchmark: f.benchmark,
  }));
}

async function getPostDetails(supabase: any, ctx: ToolContext, postId: string) {
  const { data } = await supabase
    .from('posts_with_latest_metrics')
    .select('*')
    .eq('id', postId)
    .eq('account_id', ctx.accountId)
    .single();

  if (!data) return { error: 'Post not found' };

  return {
    id: data.id,
    caption: data.caption,
    mediaType: data.media_type,
    theme: data.theme,
    publishedAt: data.published_at,
    erByReach: data.er_by_reach,
    savesPerReach: data.saves_per_reach,
    sendsPerReach: data.sends_per_reach,
    reach: data.reach,
    likes: data.likes,
    saves: data.saves,
    shares: data.shares,
    comments: data.comments,
    saveToLikeRatio: data.save_to_like_ratio,
    permalink: data.permalink,
  };
}
