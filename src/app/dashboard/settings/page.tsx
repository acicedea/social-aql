import React from 'react';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { activeThemeId } from '@/config/theme.config';
import { Eyebrow, H2, Mono } from '@/components/design-system/Typography';
import { colors } from '@/themes/ai-lichiditate/tokens';
import { aiProviders } from '@/ai/registry';
import { aiConfig } from '@/config/ai.config';
import { BackfillThemesSection } from '@/components/dashboard/BackfillThemesSection';

export default async function SettingsPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [{ count: totalPosts }, { count: classifiedPosts }] = await Promise.all([
    supabase.from('posts').select('*', { count: 'exact', head: true }),
    supabase.from('posts').select('*', { count: 'exact', head: true }).not('theme', 'is', null),
  ]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32, maxWidth: 600 }}>
      <div>
        <Eyebrow>SETĂRI</Eyebrow>
        <div style={{ marginTop: 8 }}>
          <H2>SETĂRI CONT</H2>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div
          style={{
            background: colors.bgCard,
            border: `1px solid ${colors.borderDefault}`,
            borderRadius: 6,
            padding: '16px 20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <Mono tone="muted">EMAIL</Mono>
          <Mono>{user?.email ?? '—'}</Mono>
        </div>

        <div
          style={{
            background: colors.bgCard,
            border: `1px solid ${colors.borderDefault}`,
            borderRadius: 6,
            padding: '16px 20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <Mono tone="muted">TEMĂ ACTIVĂ</Mono>
          <Mono tone="lime">{activeThemeId}</Mono>
        </div>

        <div
          style={{
            background: colors.bgCard,
            border: `1px solid ${colors.borderDefault}`,
            borderRadius: 6,
            padding: '16px 20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <Mono tone="muted">VERSIUNE</Mono>
          <Mono>0.2.0</Mono>
        </div>
      </div>

      <div>
        <div style={{ marginTop: 32, marginBottom: 16 }}>
          <H2>AI</H2>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {aiProviders.map((provider) => (
            <div
              key={provider.id}
              style={{
                background: colors.bgCard,
                border: `1px solid ${colors.borderDefault}`,
                borderRadius: 6,
                padding: '16px 20px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <Mono>{provider.displayName}</Mono>
                <div style={{ marginTop: 4 }}>
                  <Mono tone="muted">
                    {provider.tier.toUpperCase()} · {provider.rateLimit.requestsPerMinute} RPM
                    {provider.rateLimit.requestsPerDay
                      ? ` · ${provider.rateLimit.requestsPerDay}/zi`
                      : ''}
                  </Mono>
                </div>
              </div>
              <Mono tone={provider.isAvailable() ? 'lime' : 'coral'}>
                {provider.isAvailable() ? 'DISPONIBIL' : 'LIPSĂ API KEY'}
              </Mono>
            </div>
          ))}
          <div
            style={{
              background: colors.bgCard,
              border: `1px solid ${colors.borderDefault}`,
              borderRadius: 6,
              padding: '16px 20px',
              display: 'flex',
              justifyContent: 'space-between',
            }}
          >
            <Mono tone="muted">TIER IMPLICIT</Mono>
            <Mono tone="lime">{aiConfig.defaultTier.toUpperCase()}</Mono>
          </div>
        </div>
      </div>
      <div>
        <div style={{ marginTop: 32, marginBottom: 16 }}>
          <H2>RE-CLASIFICARE TEME</H2>
        </div>
        <BackfillThemesSection
          totalPosts={totalPosts ?? 0}
          classifiedPosts={classifiedPosts ?? 0}
        />
      </div>
    </div>
  );
}
