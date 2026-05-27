import { createSupabaseServerClient } from '@/lib/supabase/server';
import { decryptJson, encryptJson } from '@/lib/crypto';
import { getProviderClient } from '@/providers/registry';
import type { ProviderToken } from '@/lib/normalized-types';
import { calculatePostKpis } from '@/lib/kpis/calculate-post-kpis';
import { detectTheme } from '@/lib/themes/detect-theme';

export async function syncAccount(
  accountId: string,
  userId: string
): Promise<{ postsInserted: number; snapshotsInserted: number }> {
  const supabase = await createSupabaseServerClient();

  // 1. Load account
  const { data: account, error: accountError } = await supabase
    .from('accounts')
    .select('*')
    .eq('id', accountId)
    .eq('user_id', userId)
    .single();

  if (accountError || !account) throw new Error('Account not found');

  // 2. Decrypt tokens
  const token = decryptJson<ProviderToken>(account.encrypted_tokens);

  // 3. Look up provider
  const provider = getProviderClient(account.provider_id);
  if (!provider) throw new Error(`Provider not found: ${account.provider_id}`);

  // 4. Refresh if expired
  let activeToken = token;
  if (provider.isTokenExpired(token)) {
    activeToken = await provider.refreshToken(token);
    await supabase
      .from('accounts')
      .update({ encrypted_tokens: encryptJson(activeToken) })
      .eq('id', accountId);
  }

  // 5. Log sync job start
  const { data: job } = await supabase
    .from('sync_jobs')
    .insert({
      account_id: accountId,
      job_type: 'full_sync',
      status: 'running',
      started_at: new Date().toISOString(),
    })
    .select()
    .single();

  const now = new Date().toISOString();
  const rangeFrom = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const range = { from: rangeFrom, to: now };

  let postsInserted = 0;
  let snapshotsInserted = 0;

  try {
    // 6. Account metrics
    const accountMetrics = await provider.fetchAccountMetrics(
      activeToken,
      account.external_account_id,
      range
    );
    await supabase.from('account_metrics_snapshots').insert({
      account_id: accountId,
      captured_at: accountMetrics.capturedAt,
      followers: accountMetrics.followers,
      reach: accountMetrics.reach,
      impressions: accountMetrics.impressions,
      profile_views: accountMetrics.profileViews,
      website_clicks: accountMetrics.websiteClicks,
      raw: accountMetrics.raw ?? null,
    });
    snapshotsInserted++;

    const currentFollowers = accountMetrics.followers;

    // 7. List posts
    const posts = await provider.listPosts(activeToken, account.external_account_id, range);

    for (const post of posts) {
      // 8. Detect theme
      const themeResult = await detectTheme({
        caption: post.caption,
        hashtags: post.hashtags,
      });

      // 9. Upsert post
      const { data: upsertedPost } = await supabase
        .from('posts')
        .upsert(
          {
            account_id: accountId,
            external_post_id: post.externalId,
            published_at: post.publishedAt,
            media_type: post.mediaType,
            caption: post.caption,
            media_url: post.mediaUrl,
            thumbnail_url: post.thumbnailUrl,
            permalink: post.permalink,
            hashtags: post.hashtags,
            mentions: post.mentions,
            raw: post.raw ?? null,
            theme: themeResult.theme,
            theme_secondary: themeResult.themeSecondary,
            theme_confidence: themeResult.confidence,
            followers_at_publish: currentFollowers,
          },
          { onConflict: 'account_id,external_post_id' }
        )
        .select()
        .single();

      postsInserted++;

      if (upsertedPost) {
        const postMetrics = await provider.fetchPostMetrics(activeToken, post.externalId);

        const kpis = calculatePostKpis({
          impressions: postMetrics.impressions,
          reach: postMetrics.reach,
          likes: postMetrics.likes,
          comments: postMetrics.comments,
          shares: postMetrics.shares,
          saves: postMetrics.saves,
          videoViews: postMetrics.videoViews,
          watchTimeSeconds: postMetrics.watchTimeSeconds,
          mediaType: post.mediaType,
          followersAtPublish: currentFollowers,
        });

        await supabase.from('post_metrics_snapshots').insert({
          post_id: upsertedPost.id,
          captured_at: postMetrics.capturedAt,
          impressions: postMetrics.impressions,
          reach: postMetrics.reach,
          likes: postMetrics.likes,
          comments: postMetrics.comments,
          shares: postMetrics.shares,
          saves: postMetrics.saves,
          video_views: postMetrics.videoViews,
          watch_time_seconds: postMetrics.watchTimeSeconds,
          engagement_rate: postMetrics.engagementRate,
          raw: postMetrics.raw ?? null,
          er_by_reach: kpis.erByReach,
          saves_per_reach: kpis.savesPerReach,
          sends_per_reach: kpis.sendsPerReach,
          likes_per_reach: kpis.likesPerReach,
          save_to_like_ratio: kpis.saveToLikeRatio,
          reach_rate: kpis.reachRate,
          completion_rate: kpis.completionRate,
          avg_watch_time_seconds: kpis.avgWatchTimeSeconds,
        });
        snapshotsInserted++;
      }
    }

    // 10. Update last_sync_at
    await supabase
      .from('accounts')
      .update({ last_sync_at: now, last_sync_error: null })
      .eq('id', accountId);

    // 11. Mark job success
    if (job) {
      await supabase
        .from('sync_jobs')
        .update({
          status: 'success',
          finished_at: new Date().toISOString(),
          items_processed: postsInserted,
        })
        .eq('id', job.id);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await supabase
      .from('accounts')
      .update({ last_sync_error: message })
      .eq('id', accountId);
    if (job) {
      await supabase
        .from('sync_jobs')
        .update({
          status: 'error',
          finished_at: new Date().toISOString(),
          error_message: message,
        })
        .eq('id', job.id);
    }
    throw err;
  }

  return { postsInserted, snapshotsInserted };
}
