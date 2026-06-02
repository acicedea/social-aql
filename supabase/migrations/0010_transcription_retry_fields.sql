ALTER TABLE public.transcription_jobs
  ADD COLUMN IF NOT EXISTS retry_after timestamptz,
  ADD COLUMN IF NOT EXISTS last_error_code text;

CREATE INDEX IF NOT EXISTS transcription_jobs_worker_idx
  ON public.transcription_jobs(status, retry_after, created_at)
  WHERE status IN ('pending', 'failed');
