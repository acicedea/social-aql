import 'server-only';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { decryptJson, encryptJson } from '@/lib/crypto';
import { getProviderClient } from '@/providers/registry';
import type { ProviderToken } from '@/lib/normalized-types';
import { transcribeVideo } from './gemini-transcribe';
import { fetchFreshMediaUrl } from './meta-media-refresh';

const BATCH_SIZE = 3;

export interface WorkerResult {
  processed: number;
  completed: number;
  failed: number;
  skipped: number;
  errors: string[];
}

export async function runTranscriptionWorker(): Promise<WorkerResult> {
  const supabase = createSupabaseServiceClient();

  const result: WorkerResult = {
    processed: 0,
    completed: 0,
    failed: 0,
    skipped: 0,
    errors: [],
  };

  const { data: jobs, error: fetchError } = await supabase
    .from('transcription_jobs')
    .select('id, post_id, account_id, status, attempts, max_attempts, video_url, media_type')
    .eq('status', 'pending')
    .lt('attempts', 3)
    .order('created_at', { ascending: true })
    .limit(BATCH_SIZE);

  if (fetchError || !jobs || jobs.length === 0) {
    console.log('[transcription worker] no pending jobs');
    return result;
  }

  console.log(`[transcription worker] processing ${jobs.length} jobs`);

  // Pre-refresh all account tokens in case they expired since sync
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

  for (const job of jobs) {
    result.processed++;

    await supabase
      .from('transcription_jobs')
      .update({
        status: 'processing',
        started_at: new Date().toISOString(),
        attempts: job.attempts + 1,
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
          .update({ status: 'skipped', completed_at: new Date().toISOString() })
          .eq('id', job.id);
        result.skipped++;
        continue;
      }

      let videoUrl = job.video_url || post?.media_url;
      if (!videoUrl) {
        throw new Error('No video URL available — URL may have expired');
      }

      let transcription: Awaited<ReturnType<typeof transcribeVideo>> | null = null;
      let lastError: Error | null = null;

      try {
        transcription = await transcribeVideo(videoUrl);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const is403 = message.includes('HTTP 403');

        if (is403 && post?.external_post_id) {
          // Try to refresh URL from Meta API
          console.log(`[transcription worker] HTTP 403 on ${job.id}, attempting URL refresh from Meta API`);
          const freshUrl = await fetchFreshMediaUrl(job.account_id, post.external_post_id);

          if (freshUrl && freshUrl !== videoUrl) {
            console.log(`[transcription worker] got fresh URL, retrying transcription for ${job.id}`);
            // Update job with fresh URL
            await supabase
              .from('transcription_jobs')
              .update({ video_url: freshUrl })
              .eq('id', job.id);

            // Retry with fresh URL
            try {
              transcription = await transcribeVideo(freshUrl);
              videoUrl = freshUrl; // Update for later use
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
          transcript_at: new Date().toISOString(),
        })
        .eq('id', job.post_id);

      await supabase
        .from('transcription_jobs')
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .eq('id', job.id);

      result.completed++;
      console.log(`[transcription worker] completed job ${job.id}`);

    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const is403 = message.includes('HTTP 403');
      const finalMessage = is403
        ? `${message} — video URL expired. re-sync account to refresh URLs`
        : message;
      console.error(`[transcription worker] failed job ${job.id}:`, finalMessage);

      result.failed++;
      result.errors.push(`${job.id}: ${message}`);

      const newAttempts = job.attempts + 1;
      const isFinal = newAttempts >= job.max_attempts;

      await supabase
        .from('transcription_jobs')
        .update({
          status: isFinal ? 'failed' : 'pending',
          error_message: message,
          completed_at: isFinal ? new Date().toISOString() : null,
        })
        .eq('id', job.id);
    }
  }

  console.log(`[transcription worker] done: ${JSON.stringify(result)}`);
  return result;
}
