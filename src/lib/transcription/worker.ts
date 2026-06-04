import 'server-only';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { decryptJson, encryptJson } from '@/lib/crypto';
import { getProviderClient } from '@/providers/registry';
import type { ProviderToken } from '@/lib/normalized-types';
import { transcribeVideo } from './gemini-transcribe';
import { fetchFreshMediaUrl } from './meta-media-refresh';

// ── Config ────────────────────────────────────────────────────────────

const DAILY_BUDGET = 20;
// Conservative vs 250 RPD limit: other features share same API key,
// videos may need 2-3 retries, and we want headroom for interactive features.

const BATCH_SIZE = 30;

const RETRY_DELAY_MINUTES = 60;
// Gemini resets per-minute quota fast, but 60min is safe to avoid thrashing.

const MAX_ATTEMPTS = 5;
// 5 attempts = up to 5 days of retries at 60min spacing.

// ── Types ─────────────────────────────────────────────────────────────

export interface WorkerResult {
  processed: number;
  completed: number;
  skipped: number;
  rateLimited: number;
  failed: number;
  budgetUsed: number;
  budgetRemaining: number;
  errors: string[];
}

// ── Helpers ───────────────────────────────────────────────────────────

async function getDailyTranscriptionsCount(supabase: ReturnType<typeof createSupabaseServiceClient>): Promise<number> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const { count } = await supabase
    .from('transcription_jobs')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'completed')
    .gte('completed_at', todayStart.toISOString());

  return count ?? 0;
}

function isRateLimitError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('429') ||
    message.toLowerCase().includes('rate limit') ||
    message.toLowerCase().includes('quota exceeded') ||
    message.toLowerCase().includes('resource_exhausted');
}

// ── Main worker ───────────────────────────────────────────────────────

export async function runTranscriptionWorker(): Promise<WorkerResult> {
  const supabase = createSupabaseServiceClient();
  const now = new Date();

  const result: WorkerResult = {
    processed: 0,
    completed: 0,
    skipped: 0,
    rateLimited: 0,
    failed: 0,
    budgetUsed: 0,
    budgetRemaining: 0,
    errors: [],
  };

  // 1. Check daily budget
  const todayCount = await getDailyTranscriptionsCount(supabase);
  const budgetRemaining = Math.max(0, DAILY_BUDGET - todayCount);
  result.budgetUsed = todayCount;
  result.budgetRemaining = budgetRemaining;

  if (budgetRemaining === 0) {
    console.log(`[transcription worker] daily budget exhausted (${todayCount}/${DAILY_BUDGET}). Skipping.`);
    return result;
  }

  const toProcess = Math.min(BATCH_SIZE, budgetRemaining);
  console.log(`[transcription worker] budget ${todayCount}/${DAILY_BUDGET}, processing up to ${toProcess} jobs`);

  // 2. Fetch eligible jobs (pending or retryable failed, with retry_after expired)
  const { data: jobs, error: fetchError } = await supabase
    .from('transcription_jobs')
    .select('id, post_id, account_id, status, attempts, video_url, media_type')
    .filter('status', 'in', '("pending","failed")')
    .lt('attempts', MAX_ATTEMPTS)
    .or(`retry_after.is.null,retry_after.lte.${now.toISOString()}`)
    .order('created_at', { ascending: true })
    .limit(toProcess);

  if (fetchError || !jobs || jobs.length === 0) {
    console.log('[transcription worker] no eligible jobs');
    return result;
  }

  console.log(`[transcription worker] found ${jobs.length} eligible jobs`);

  // 3. Pre-refresh account tokens
  const uniqueAccountIds = [...new Set(jobs.map(j => j.account_id))];
  for (const accountId of uniqueAccountIds) {
    try {
      const { data: account } = await supabase
        .from('accounts')
        .select('encrypted_tokens, provider_id')
        .eq('id', accountId)
        .single();

      if (!account) continue;

      const token = decryptJson<ProviderToken>(account.encrypted_tokens);
      const provider = getProviderClient(account.provider_id);

      if (provider && provider.isTokenExpired(token)) {
        console.log(`[transcription worker] token expired for account ${accountId}, refreshing`);
        const refreshed = await provider.refreshToken(token);
        await supabase
          .from('accounts')
          .update({ encrypted_tokens: encryptJson(refreshed) })
          .eq('id', accountId);
        console.log(`[transcription worker] token refreshed for account ${accountId}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[transcription worker] failed to refresh token for account ${accountId}:`, msg);
    }
  }

  // 4. Process each job
  for (const job of jobs) {
    result.processed++;

    await supabase
      .from('transcription_jobs')
      .update({
        status: 'processing',
        started_at: now.toISOString(),
        attempts: job.attempts + 1,
        retry_after: null,
        last_error_code: null,
      })
      .eq('id', job.id);

    try {
      const { data: post } = await supabase
        .from('posts')
        .select('media_url, media_type, transcript, external_post_id')
        .eq('id', job.post_id)
        .single();

      if (post?.transcript) {
        await supabase
          .from('transcription_jobs')
          .update({ status: 'skipped', completed_at: now.toISOString() })
          .eq('id', job.id);
        result.skipped++;
        continue;
      }

      let videoUrl = job.video_url || post?.media_url;
      if (!videoUrl) {
        throw new Error('No video URL — expired');
      }

      let transcription: Awaited<ReturnType<typeof transcribeVideo>> | null = null;
      let lastError: Error | null = null;

      try {
        transcription = await transcribeVideo(videoUrl);
      } catch (err) {
        // Re-throw rate limit errors immediately — don't try URL refresh
        if (isRateLimitError(err)) throw err;

        const message = err instanceof Error ? err.message : String(err);
        const is403 = message.includes('HTTP 403');

        if (is403 && post?.external_post_id) {
          console.log(`[transcription worker] HTTP 403 on ${job.id}, attempting URL refresh from Meta API`);
          const freshUrl = await fetchFreshMediaUrl(job.account_id, post.external_post_id);

          if (freshUrl && freshUrl !== videoUrl) {
            console.log(`[transcription worker] got fresh URL, retrying transcription for ${job.id}`);
            await supabase
              .from('transcription_jobs')
              .update({ video_url: freshUrl })
              .eq('id', job.id);
            try {
              transcription = await transcribeVideo(freshUrl);
            } catch (retryErr) {
              lastError = retryErr instanceof Error ? retryErr : new Error(String(retryErr));
            }
          } else {
            lastError = err instanceof Error ? err : new Error(message);
          }
        } else {
          lastError = err instanceof Error ? err : new Error(message);
        }
      }

      if (!transcription) {
        throw lastError || new Error('Transcription failed');
      }

      await supabase
        .from('posts')
        .update({
          transcript: transcription.transcript,
          transcript_segments: transcription.segments,
          visual_description: transcription.visualDescription,
          transcript_language: transcription.language,
          transcript_model: transcription.model,
          transcript_at: now.toISOString(),
        })
        .eq('id', job.post_id);

      await supabase
        .from('transcription_jobs')
        .update({
          status: 'completed',
          completed_at: now.toISOString(),
          last_error_code: null,
        })
        .eq('id', job.id);

      result.completed++;
      console.log(`[transcription worker] ✓ completed job ${job.id}`);

    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      result.errors.push(`${job.id}: ${message.slice(0, 100)}`);

      if (isRateLimitError(err)) {
        result.rateLimited++;

        const retryAfter = new Date(now.getTime() + RETRY_DELAY_MINUTES * 60 * 1000);
        await supabase
          .from('transcription_jobs')
          .update({
            status: 'pending',
            // Roll back the attempt increment — rate limits aren't the job's fault
            attempts: job.attempts,
            last_error_code: '429',
            retry_after: retryAfter.toISOString(),
            error_message: `Rate limited at ${now.toISOString()}. Retry after ${retryAfter.toISOString()}`,
          })
          .eq('id', job.id);

        console.log(`[transcription worker] ⏳ rate limited job ${job.id}, retry after ${retryAfter.toISOString()}`);
        // Stop processing — no point hitting more jobs while throttled
        break;

      } else {
        result.failed++;
        const newAttempts = job.attempts + 1;
        const isFinal = newAttempts >= MAX_ATTEMPTS;

        await supabase
          .from('transcription_jobs')
          .update({
            status: isFinal ? 'failed' : 'pending',
            last_error_code: message.includes('expired') ? 'URL_EXPIRED' : 'ERROR',
            error_message: message,
            retry_after: isFinal ? null : new Date(now.getTime() + 5 * 60 * 1000).toISOString(),
            completed_at: isFinal ? now.toISOString() : null,
          })
          .eq('id', job.id);

        console.error(`[transcription worker] ✗ failed job ${job.id} (attempt ${newAttempts}/${MAX_ATTEMPTS}):`, message.slice(0, 100));
      }
    }
  }

  const summary = `budget=${result.budgetUsed + result.completed}/${DAILY_BUDGET}, ` +
    `completed=${result.completed}, skipped=${result.skipped}, ` +
    `rateLimited=${result.rateLimited}, failed=${result.failed}`;
  console.log(`[transcription worker] done: ${summary}`);

  return result;
}
