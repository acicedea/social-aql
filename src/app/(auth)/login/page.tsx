'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { colors } from '@/themes/ai-lichiditate/tokens';
import { Eyebrow, H1, Body, Mono } from '@/components/design-system/Typography';
import { Button } from '@/components/design-system/Button';

type Mode = 'signin' | 'signup' | 'magic';

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [magicSent, setMagicSent] = useState(false);

  const supabase = createSupabaseBrowserClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (mode === 'magic') {
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
        });
        if (error) throw error;
        setMagicSent(true);
      } else if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
        });
        if (error) throw error;
        router.push('/dashboard');
        router.refresh();
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.push('/dashboard');
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'A apărut o eroare.');
    } finally {
      setLoading(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    background: colors.bgCard,
    border: `1px solid ${colors.borderDefault}`,
    borderRadius: 6,
    padding: '12px 16px',
    fontFamily: 'var(--font-inter), sans-serif',
    fontSize: 14,
    color: colors.textPrimary,
    outline: 'none',
  };

  const tabStyle = (active: boolean): React.CSSProperties => ({
    fontFamily: 'var(--font-jetbrains-mono), monospace',
    fontSize: 11,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: active ? colors.accentLime : colors.textMuted,
    cursor: 'pointer',
    background: 'none',
    border: 'none',
    borderBottom: `2px solid ${active ? colors.accentLime : 'transparent'}`,
    padding: '0 0 8px 0',
  });

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
      }}
    >
      <div style={{ width: '100%', maxWidth: 400, display: 'flex', flexDirection: 'column', gap: 32 }}>
        {/* Header */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Eyebrow>AI LICHIDITATE_aql · ACCESS</Eyebrow>
          <H1 accent={{ text: 'AQL', tone: 'lime' }}>INTRĂ ÎN AQL.</H1>
        </div>

        {magicSent ? (
          <div
            style={{
              background: colors.bgCard,
              border: `1px solid ${colors.borderDefault}`,
              borderRadius: 6,
              padding: 24,
            }}
          >
            <Body>Link de autentificare trimis la <strong>{email}</strong>. Verifică inbox-ul.</Body>
          </div>
        ) : (
          <>
            {/* Mode tabs */}
            <div style={{ display: 'flex', gap: 24, borderBottom: `1px solid ${colors.borderDefault}`, paddingBottom: 0 }}>
              {(['signin', 'signup', 'magic'] as Mode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => { setMode(m); setError(null); }}
                  style={tabStyle(mode === m)}
                >
                  {m === 'signin' ? 'Intră' : m === 'signup' ? 'Înregistrare' : 'Link magic'}
                </button>
              ))}
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <Mono tone="muted">EMAIL</Mono>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="email@exemplu.com"
                  style={inputStyle}
                />
              </div>

              {mode !== 'magic' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <Mono tone="muted">PAROLĂ</Mono>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                    placeholder="••••••••"
                    style={inputStyle}
                  />
                </div>
              )}

              {error && (
                <div style={{ padding: '10px 14px', background: colors.bgCardNegative, border: `1px solid ${colors.borderNegative}`, borderRadius: 6 }}>
                  <Mono tone="coral">{error}</Mono>
                </div>
              )}

              <Button variant="primary" htmlType="submit" loading={loading} style={{ marginTop: 8 }}>
                {mode === 'signin' ? '→ INTRĂ' : mode === 'signup' ? '→ CREEAZĂ CONT' : '→ TRIMITE LINK'}
              </Button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
