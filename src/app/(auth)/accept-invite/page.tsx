import React from 'react';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { Eyebrow, H1 } from '@/components/design-system/Typography';
import { AcceptInviteForm } from '@/components/auth/AcceptInviteForm';
import { colors } from '@/themes/platform/tokens';

interface Props {
  searchParams: Promise<{ token?: string }>;
}

function InviteError({ message }: { message: string }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: colors.bg,
        padding: 24,
      }}
    >
      <div style={{ maxWidth: 400, width: '100%' }}>
        <Eyebrow tone="muted">INVITAȚIE · EROARE</Eyebrow>
        <p style={{ margin: '12px 0 0', fontFamily: 'var(--font-inter), sans-serif', fontSize: 16, color: colors.textSecondary }}>
          {message}
        </p>
        <div style={{ marginTop: 24 }}>
          <a
            href="/login"
            style={{
              fontFamily: 'var(--font-jetbrains-mono), monospace',
              fontSize: 12,
              color: colors.accentLime,
              textDecoration: 'none',
            }}
          >
            → MERGI LA LOGIN
          </a>
        </div>
      </div>
    </div>
  );
}

export default async function AcceptInvitePage({ searchParams }: Props) {
  const params = await searchParams;
  const token = params.token;

  if (!token) redirect('/login?error=invalid_invite');

  const supabase = await createSupabaseServerClient();

  // Validate token
  const { data: invite } = await supabase
    .from('invitations')
    .select('id, email, expires_at, accepted_at')
    .eq('token', token)
    .maybeSingle();

  if (!invite) {
    return <InviteError message="Invitație invalidă sau expirată." />;
  }

  if (invite.accepted_at) {
    return <InviteError message="Această invitație a fost deja folosită." />;
  }

  if (new Date(invite.expires_at) < new Date()) {
    return <InviteError message="Invitația a expirat. Cere adminului o nouă invitație." />;
  }

  // Check if user is already logged in
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    redirect(`/api/invite/accept?token=${token}`);
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: colors.bg,
        padding: 24,
      }}
    >
      <div style={{ maxWidth: 400, width: '100%' }}>
        <Eyebrow tone="lime">INVITAȚIE · AI LICHIDITATE</Eyebrow>
        <div style={{ marginTop: 12, marginBottom: 8 }}>
          <H1 accent={{ text: 'INVITAT.', tone: 'lime' }}>AI FOST INVITAT.</H1>
        </div>
        <p
          style={{
            margin: '0 0 32px',
            fontFamily: 'var(--font-inter), sans-serif',
            fontSize: 16,
            color: colors.textSecondary,
          }}
        >
          Creează-ți contul pentru a accesa platforma ca viewer.
        </p>

        <AcceptInviteForm email={invite.email} token={token} />
      </div>
    </div>
  );
}
