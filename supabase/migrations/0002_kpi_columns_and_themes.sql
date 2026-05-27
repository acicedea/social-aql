-- =====================================================================
-- 0002: KPI columns and theme classification
-- =====================================================================

-- Add computed KPI columns to post_metrics_snapshots
alter table public.post_metrics_snapshots
  add column if not exists er_by_reach numeric(7,4),
  add column if not exists saves_per_reach numeric(7,4),
  add column if not exists sends_per_reach numeric(7,4),
  add column if not exists likes_per_reach numeric(7,4),
  add column if not exists save_to_like_ratio numeric(7,4),
  add column if not exists reach_rate numeric(7,4),
  add column if not exists completion_rate numeric(7,4),
  add column if not exists avg_watch_time_seconds numeric(7,2);

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

-- Followers at publish time (for accurate reach_rate)
alter table public.posts
  add column if not exists followers_at_publish integer;

-- View joining posts with their latest snapshot
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

-- posts_touch trigger guard (already created in 0001 but guard in case of fresh apply)
do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'posts_touch'
  ) then
    create trigger posts_touch before update on public.posts
      for each row execute function public.touch_updated_at();
  end if;
end $$;

-- NOTE: For posts synced before this migration, KPI columns will be null.
-- Strategy: let users re-sync accounts to populate KPIs (Option A from spec).
-- No automatic backfill SQL — re-sync is the trigger.
