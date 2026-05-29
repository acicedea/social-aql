import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { extractHook, classifyHookType, classifyCaptionLength, countCaptionWords, detectSaveCta } from '@/lib/content-analysis/caption-utils';
import type { HookType } from '@/lib/content-analysis/caption-utils';

// Exclude null AND zero for rate metrics (0 = data unavailable from Meta, not actual zero)
function safeAvg(values: Array<number | null>): number | null {
  const valid = values.filter((v): v is number => v != null && v > 0);
  if (valid.length === 0) return null;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}

function avg(values: Array<number | null>): number | null {
  const nums = values.filter((v): v is number => v != null);
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const DAYS = ['Duminică', 'Luni', 'Marți', 'Miercuri', 'Joi', 'Vineri', 'Sâmbătă'];

export interface PostForAnalysis {
  postId: string;
  caption: string;
  captionFull: string;
  hook: string;
  hookType: HookType;
  captionLength: 'short' | 'medium' | 'long';
  captionWordCount: number;
  hasQuestion: boolean;
  hasNumber: boolean;
  hasSaveCta: boolean;
  hashtagCount: number;
  mediaType: string;
  theme: string | null;
  themeSecondary: string | null;
  erByReach: number | null;
  savesPerReach: number | null;
  sendsPerReach: number | null;
  reach: number | null;
  saveToLikeRatio: number | null;
  publishedAt: string;
  dayOfWeek: string;
  hourOfDay: number;
}

function toPostForAnalysis(p: {
  id: string;
  caption: string | null;
  media_type: string;
  theme: string | null;
  theme_secondary?: string | null;
  er_by_reach: number | null;
  saves_per_reach: number | null;
  sends_per_reach: number | null;
  reach: number | null;
  save_to_like_ratio?: number | null;
  published_at: string;
  hashtags?: unknown;
}): PostForAnalysis {
  const caption = p.caption ?? '';
  const dt = new Date(p.published_at);
  const hashtags: string[] = Array.isArray(p.hashtags) ? (p.hashtags as string[]) : [];
  return {
    postId: p.id,
    caption: caption.slice(0, 200),
    captionFull: caption.slice(0, 400),
    hook: extractHook(caption),
    hookType: classifyHookType(caption),
    captionLength: classifyCaptionLength(caption),
    captionWordCount: countCaptionWords(caption),
    hasQuestion: caption.includes('?'),
    hasNumber: /\d/.test(caption.slice(0, 100)),
    hasSaveCta: detectSaveCta(caption),
    hashtagCount: hashtags.length,
    mediaType: p.media_type,
    theme: p.theme,
    themeSecondary: p.theme_secondary ?? null,
    erByReach: p.er_by_reach,
    savesPerReach: (p.saves_per_reach ?? 0) === 0 ? null : p.saves_per_reach,
    sendsPerReach: (p.sends_per_reach ?? 0) === 0 ? null : p.sends_per_reach,
    reach: p.reach,
    saveToLikeRatio: p.save_to_like_ratio ?? null,
    publishedAt: p.published_at,
    dayOfWeek: DAYS[dt.getDay()],
    hourOfDay: dt.getHours(),
  };
}

interface PeriodStats {
  from: string;
  to: string;
  label: string;
  postCount: number;
  sampleSizeWarning: boolean;
  avgErByReach: number | null;
  avgSavesPerReach: number | null;
  avgSendsPerReach: number | null;
  avgReach: number | null;
  totalReach: number | null;
  followerStart: number | null;
  followerEnd: number | null;
}

export interface WeeklyDataBundle {
  accountName: string;
  handle: string;
  currentPeriod: PeriodStats & { posts: PostForAnalysis[] };
  previousPeriod: PeriodStats;
  themeBreakdown: Array<{
    theme: string;
    postCount: number;
    avgEr: number | null;
    avgSaves: number | null;
    avgSends: number | null;
  }>;
}

export async function buildWeeklyData(
  userId: string,
  accountId: string
): Promise<WeeklyDataBundle> {
  const supabase = await createSupabaseServerClient();

  const { data: account } = await supabase
    .from('accounts')
    .select('display_name, handle')
    .eq('id', accountId)
    .eq('user_id', userId)
    .single();

  const now = new Date();
  const period1Start = new Date(now.getTime() - 14 * 86400_000);
  const period2Start = new Date(now.getTime() - 28 * 86400_000);

  const [{ data: currentRaw }, { data: prevRaw }] = await Promise.all([
    supabase
      .from('posts_with_latest_metrics')
      .select(
        'id, caption, media_type, theme, theme_secondary, er_by_reach, saves_per_reach, sends_per_reach, reach, save_to_like_ratio, published_at, hashtags'
      )
      .eq('account_id', accountId)
      .gte('published_at', period1Start.toISOString())
      .lte('published_at', now.toISOString())
      .order('er_by_reach', { ascending: false })
      .limit(50),
    supabase
      .from('posts_with_latest_metrics')
      .select('er_by_reach, saves_per_reach, sends_per_reach, reach')
      .eq('account_id', accountId)
      .gte('published_at', period2Start.toISOString())
      .lt('published_at', period1Start.toISOString())
      .limit(50),
  ]);

  const cur = currentRaw ?? [];
  const prev = prevRaw ?? [];

  const [{ data: followerNow }, { data: follower14dAgo }] = await Promise.all([
    supabase
      .from('account_metrics_snapshots')
      .select('followers')
      .eq('account_id', accountId)
      .order('captured_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('account_metrics_snapshots')
      .select('followers')
      .eq('account_id', accountId)
      .lte('captured_at', period1Start.toISOString())
      .order('captured_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const posts = cur.map(toPostForAnalysis);

  const themeMap: Record<string, { count: number; ers: Array<number | null>; saves: Array<number | null>; sends: Array<number | null> }> =
    {};
  for (const p of posts) {
    const t = p.theme ?? 'other';
    if (!themeMap[t]) themeMap[t] = { count: 0, ers: [], saves: [], sends: [] };
    themeMap[t].count++;
    themeMap[t].ers.push(p.erByReach);
    themeMap[t].saves.push(p.savesPerReach);
    themeMap[t].sends.push(p.sendsPerReach);
  }

  return {
    accountName: account?.display_name ?? '',
    handle: account?.handle ?? '',
    currentPeriod: {
      from: isoDate(period1Start),
      to: isoDate(now),
      label: 'Ultimele 14 zile',
      postCount: cur.length,
      sampleSizeWarning: cur.length < 5,
      avgErByReach: safeAvg(cur.map((p) => p.er_by_reach)),
      avgSavesPerReach: safeAvg(cur.map((p) => p.saves_per_reach)),
      avgSendsPerReach: safeAvg(cur.map((p) => p.sends_per_reach)),
      avgReach: avg(cur.map((p) => p.reach)),
      totalReach: cur.reduce((s, p) => s + (p.reach ?? 0), 0) || null,
      followerStart: follower14dAgo?.followers ?? null,
      followerEnd: followerNow?.followers ?? null,
      posts,
    },
    previousPeriod: {
      from: isoDate(period2Start),
      to: isoDate(period1Start),
      label: 'Perioada precedentă (14 zile)',
      postCount: prev.length,
      sampleSizeWarning: prev.length < 5,
      avgErByReach: safeAvg(prev.map((p) => p.er_by_reach)),
      avgSavesPerReach: safeAvg(prev.map((p) => p.saves_per_reach)),
      avgSendsPerReach: safeAvg(prev.map((p) => p.sends_per_reach)),
      avgReach: avg(prev.map((p) => p.reach)),
      totalReach: prev.reduce((s, p) => s + (p.reach ?? 0), 0) || null,
      followerStart: null,
      followerEnd: follower14dAgo?.followers ?? null,
    },
    themeBreakdown: Object.entries(themeMap).map(([theme, { count, ers, saves, sends }]) => ({
      theme,
      postCount: count,
      avgEr: safeAvg(ers),
      avgSaves: safeAvg(saves),
      avgSends: safeAvg(sends),
    })),
  };
}

export interface PatternsDataBundle {
  accountName: string;
  handle: string;
  rangeDays: number;
  totalPosts: number;
  posts: PostForAnalysis[];
  themeStats: Array<{ theme: string; count: number; avgEr: number | null; avgSaves: number | null }>;
  formatStats: Array<{ mediaType: string; count: number; avgEr: number | null }>;
}

export async function buildPatternsData(
  userId: string,
  accountId: string,
  rangeDays = 60
): Promise<PatternsDataBundle> {
  const supabase = await createSupabaseServerClient();

  const { data: account } = await supabase
    .from('accounts')
    .select('display_name, handle')
    .eq('id', accountId)
    .eq('user_id', userId)
    .single();

  const since = new Date(Date.now() - rangeDays * 86400_000);

  const { data: raw } = await supabase
    .from('posts_with_latest_metrics')
    .select(
      'id, caption, media_type, theme, theme_secondary, er_by_reach, saves_per_reach, sends_per_reach, reach, save_to_like_ratio, published_at, hashtags'
    )
    .eq('account_id', accountId)
    .gte('published_at', since.toISOString())
    .order('er_by_reach', { ascending: false })
    .limit(50);

  const posts = (raw ?? []).map(toPostForAnalysis);

  const themeMap: Record<string, { ers: Array<number | null>; saves: Array<number | null> }> = {};
  const formatMap: Record<string, { ers: Array<number | null> }> = {};

  for (const p of posts) {
    const t = p.theme ?? 'other';
    if (!themeMap[t]) themeMap[t] = { ers: [], saves: [] };
    themeMap[t].ers.push(p.erByReach);
    themeMap[t].saves.push(p.savesPerReach);

    if (!formatMap[p.mediaType]) formatMap[p.mediaType] = { ers: [] };
    formatMap[p.mediaType].ers.push(p.erByReach);
  }

  return {
    accountName: account?.display_name ?? '',
    handle: account?.handle ?? '',
    rangeDays,
    totalPosts: posts.length,
    posts,
    themeStats: Object.entries(themeMap).map(([theme, { ers, saves }]) => ({
      theme,
      count: ers.length,
      avgEr: avg(ers),
      avgSaves: safeAvg(saves),
    })),
    formatStats: Object.entries(formatMap).map(([mediaType, { ers }]) => ({
      mediaType,
      count: ers.length,
      avgEr: avg(ers),
    })),
  };
}

export async function buildIdeationData(
  userId: string,
  accountId: string
): Promise<PatternsDataBundle> {
  return buildPatternsData(userId, accountId, 90);
}
