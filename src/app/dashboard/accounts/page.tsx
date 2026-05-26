import React from 'react';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { listProviderManifests } from '@/config/providers.manifests';
import { Eyebrow, H2 } from '@/components/design-system/Typography';
import { AvailableProvidersGrid } from '@/components/providers/AvailableProvidersGrid';
import { ConnectedAccountsList } from '@/components/providers/ConnectedAccountsList';
import { connectProviderAction } from './actions';

export default async function AccountsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: accounts } = await supabase
    .from('accounts')
    .select('id, display_name, handle, provider_id, status')
    .eq('user_id', user!.id)
    .order('created_at', { ascending: false });

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

        <ConnectedAccountsList accounts={accounts ?? []} />
      </section>

      {/* Available providers */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div>
          <Eyebrow>PROVIDERI · DISPONIBILI</Eyebrow>
          <div style={{ marginTop: 8 }}>
            <H2>CONECTEAZĂ UN CONT</H2>
          </div>
        </div>

        <AvailableProvidersGrid
          providers={providerManifests}
          onConnectAction={connectProviderAction}
        />
      </section>
    </div>
  );
}
