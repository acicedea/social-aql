import React from 'react';
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase/server';
import { activeThemeId } from '@/config/theme.config';
import { Eyebrow, H2, Mono } from '@/components/design-system/Typography';
import { colors } from '@/themes/platform/tokens';
import { aiProviders } from '@/ai/registry';
import { aiConfig } from '@/config/ai.config';
import { BackfillThemesSection } from '@/components/dashboard/BackfillThemesSection';
import { UserManagementSection } from '@/components/dashboard/UserManagementSection';
import { getCurrentUserRole } from '@/lib/roles';
import { fetchViewersAction, fetchPendingInvitesAction } from './actions';
import forkConfig from '../../../../fork-config';
import { appConfig } from '@/config/app.config';

export default async function SettingsPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  const userProfile = await getCurrentUserRole();
  const adminUser = userProfile?.role === 'admin';
  const db = createSupabaseServiceClient();

  const [
    { count: totalPosts },
    { count: classifiedPosts },
    viewers,
    pendingInvites,
  ] = await Promise.all([
    db.from('posts').select('*', { count: 'exact', head: true }),
    db.from('posts').select('*', { count: 'exact', head: true }).not('theme', 'is', null),
    adminUser ? fetchViewersAction() : Promise.resolve([]),
    adminUser ? fetchPendingInvitesAction() : Promise.resolve([]),
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
      {adminUser && (
        <div>
          <div style={{ marginTop: 32, marginBottom: 16 }}>
            <H2>RE-CLASIFICARE TEME</H2>
          </div>
          <BackfillThemesSection
            totalPosts={totalPosts ?? 0}
            classifiedPosts={classifiedPosts ?? 0}
          />
        </div>
      )}

      {adminUser && (
        <div>
          <div style={{ marginTop: 32, marginBottom: 16 }}>
            <H2>UTILIZATORI · MANAGEMENT</H2>
          </div>
          <UserManagementSection
            viewers={viewers}
            pendingInvites={pendingInvites}
          />
        </div>
      )}

      <div>
        <div style={{ marginTop: 32, marginBottom: 16 }}>
          <H2>CONFIGURAȚIE FORK</H2>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[
            { label: 'APP NAME', value: appConfig.name },
            { label: 'HANDLE', value: appConfig.handle },
            { label: 'LOCALE', value: appConfig.locale },
            { label: 'AI PROVIDER', value: `${forkConfig.ai.provider} / ${forkConfig.ai.model}` },
            { label: 'MODULES ACTIVE', value: `${Object.values(forkConfig.modules).filter(Boolean).length} / ${Object.keys(forkConfig.modules).length}` },
            { label: 'TEME CONȚINUT', value: forkConfig.contentNiche.themes.join(', ') },
          ].map(({ label, value }) => (
            <div
              key={label}
              style={{
                background: colors.bgCard,
                border: `1px solid ${colors.borderDefault}`,
                borderRadius: 6,
                padding: '12px 20px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 16,
              }}
            >
              <Mono tone="muted">{label}</Mono>
              <span style={{ textAlign: 'right', wordBreak: 'break-word', maxWidth: 320 }}><Mono>{value}</Mono></span>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
          {[
            { bg: forkConfig.theme.accentPrimary, title: 'Accent Primary' },
            { bg: forkConfig.theme.accentSecondary, title: 'Accent Secondary' },
            { bg: forkConfig.theme.bgCard, title: 'Card Background', border: forkConfig.theme.borderDefault },
            { bg: forkConfig.theme.textPrimary, title: 'Text Primary' },
          ].map(({ bg, title, border }) => (
            <div
              key={title}
              title={title}
              style={{
                width: 32,
                height: 32,
                background: bg,
                border: border ? `1px solid ${border}` : undefined,
                borderRadius: 4,
              }}
            />
          ))}
        </div>
        <div style={{ marginTop: 8 }}>
          <span style={{ fontSize: 11 }}><Mono tone="muted">Culorile se actualizează automat din fork-config.ts</Mono></span>
        </div>
      </div>
    </div>
  );
}
