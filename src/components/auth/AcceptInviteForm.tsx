'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { colors } from '@/themes/platform/tokens';
import { Button } from '@/components/design-system/Button';

interface Props {
  email: string;
  token: string;
}

const monoStyle: React.CSSProperties = {
  fontFamily: 'var(--font-jetbrains-mono), monospace',
  fontSize: 11,
  color: colors.textMuted,
  display: 'block',
  marginBottom: 6,
};

export function AcceptInviteForm({ email, token }: Props) {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/invite/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });

      const data = await res.json() as { success?: boolean; error?: string };

      if (!res.ok || !data.success) {
        setError(data.error ?? 'A apărut o eroare. Încearcă din nou.');
        return;
      }

      router.push('/login?invited=1');
    } catch {
      setError('Eroare de rețea. Încearcă din nou.');
    } finally {
      setLoading(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    background: colors.bgCard,
    border: `1px solid ${colors.borderDefault}`,
    borderRadius: 4,
    padding: '10px 12px',
    fontFamily: 'var(--font-jetbrains-mono), monospace',
    fontSize: 13,
    color: colors.textPrimary,
    boxSizing: 'border-box',
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <span style={monoStyle}>EMAIL</span>
        <input
          type="email"
          value={email}
          readOnly
          style={{ ...inputStyle, opacity: 0.6, cursor: 'not-allowed' }}
        />
      </div>

      <div>
        <span style={monoStyle}>PAROLĂ</span>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Alege o parolă"
          required
          minLength={6}
          style={inputStyle}
          autoFocus
        />
      </div>

      {error && (
        <p style={{ margin: 0, fontSize: 13, color: colors.accentCoral, fontFamily: 'var(--font-inter), sans-serif' }}>
          {error}
        </p>
      )}

      <Button htmlType="submit" disabled={loading || !password}>
        {loading ? 'SE PROCESEAZĂ...' : '→ CREEAZĂ CONT'}
      </Button>
    </form>
  );
}
