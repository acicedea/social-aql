import React from 'react';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { listProviderManifests } from '@/config/providers.manifests';
import { Eyebrow, H2 } from '@/components/design-system/Typography';
import { AvailableProvidersGrid } from '@/components/providers/AvailableProvidersGrid';
import { ConnectedAccountsList } from '@/components/providers/ConnectedAccountsList';
import { getCurrentUserRole } from '@/lib/roles';
import { connectProviderAction } from './actions';
import { colors } from '@/themes/platform/tokens';

export default async function AccountsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [userProfile, { data: accounts }] = await Promise.all([
    getCurrentUserRole(),
    supabase
      .from('accounts')
      .select('id, display_name, handle, provider_id, status, last_sync_at')
      .eq('user_id', user!.id)
      .order('created_at', { ascending: false }),
  ]);

  const adminUser = userProfile?.role === 'admin';
  const providerManifests = listProviderManifests();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 48 }}>
      {/* Connected accounts */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div>
          <Eyebrow>CONTURI · CONECTATE</Eyebrow>
          <div style={{ marginTop: 8 }}>
            <H2>CONTURI CONECTATE</H2>
          </div>
        </div>

        <ConnectedAccountsList accounts={accounts ?? []} isAdmin={adminUser} />
      </section>

      {/* Available providers — admin only */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div>
          <Eyebrow>PROVIDERI · DISPONIBILI</Eyebrow>
          <div style={{ marginTop: 8 }}>
            <H2>CONECTEAZĂ UN CONT</H2>
          </div>
        </div>

        {adminUser ? (
          <AvailableProvidersGrid
            providers={providerManifests}
            onConnectAction={connectProviderAction}
          />
        ) : (
          <div
            style={{
              background: colors.bgCard,
              border: `1px solid ${colors.borderDefault}`,
              borderRadius: 6,
              padding: '20px',
            }}
          >
            <Eyebrow tone="muted">PROVIDERI · ACCES RESTRICȚIONAT</Eyebrow>
            <p
              style={{
                margin: '8px 0 0',
                fontFamily: 'var(--font-inter), sans-serif',
                fontSize: 16,
                color: colors.textSecondary,
              }}
            >
              Conectarea conturilor este disponibilă doar pentru administrator.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
