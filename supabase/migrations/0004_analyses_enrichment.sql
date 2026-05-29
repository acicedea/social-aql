-- =====================================================================
-- 0004: Enrich ai_analyses for structured output + add run tracking
-- =====================================================================

-- The ai_analyses table exists from 0001. Enrich it.
alter table public.ai_analyses
  add column if not exists status text not null default 'completed'
    check (status in ('pending', 'running', 'completed', 'failed')),
  add column if not exists structured_output jsonb,
  add column if not exists error_message text,
  add column if not exists trigger_source text not null default 'manual'
    check (trigger_source in ('manual', 'cron')),
  add column if not exists tokens_used integer,
  add column if not exists duration_ms integer;

create index if not exists ai_analyses_user_type_created_idx
  on public.ai_analyses(user_id, analysis_type, created_at desc);

create index if not exists ai_analyses_account_idx
  on public.ai_analyses(account_id) where account_id is not null;
