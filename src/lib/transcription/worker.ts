import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { transcribeVideo } from './gemini-transcribe';

const BATCH_SIZE = 3;

export interface WorkerResult {
  processed: number;
  completed: number;
  failed: number;
  skipped: number;
  errors: string[];
}

export async function runTranscriptionWorker(): Promise<WorkerResult> {
  const supabase = await createSupabaseServerClient();

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
    .or('status.eq.pending,and(status.eq.failed,attempts.lt.max_attempts)')
    .order('created_at', { ascending: true })
    .limit(BATCH_SIZE);

  if (fetchError || !jobs || jobs.length === 0) {
    console.log('[transcription worker] no pending jobs');
    return result;
  }

  console.log(`[transcription worker] processing ${jobs.length} jobs`);

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
        .select('media_url, media_type, transcript')
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

      const videoUrl = job.video_url || post?.media_url;
      if (!videoUrl) {
        throw new Error('No video URL available — URL may have expired');
      }

      const transcription = await transcribeVideo(videoUrl);

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
      console.error(`[transcription worker] failed job ${job.id}:`, message);

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
