import React from 'react';
import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { colors } from '@/themes/ai-lichiditate/tokens';
import { Eyebrow, H1, H2, Body, Mono } from '@/components/design-system/Typography';
import { Button } from '@/components/design-system/Button';
import { Card } from '@/components/design-system/Card';

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: accounts } = await supabase
    .from('accounts')
    .select(`
      id, display_name, handle, status, last_sync_at,
      account_metrics_snapshots (followers, engagement_rate, captured_at)
    `)
    .eq('user_id', user!.id)
    .order('created_at', { ascending: false });

  const { data: latestAnalysis } = await supabase
    .from('ai_analyses')
    .select('id, analysis_type, output_markdown, model, created_at')
    .eq('user_id', user!.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!accounts || accounts.length === 0) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '60vh',
          gap: 24,
          textAlign: 'center',
        }}
      >
        <Eyebrow>DASHBOARD · STARE</Eyebrow>
        <H1 accent={{ text: 'NICIUN CONT', tone: 'coral' }}>
          NICIUN CONT CONECTAT.
        </H1>
        <Body tone="secondary">
          Conectează un cont de social media pentru a vedea analytics, postări și analize AI.
        </Body>
        <Link href="/accounts" style={{ textDecoration: 'none', marginTop: 8 }}>
          <Button variant="primary">→ CONECTEAZĂ UN CONT</Button>
        </Link>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
      {accounts && accounts.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <Eyebrow>AI · CEA MAI RECENTĂ ANALIZĂ</Eyebrow>
            <Link
              href="/analyses"
              style={{
                fontFamily: 'var(--font-jetbrains-mono)',
                fontSize: 11,
                color: colors.accentLime,
                textDecoration: 'none',
              }}
            >
              VEZI TOATE →
            </Link>
          </div>
          {latestAnalysis ? (
            <Link href={`/analyses/${latestAnalysis.id}`} style={{ textDecoration: 'none' }}>
              <div
                style={{
                  background: colors.bgCard,
                  border: `1px solid ${colors.borderDefault}`,
                  borderRadius: 6,
                  padding: '16px 20px',
                }}
              >
                <Mono tone="muted">
                  {new Date(latestAnalysis.created_at).toLocaleString('ro-RO')} ·{' '}
                  {latestAnalysis.model}
                </Mono>
                <div
                  style={{
                    marginTop: 8,
                    color: colors.textSecondary,
                    fontFamily: 'var(--font-inter)',
                    fontSize: 14,
                    overflow: 'hidden',
                    display: '-webkit-box',
                    WebkitLineClamp: 3,
                    WebkitBoxOrient: 'vertical',
                  }}
                >
                  {latestAnalysis.output_markdown.slice(0, 300)}...
                </div>
              </div>
            </Link>
          ) : (
            <Link href="/analyses" style={{ textDecoration: 'none' }}>
              <div
                style={{
                  background: colors.bgCard,
                  border: `1px solid ${colors.borderDefault}`,
                  borderRadius: 6,
                  padding: '16px 20px',
                  textAlign: 'center',
                }}
              >
                <Mono tone="lime">RULEAZĂ PRIMA ANALIZĂ →</Mono>
              </div>
            </Link>
          )}
        </div>
      )}

      <div>
        <Eyebrow>DASHBOARD · CONTURI</Eyebrow>
        <div style={{ marginTop: 8 }}>
          <H2>CONTURI CONECTATE</H2>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
        {accounts.map((account: any) => {
          const latestMetrics = account.account_metrics_snapshots?.[0];
          const syncTime = account.last_sync_at
            ? new Date(account.last_sync_at).toLocaleDateString('ro-RO')
            : 'Nesincronizat';

          return (
            <Card key={account.id} variant="default">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <Eyebrow tone="lime">{account.handle ?? account.display_name}</Eyebrow>
                  <div style={{ marginTop: 4 }}>
                    <span
                      style={{
                        fontFamily: 'var(--font-league-spartan), sans-serif',
                        fontSize: 20,
                        fontWeight: 700,
                        color: colors.textPrimary,
                      }}
                    >
                      {account.display_name}
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 24 }}>
                  <div>
                    <Mono tone="muted">URMĂRITORI</Mono>
                    <div>
                      <Mono tone="lime">
                        {latestMetrics?.followers?.toLocaleString('ro-RO') ?? '—'}
                      </Mono>
                    </div>
                  </div>
                </div>

                <span
                  style={{
                    fontFamily: 'var(--font-jetbrains-mono), monospace',
                    fontSize: 10,
                    color: 'var(--color-text-muted)',
                  }}
                >
                  Sincronizat: {syncTime}
                </span>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
