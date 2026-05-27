-- Add secondary theme column for richer AI classification
alter table public.posts
  add column if not exists theme_secondary text;

create index if not exists posts_theme_secondary_idx
  on public.posts(theme_secondary) where theme_secondary is not null;

-- Drop and recreate view to add theme_secondary without column position conflict
drop view if exists public.posts_with_latest_metrics;
create view public.posts_with_latest_metrics as
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
  p.theme_secondary,
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
