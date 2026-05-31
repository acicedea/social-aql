-- =====================================================================
-- 0007: Fix recursive RLS on user_profiles
--
-- The user_profiles_admin_select_all policy queried user_profiles itself,
-- causing PostgreSQL to throw "infinite recursion detected in policy for
-- relation user_profiles" and silently failing all reads.
--
-- Fix: use a SECURITY DEFINER function which bypasses RLS in the subquery.
-- =====================================================================

-- Drop the recursive policy
drop policy if exists "user_profiles_admin_select_all" on public.user_profiles;

-- Create a non-recursive helper (SECURITY DEFINER bypasses RLS in body)
create or replace function public.current_user_is_admin()
returns boolean as $$
  select exists (
    select 1 from public.user_profiles
    where user_id = auth.uid() and role = 'admin'
  );
$$ language sql security definer stable;

-- Recreate policy using the helper
create policy "user_profiles_admin_select_all" on public.user_profiles
  for select using (public.current_user_is_admin());
