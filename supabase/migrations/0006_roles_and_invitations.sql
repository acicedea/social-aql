-- =====================================================================
-- 0006: User profiles (roles) + invitations system
-- =====================================================================

-- User profiles: one row per registered user, holds role
create table public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'viewer'
    check (role in ('admin', 'viewer')),
  display_name text,
  invited_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Index for fast role lookups
create index user_profiles_role_idx on public.user_profiles(role);

-- Invitations: admin creates these, viewer accepts via email link
create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  token text not null unique default encode(gen_random_bytes(32), 'base64url'),
  invited_by uuid not null references auth.users(id) on delete cascade,
  accepted_at timestamptz,
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_at timestamptz not null default now()
);

create index invitations_token_idx on public.invitations(token);
create index invitations_email_idx on public.invitations(email);
create index invitations_invited_by_idx on public.invitations(invited_by);

-- RLS
alter table public.user_profiles enable row level security;
alter table public.invitations enable row level security;

-- user_profiles: users see their own profile always
create policy "user_profiles_select_own" on public.user_profiles
  for select using (auth.uid() = user_id);

-- user_profiles: admin can see all profiles (for user management)
create policy "user_profiles_admin_select_all" on public.user_profiles
  for select using (
    exists (
      select 1 from public.user_profiles p
      where p.user_id = auth.uid() and p.role = 'admin'
    )
  );

-- user_profiles: only the system (service role) can insert/update
create policy "user_profiles_service_insert" on public.user_profiles
  for insert with check (true);

create policy "user_profiles_service_update" on public.user_profiles
  for update using (true);

-- invitations: admin can see all invitations they created
create policy "invitations_admin_all" on public.invitations
  for all using (
    auth.uid() = invited_by or
    exists (
      select 1 from public.user_profiles p
      where p.user_id = auth.uid() and p.role = 'admin'
    )
  );

-- updated_at trigger for user_profiles
create trigger user_profiles_touch before update on public.user_profiles
  for each row execute function public.touch_updated_at();

-- =====================================================================
-- Auto-create user_profile on new user signup
-- First user ever to sign up becomes admin automatically.
-- All subsequent users become viewer.
-- =====================================================================

create or replace function public.handle_new_user()
returns trigger as $$
declare
  admin_count integer;
begin
  select count(*) into admin_count
  from public.user_profiles
  where role = 'admin';

  insert into public.user_profiles (user_id, role)
  values (
    new.id,
    case when admin_count = 0 then 'admin' else 'viewer' end
  );

  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- =====================================================================
-- Backfill: create profiles for existing users
-- First user (oldest created_at) becomes admin, rest become viewer.
-- =====================================================================
insert into public.user_profiles (user_id, role)
select
  id,
  case
    when row_number() over (order by created_at asc) = 1 then 'admin'
    else 'viewer'
  end as role
from auth.users
where id not in (select user_id from public.user_profiles)
on conflict (user_id) do nothing;
