import 'server-only';
import { classifyHookType, classifyCaptionLength, detectSaveCta } from '@/lib/content-analysis/caption-utils';
import { analyzeRetention } from '@/lib/retention/retention-analyzer';
import type { TranscriptionSegment } from '@/lib/transcription/types';
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase/server';
import { THEMES } from '@/lib/themes/theme-keywords';

// ─── Exported Interfaces ─────────────────────────────────────────────────────

export interface AccountOption {
  id: string;
  displayName: string;
  handle: string | null;
  platform: string;
  status: string;
  lastSyncAt: string | null;
}

export interface DashboardParams {
  userId: string;
  accountId: string;
  from: string;   // ISO date string "YYYY-MM-DD"
  to: string;
  prevFrom: string;
  prevTo: string;
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
  title: string;
  detail: string;
  affectedPostIds: string[];
  benchmark: string | null;
}

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
  diagnostics: DiagnosticFlag[];
  videoRetentionSummary: {
    reelsWithData: number;
    avgCompletionRate: number | null;
    reelsWithWeakHook: number;
    reelsWithCriticalDrop: number;
  } | null;
}

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
  topPosts: PostSummary[];
  bottomPosts: PostSummary[];
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

export interface AiInsightsData {
  latestWeeklySummary: AnalysisSummary | null;
  latestContentPatterns: AnalysisSummary | null;
  latestContentIdeation: AnalysisSummary | null;
  recentAnalyses: AnalysisSummary[];
}

// ─── Internal Type ────────────────────────────────────────────────────────────

// Not exported — used only inside data.ts
interface PostWithMetrics {
  id: string;
  accountId: string;
  externalPostId: string;
  publishedAt: string;
  mediaType: string;
  caption: string | null;
  hashtags: string[];
  theme: string | null;
  themeSecondary: string | null;
  erByReach: number | null;
  savesPerReach: number | null;
  sendsPerReach: number | null;
  reach: number | null;
  saveToLikeRatio: number | null;
  // Computed:
  hookType: 'question' | 'statement' | 'number' | 'quote' | 'command' | 'other';
  captionLength: 'short' | 'medium' | 'long';
  hashtagCount: number;
  hasSaveCta: boolean;
  hourOfDay: number;
  dayOfWeek: string;
}

// ─── Helper Functions ─────────────────────────────────────────────────────────

// Excludes null AND zero (zero = no data from Meta API)
function safeAvg(values: Array<number | null | undefined>): number | null {
  const valid = values.filter((v): v is number => v != null && v > 0);
  if (valid.length === 0) return null;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}

const DOW_LABELS = ['Duminică', 'Luni', 'Marți', 'Miercuri', 'Joi', 'Vineri', 'Sâmbătă'] as const;

function hashtagBucket(count: number): '0' | '1-3' | '4-6' | '7-15' | '15+' {
  if (count === 0) return '0';
  if (count <= 3) return '1-3';
  if (count <= 6) return '4-6';
  if (count <= 15) return '7-15';
  return '15+';
}

function toPostWithMetrics(p: {
  id: string;
  account_id: string;
  external_post_id: string;
  published_at: string;
  media_type: string;
  caption: string | null;
  hashtags: unknown;
  theme: string | null;
  theme_secondary?: string | null;
  er_by_reach: number | null;
  saves_per_reach: number | null;
  sends_per_reach: number | null;
  reach: number | null;
  save_to_like_ratio?: number | null;
}): PostWithMetrics {
  const caption = p.caption ?? '';
  const hashtags: string[] = Array.isArray(p.hashtags) ? (p.hashtags as string[]) : [];
  const dt = new Date(p.published_at);
  return {
    id: p.id,
    accountId: p.account_id,
    externalPostId: p.external_post_id,
    publishedAt: p.published_at,
    mediaType: p.media_type,
    caption: p.caption,
    hashtags,
    theme: p.theme,
    themeSecondary: p.theme_secondary ?? null,
    erByReach: (p.er_by_reach ?? 0) === 0 ? null : p.er_by_reach,
    savesPerReach: (p.saves_per_reach ?? 0) === 0 ? null : p.saves_per_reach,
    sendsPerReach: (p.sends_per_reach ?? 0) === 0 ? null : p.sends_per_reach,
    reach: p.reach,
    saveToLikeRatio: p.save_to_like_ratio ?? null,
    hookType: classifyHookType(caption),
    captionLength: classifyCaptionLength(caption),
    hashtagCount: hashtags.length,
    hasSaveCta: detectSaveCta(caption),
    hourOfDay: dt.getHours(),
    dayOfWeek: DOW_LABELS[dt.getDay()],
  };
}

function toPostSummary(p: PostWithMetrics): PostSummary {
  return {
    id: p.id,
    externalPostId: p.externalPostId,
    caption: p.caption,
    mediaType: p.mediaType,
    theme: p.theme,
    publishedAt: p.publishedAt,
    erByReach: p.erByReach,
    savesPerReach: p.savesPerReach,
    sendsPerReach: p.sendsPerReach,
    reach: p.reach,
  };
}

function themeHasKeywordInPreview(theme: string, normalizedPreview: string): boolean {
  const themeConfig = THEMES.find(t => t.id === theme);
  if (!themeConfig) return false;
  return themeConfig.keywords.some(kw => normalizedPreview.includes(kw.toLowerCase()));
}

function computeHookTypePerformance(posts: PostWithMetrics[]): Array<{ hookType: string; avgEr: number | null; count: number }> {
  const map = new Map<string, { ers: number[]; count: number }>();
  for (const p of posts) {
    const ht = p.hookType;
    if (!map.has(ht)) map.set(ht, { ers: [], count: 0 });
    map.get(ht)!.count++;
    if (p.erByReach != null) map.get(ht)!.ers.push(p.erByReach);
  }
  return Array.from(map.entries())
    .map(([hookType, { ers, count }]) => ({ hookType, avgEr: safeAvg(ers), count }))
    .sort((a, b) => (b.avgEr ?? 0) - (a.avgEr ?? 0));
}

// ─── Exported: computeDiagnosticFlags ────────────────────────────────────────

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
      affectedPostIds: posts.filter(p => (p.savesPerReach ?? 0) < 0.3).map(p => p.id),
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

  // FLAG: Carousels without save CTA + low saves
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
  if (posts.length > 0 && otherTheme.length > posts.length * 0.35) {
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
      .normalize('NFD').replace(/[̀-ͯ]/g, '');
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

// ─── Exported: buildDashboardParams ──────────────────────────────────────────

export function buildDashboardParams(
  userId: string,
  accountId: string,
  rangeDays: number,
): DashboardParams {
  const to = new Date();
  const from = new Date(to.getTime() - rangeDays * 86400_000);
  const prevTo = new Date(from.getTime() - 1);
  const prevFrom = new Date(prevTo.getTime() - rangeDays * 86400_000);
  return {
    userId,
    accountId,
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
    prevFrom: prevFrom.toISOString().slice(0, 10),
    prevTo: prevTo.toISOString().slice(0, 10),
  };
}

// ─── Exported: fetchUserAccounts ─────────────────────────────────────────────

export async function fetchUserAccounts(_userId: string): Promise<AccountOption[]> {
  const supabase = createSupabaseServiceClient();
  const { data } = await supabase
    .from('accounts')
    .select('id, display_name, handle, provider_id, status, last_sync_at')
    .eq('status', 'active')
    .order('created_at', { ascending: false });
  return (data ?? []).map(a => ({
    id: a.id,
    displayName: a.display_name,
    handle: a.handle,
    platform: a.provider_id,
    status: a.status,
    lastSyncAt: a.last_sync_at,
  }));
}

// ─── Exported: fetchOverviewData ─────────────────────────────────────────────

export async function fetchOverviewData(params: DashboardParams): Promise<OverviewData> {
  const supabase = createSupabaseServiceClient();

  // 1. account details
  const { data: accountRow } = await supabase
    .from('accounts')
    .select('id, display_name, handle, provider_id, status, last_sync_at')
    .eq('id', params.accountId)
    .eq('user_id', params.userId)
    .single();

  // 2. current period posts
  const { data: currentRaw } = await supabase
    .from('posts_with_latest_metrics')
    .select('id, account_id, external_post_id, published_at, media_type, caption, hashtags, theme, theme_secondary, er_by_reach, saves_per_reach, sends_per_reach, reach, save_to_like_ratio')
    .eq('account_id', params.accountId)
    .gte('published_at', params.from)
    .lte('published_at', params.to + 'T23:59:59')
    .order('published_at', { ascending: false })
    .limit(500);

  // 2b. reel/video retention data
  const { data: retentionRaw } = await supabase
    .from('posts_with_latest_metrics')
    .select('id, media_type, avg_watch_time_seconds, watch_time_seconds, video_views, reach, transcript, transcript_segments')
    .eq('account_id', params.accountId)
    .gte('published_at', params.from)
    .lte('published_at', params.to + 'T23:59:59')
    .in('media_type', ['reel', 'video'])
    .limit(200);

  // 2c. fetch durations from transcription_jobs for reels
  const postIds = (retentionRaw ?? []).map(p => (p as Record<string, unknown>).id as string);
  const { data: jobsData } = postIds.length > 0 ? await supabase
    .from('transcription_jobs')
    .select('post_id, duration_seconds')
    .in('post_id', postIds)
    : { data: [] };

  const durationMap = new Map((jobsData ?? []).map((j: Record<string, unknown>) => [
    j.post_id as string,
    j.duration_seconds as number | null,
  ]));

  // 3. previous period posts (only KPI columns needed)
  const { data: prevRaw } = await supabase
    .from('posts_with_latest_metrics')
    .select('er_by_reach, saves_per_reach, sends_per_reach, reach')
    .eq('account_id', params.accountId)
    .gte('published_at', params.prevFrom)
    .lte('published_at', params.prevTo + 'T23:59:59')
    .limit(500);

  // 4. follower history for the period
  const { data: followerHistoryRaw } = await supabase
    .from('account_metrics_snapshots')
    .select('followers, captured_at')
    .eq('account_id', params.accountId)
    .gte('captured_at', params.from)
    .lte('captured_at', params.to + 'T23:59:59')
    .order('captured_at', { ascending: true });

  // 5. follower at period start (latest snapshot before period)
  const { data: followerStartRow } = await supabase
    .from('account_metrics_snapshots')
    .select('followers')
    .eq('account_id', params.accountId)
    .lt('captured_at', params.from)
    .order('captured_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // 6. follower at period end (latest snapshot on or before to)
  const { data: followerEndRow } = await supabase
    .from('account_metrics_snapshots')
    .select('followers')
    .eq('account_id', params.accountId)
    .lte('captured_at', params.to + 'T23:59:59')
    .order('captured_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const posts = (currentRaw ?? []).map(toPostWithMetrics);
  const prevRows = prevRaw ?? [];

  const current: PeriodMetrics = {
    postCount: posts.length,
    avgErByReach: safeAvg(posts.map(p => p.erByReach)),
    avgSavesPerReach: safeAvg(posts.map(p => p.savesPerReach)),
    avgSendsPerReach: safeAvg(posts.map(p => p.sendsPerReach)),
    avgReach: safeAvg(posts.map(p => p.reach)),
    totalReach: posts.reduce((s, p) => s + (p.reach ?? 0), 0) || null,
    followerStart: followerStartRow?.followers ?? null,
    followerEnd: followerEndRow?.followers ?? null,
    sampleSizeWarning: posts.length < 5,
  };

  const previous: PeriodMetrics = {
    postCount: prevRows.length,
    avgErByReach: safeAvg(prevRows.map((p: { er_by_reach: number | null }) => p.er_by_reach)),
    avgSavesPerReach: safeAvg(prevRows.map((p: { saves_per_reach: number | null }) => p.saves_per_reach)),
    avgSendsPerReach: safeAvg(prevRows.map((p: { sends_per_reach: number | null }) => p.sends_per_reach)),
    avgReach: safeAvg(prevRows.map((p: { reach: number | null }) => p.reach)),
    totalReach: prevRows.reduce((s: number, p: { reach: number | null }) => s + (p.reach ?? 0), 0) || null,
    followerStart: null,
    followerEnd: null,
    sampleSizeWarning: prevRows.length < 5,
  };

  // Top posts
  const topPostsBySaveRate = [...posts]
    .filter(p => p.savesPerReach != null)
    .sort((a, b) => (b.savesPerReach ?? 0) - (a.savesPerReach ?? 0))
    .slice(0, 5)
    .map(toPostSummary);

  const topPostsBySendRate = [...posts]
    .filter(p => p.sendsPerReach != null)
    .sort((a, b) => (b.sendsPerReach ?? 0) - (a.sendsPerReach ?? 0))
    .slice(0, 5)
    .map(toPostSummary);

  // Theme breakdown
  const themeMap = new Map<string, { postCount: number; ers: number[]; saves: number[]; sends: number[] }>();
  for (const p of posts) {
    const t = p.theme ?? 'other';
    if (!themeMap.has(t)) themeMap.set(t, { postCount: 0, ers: [], saves: [], sends: [] });
    const entry = themeMap.get(t)!;
    entry.postCount++;
    if (p.erByReach != null) entry.ers.push(p.erByReach);
    if (p.savesPerReach != null) entry.saves.push(p.savesPerReach);
    if (p.sendsPerReach != null) entry.sends.push(p.sendsPerReach);
  }
  const themeBreakdown: ThemeStats[] = Array.from(themeMap.entries())
    .sort((a, b) => b[1].postCount - a[1].postCount)
    .map(([theme, data]) => ({
      theme,
      postCount: data.postCount,
      avgEr: safeAvg(data.ers),
      avgSaves: safeAvg(data.saves),
      avgSends: safeAvg(data.sends),
    }));

  // Video retention summary
  const retentionAnalyses = (retentionRaw ?? [])
    .map(p => {
      const pRec = p as Record<string, unknown>;
      const postId = pRec.id as string;
      const duration = durationMap.get(postId);
      return analyzeRetention({
        avgWatchTimeMs: pRec.avg_watch_time_seconds != null ? (pRec.avg_watch_time_seconds as number) * 1000 : null,
        totalWatchTimeMs: pRec.watch_time_seconds != null ? (pRec.watch_time_seconds as number) * 1000 : null,
        plays: (pRec.video_views as number | null) ?? (pRec.reach as number | null) ?? null,
        segments: (pRec.transcript_segments as TranscriptionSegment[] | null) ?? null,
        transcript: (pRec.transcript as string | null) ?? null,
        estimatedDurationSeconds: duration ?? null,
      });
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  const videoRetentionSummary = retentionAnalyses.length > 0 ? {
    reelsWithData: retentionAnalyses.length,
    avgCompletionRate: Math.round(
      retentionAnalyses.reduce((s, r) => s + r.completionRate, 0) / retentionAnalyses.length
    ),
    reelsWithWeakHook: retentionAnalyses.filter(r => r.hookStrength === 'weak').length,
    reelsWithCriticalDrop: retentionAnalyses.filter(r =>
      r.retentionHealth === 'critical' || r.retentionHealth === 'poor'
    ).length,
  } : null;

  return {
    account: {
      id: accountRow?.id ?? params.accountId,
      displayName: accountRow?.display_name ?? 'Unknown',
      handle: accountRow?.handle ?? null,
      platform: accountRow?.provider_id ?? 'unknown',
      lastSyncAt: accountRow?.last_sync_at ?? null,
      status: accountRow?.status ?? 'unknown',
    },
    current,
    previous,
    followerHistory: (followerHistoryRaw ?? []).map(s => ({
      date: s.captured_at.slice(0, 10),
      followers: s.followers ?? 0,
    })),
    topPostsBySaveRate,
    topPostsBySendRate,
    themeBreakdown,
    diagnostics: computeDiagnosticFlags(posts, current),
    videoRetentionSummary,
  };
}

// ─── Exported: fetchPerformanceData ──────────────────────────────────────────

export async function fetchPerformanceData(params: DashboardParams): Promise<PerformanceData> {
  const supabase = createSupabaseServiceClient();

  const [{ data: postsRaw }, { data: followerSnaps }] = await Promise.all([
    supabase
      .from('posts_with_latest_metrics')
      .select('published_at, media_type, er_by_reach, saves_per_reach, sends_per_reach, reach')
      .eq('account_id', params.accountId)
      .gte('published_at', params.from)
      .lte('published_at', params.to + 'T23:59:59')
      .order('published_at', { ascending: true }),
    supabase
      .from('account_metrics_snapshots')
      .select('followers, captured_at')
      .eq('account_id', params.accountId)
      .gte('captured_at', params.from)
      .lte('captured_at', params.to + 'T23:59:59')
      .order('captured_at', { ascending: true }),
  ]);

  const posts = postsRaw ?? [];

  // ER timeline (daily)
  const erDayMap = new Map<string, { ers: number[]; count: number }>();
  const reachDayMap = new Map<string, number>();
  for (const p of posts) {
    const day = p.published_at.slice(0, 10);
    if (!erDayMap.has(day)) erDayMap.set(day, { ers: [], count: 0 });
    erDayMap.get(day)!.count++;
    if (p.er_by_reach != null && p.er_by_reach > 0) erDayMap.get(day)!.ers.push(p.er_by_reach);
    reachDayMap.set(day, (reachDayMap.get(day) ?? 0) + (p.reach ?? 0));
  }

  const erTimeline = Array.from(erDayMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, { ers, count }]) => ({
      date,
      er: safeAvg(ers),
      posts: count,
    }));

  const reachTimeline = Array.from(reachDayMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, reach]) => ({ date, reach }));

  // Follower timeline
  const followerTimeline = (followerSnaps ?? []).map(s => ({
    date: s.captured_at.slice(0, 10),
    followers: s.followers ?? 0,
  }));

  // KPI by day of week
  const DOW = ['Duminică', 'Luni', 'Marți', 'Miercuri', 'Joi', 'Vineri', 'Sâmbătă'];
  const dowMap = new Map<string, { ers: number[]; saves: number[]; sends: number[]; count: number }>();
  for (const d of DOW) dowMap.set(d, { ers: [], saves: [], sends: [], count: 0 });
  for (const p of posts) {
    const dow = DOW[new Date(p.published_at).getDay()];
    const entry = dowMap.get(dow)!;
    entry.count++;
    if (p.er_by_reach != null && p.er_by_reach > 0) entry.ers.push(p.er_by_reach);
    if (p.saves_per_reach != null && p.saves_per_reach > 0) entry.saves.push(p.saves_per_reach);
    if (p.sends_per_reach != null && p.sends_per_reach > 0) entry.sends.push(p.sends_per_reach);
  }
  const kpiByDayOfWeek = DOW.map(day => ({
    day,
    postCount: dowMap.get(day)!.count,
    avgEr: safeAvg(dowMap.get(day)!.ers),
    avgSaves: safeAvg(dowMap.get(day)!.saves),
    avgSends: safeAvg(dowMap.get(day)!.sends),
  }));

  // KPI by hour
  const hourMap = new Map<number, { ers: number[]; count: number }>();
  for (const p of posts) {
    const h = new Date(p.published_at).getHours();
    if (!hourMap.has(h)) hourMap.set(h, { ers: [], count: 0 });
    hourMap.get(h)!.count++;
    if (p.er_by_reach != null && p.er_by_reach > 0) hourMap.get(h)!.ers.push(p.er_by_reach);
  }
  const kpiByHour = Array.from(hourMap.entries())
    .filter(([, v]) => v.count > 0)
    .sort(([a], [b]) => a - b)
    .map(([hour, { ers, count }]) => ({
      hour,
      postCount: count,
      avgEr: safeAvg(ers),
    }));

  // KPI by media type
  const mediaMap = new Map<string, { ers: number[]; saves: number[]; sends: number[]; reaches: number[]; count: number }>();
  for (const p of posts) {
    const mt = p.media_type;
    if (!mediaMap.has(mt)) mediaMap.set(mt, { ers: [], saves: [], sends: [], reaches: [], count: 0 });
    const entry = mediaMap.get(mt)!;
    entry.count++;
    if (p.er_by_reach != null && p.er_by_reach > 0) entry.ers.push(p.er_by_reach);
    if (p.saves_per_reach != null && p.saves_per_reach > 0) entry.saves.push(p.saves_per_reach);
    if (p.sends_per_reach != null && p.sends_per_reach > 0) entry.sends.push(p.sends_per_reach);
    if (p.reach != null && p.reach > 0) entry.reaches.push(p.reach);
  }
  const kpiByMediaType = Array.from(mediaMap.entries()).map(([mediaType, data]) => ({
    mediaType,
    postCount: data.count,
    avgEr: safeAvg(data.ers),
    avgSaves: safeAvg(data.saves),
    avgSends: safeAvg(data.sends),
    avgReach: safeAvg(data.reaches),
  }));

  return { erTimeline, reachTimeline, followerTimeline, kpiByDayOfWeek, kpiByHour, kpiByMediaType };
}

// ─── Exported: fetchContentData ──────────────────────────────────────────────

export async function fetchContentData(params: DashboardParams): Promise<ContentData> {
  const supabase = createSupabaseServiceClient();

  const { data: raw } = await supabase
    .from('posts_with_latest_metrics')
    .select('id, account_id, external_post_id, published_at, media_type, caption, hashtags, theme, theme_secondary, er_by_reach, saves_per_reach, sends_per_reach, reach, save_to_like_ratio')
    .eq('account_id', params.accountId)
    .gte('published_at', params.from)
    .lte('published_at', params.to + 'T23:59:59')
    .order('er_by_reach', { ascending: false, nullsFirst: false })
    .limit(500);

  const posts = (raw ?? []).map(toPostWithMetrics);

  // Hook type stats
  const hookMap = new Map<string, { ers: number[]; saves: number[]; sends: number[]; count: number }>();
  for (const p of posts) {
    const ht = p.hookType;
    if (!hookMap.has(ht)) hookMap.set(ht, { ers: [], saves: [], sends: [], count: 0 });
    const entry = hookMap.get(ht)!;
    entry.count++;
    if (p.erByReach != null) entry.ers.push(p.erByReach);
    if (p.savesPerReach != null) entry.saves.push(p.savesPerReach);
    if (p.sendsPerReach != null) entry.sends.push(p.sendsPerReach);
  }
  const hookTypeStats = Array.from(hookMap.entries())
    .map(([hookType, data]) => ({
      hookType,
      postCount: data.count,
      avgEr: safeAvg(data.ers),
      avgSaves: safeAvg(data.saves),
      avgSends: safeAvg(data.sends),
    }))
    .sort((a, b) => (b.avgEr ?? 0) - (a.avgEr ?? 0));

  // Caption length stats
  const capMap = new Map<string, { ers: number[]; saves: number[]; count: number }>();
  for (const p of posts) {
    const cl = p.captionLength;
    if (!capMap.has(cl)) capMap.set(cl, { ers: [], saves: [], count: 0 });
    const entry = capMap.get(cl)!;
    entry.count++;
    if (p.erByReach != null) entry.ers.push(p.erByReach);
    if (p.savesPerReach != null) entry.saves.push(p.savesPerReach);
  }
  const captionLengthStats: ContentData['captionLengthStats'] = (['short', 'medium', 'long'] as const).map(length => ({
    length,
    postCount: capMap.get(length)?.count ?? 0,
    avgEr: safeAvg(capMap.get(length)?.ers ?? []),
    avgSaves: safeAvg(capMap.get(length)?.saves ?? []),
  }));

  // Hashtag bucket stats
  const hashMap = new Map<string, { ers: number[]; reaches: number[]; count: number }>();
  for (const p of posts) {
    const bucket = hashtagBucket(p.hashtagCount);
    if (!hashMap.has(bucket)) hashMap.set(bucket, { ers: [], reaches: [], count: 0 });
    const entry = hashMap.get(bucket)!;
    entry.count++;
    if (p.erByReach != null) entry.ers.push(p.erByReach);
    if (p.reach != null && p.reach > 0) entry.reaches.push(p.reach);
  }
  const hashtagCountStats: ContentData['hashtagCountStats'] = (['0', '1-3', '4-6', '7-15', '15+'] as const).map(bucket => ({
    bucket,
    postCount: hashMap.get(bucket)?.count ?? 0,
    avgEr: safeAvg(hashMap.get(bucket)?.ers ?? []),
    avgReach: safeAvg(hashMap.get(bucket)?.reaches ?? []),
  }));

  // Theme performance matrix
  const themeMap2 = new Map<string, { posts: typeof posts }>();
  for (const p of posts) {
    const t = p.theme ?? 'other';
    if (!themeMap2.has(t)) themeMap2.set(t, { posts: [] });
    themeMap2.get(t)!.posts.push(p);
  }
  const themePerformanceMatrix = Array.from(themeMap2.entries())
    .map(([theme, { posts: tp }]) => {
      const sortedByEr = [...tp]
        .filter(p => p.erByReach != null)
        .sort((a, b) => (b.erByReach ?? 0) - (a.erByReach ?? 0));
      return {
        theme,
        postCount: tp.length,
        avgEr: safeAvg(tp.map(p => p.erByReach)),
        avgSaves: safeAvg(tp.map(p => p.savesPerReach)),
        avgSends: safeAvg(tp.map(p => p.sendsPerReach)),
        avgSaveToLike: safeAvg(tp.map(p => p.saveToLikeRatio)),
        bestPost: sortedByEr[0] ? toPostSummary(sortedByEr[0]) : null,
      };
    })
    .sort((a, b) => (b.avgEr ?? 0) - (a.avgEr ?? 0));

  // Top 10 by ER (already sorted desc by er_by_reach from DB query)
  const topPosts = posts.filter(p => p.erByReach != null).slice(0, 10).map(toPostSummary);

  // Bottom 5 by ER (reach > 50)
  const bottomPosts = [...posts]
    .filter(p => p.erByReach != null && (p.reach ?? 0) > 50)
    .sort((a, b) => (a.erByReach ?? 0) - (b.erByReach ?? 0))
    .slice(0, 5)
    .map(toPostSummary);

  return { hookTypeStats, captionLengthStats, hashtagCountStats, themePerformanceMatrix, topPosts, bottomPosts };
}

// ─── Exported: fetchAiInsightsData ───────────────────────────────────────────

export async function fetchAiInsightsData(params: DashboardParams): Promise<AiInsightsData> {
  const supabase = createSupabaseServiceClient();

  const { data: raw } = await supabase
    .from('ai_analyses')
    .select('id, analysis_type, status, created_at, structured_output, duration_ms')
    .eq('account_id', params.accountId)
    .order('created_at', { ascending: false })
    .limit(20);

  const toSummary = (row: NonNullable<typeof raw>[number]): AnalysisSummary => {
    const out = row.structured_output as Record<string, unknown> | null;
    return {
      id: row.id,
      analysisType: row.analysis_type,
      status: (row.status as string) ?? 'completed',
      createdAt: row.created_at,
      headline: (out?.headline as string) ?? null,
      recommendations: Array.isArray(out?.recommendations)
        ? (out.recommendations as Array<{ action: string; priority: string }>)
        : null,
      keyFindings: Array.isArray(out?.key_findings)
        ? (out.key_findings as Array<{ title: string; tone: string }>)
        : null,
      durationMs: row.duration_ms ?? null,
    };
  };

  const analyses = (raw ?? []).map(toSummary);

  return {
    latestWeeklySummary: analyses.find(a => a.analysisType === 'weekly_summary' && a.status === 'completed') ?? null,
    latestContentPatterns: analyses.find(a => a.analysisType === 'content_patterns' && a.status === 'completed') ?? null,
    latestContentIdeation: analyses.find(a => a.analysisType === 'content_ideation' && a.status === 'completed') ?? null,
    recentAnalyses: analyses.slice(0, 10),
  };
}

