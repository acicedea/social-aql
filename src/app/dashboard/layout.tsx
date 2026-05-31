import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/layout/AppShell';
import { getCurrentUserRole } from '@/lib/roles';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const userProfile = await getCurrentUserRole();

  return (
    <AppShell
      userEmail={user.email ?? ''}
      pageTitle="Dashboard"
      userRole={userProfile?.role}
    >
      {children}
    </AppShell>
  );
}
