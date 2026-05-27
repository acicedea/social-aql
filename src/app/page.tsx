import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import React from 'react';
import Link from 'next/link';
import { colors } from '@/themes/ai-lichiditate/tokens';
import { Eyebrow, H1, Body } from '@/components/design-system/Typography';
import { Button } from '@/components/design-system/Button';

export default async function Home() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect('/dashboard');
  return (
    <div
      style={{
        minHeight: '100vh',
        background: colors.bg,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '48px',
        position: 'relative',
      }}
    >
      {/* Hero */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 24,
          maxWidth: 800,
          width: '100%',
        }}
      >
        <Eyebrow>AI LICHIDITATE · BETA</Eyebrow>
        <H1 accent={{ text: 'MATTERS', tone: 'lime' }}>
          THE ANALYSIS THAT MATTERS.
        </H1>
        <Body tone="secondary">
          Social media analytics with AI-generated positioning insights.
        </Body>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 16 }}>
          <Link href="/login" style={{ textDecoration: 'none' }}>
            <Button variant="primary">→ INTRĂ ÎN JOC</Button>
          </Link>
          <Link href="/design-system" style={{ textDecoration: 'none' }}>
            <Button variant="ghost">→ DESIGN SYSTEM</Button>
          </Link>
        </div>
      </div>

      {/* Footer */}
      <div
        style={{
          position: 'absolute',
          bottom: 32,
          left: 48,
          right: 48,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-jetbrains-mono), monospace',
            fontSize: 11,
            color: colors.textMuted,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}
        >
          @ailichiditate
        </span>
        <span
          style={{
            fontFamily: 'var(--font-jetbrains-mono), monospace',
            fontSize: 11,
            color: colors.accentLime,
            fontWeight: 700,
          }}
        >
          00
        </span>
      </div>
    </div>
  );
}
