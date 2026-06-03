import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { InsightCard } from '@/components/agent/InsightCard';
import { Eyebrow, H1, Body, Mono } from '@/components/design-system';

export default async function AgentPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const db = createSupabaseServiceClient();
  const { data: insights } = await db
    .from('agent_insights')
    .select('*')
    .order('run_at', { ascending: false })
    .limit(10);

  return (
    <div>
      <Eyebrow tone="muted">AGENT · INTELLIGENCE PROACTIVĂ</Eyebrow>
      <div style={{ marginTop: 8 }}><H1>AGENT.</H1></div>

      <div style={{ display: 'flex', gap: 24, marginBottom: 32, marginTop: 16 }}>
        <div>
          <Eyebrow tone="muted">RULĂRI TOTALE</Eyebrow>
          <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 24, fontWeight: 700, marginTop: 4 }}>
            {insights?.length ?? 0}
          </div>
        </div>
        <div>
          <Eyebrow tone="muted">ULTIMA RULARE</Eyebrow>
          <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 14, marginTop: 4 }}>
            {insights?.[0]
              ? new Date(insights[0].run_at).toLocaleDateString('ro-RO', {
                  weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
                })
              : 'Nicio rulare încă'}
          </div>
        </div>
        <div>
          <Eyebrow tone="muted">EMAIL</Eyebrow>
          <div style={{ marginTop: 4 }}>
            <Mono tone={insights?.[0]?.email_sent ? 'lime' : 'muted'}>
              {insights?.[0]?.email_sent ? '✓ TRIMIS' : '— NETRIMIS'}
            </Mono>
          </div>
        </div>
      </div>

      {!insights || insights.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 0' }}>
          <Body tone="secondary">
            Agentul nu a rulat încă. Prima rulare va fi luni dimineață la 09:00.
          </Body>
          <div style={{ marginTop: 8 }}>
            <Body tone="muted">
              Sau testează manual cu: curl -H &quot;Authorization: Bearer $CRON_SECRET&quot; /api/cron/agent
            </Body>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {insights.map(insight => (
            <InsightCard key={insight.id} insight={insight} />
          ))}
        </div>
      )}
    </div>
  );
}
