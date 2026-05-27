'use client';
import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { colors } from '@/themes/ai-lichiditate/tokens';
import { Mono } from '@/components/design-system/Typography';
import { AnalysisRunButton } from '@/components/ai/AnalysisRunButton';
import { DeepAnalysisButton } from '@/components/ai/DeepAnalysisButton';
import { runAnalysisAction } from './actions';
import type { AiTier } from '@/ai/providers/types';

interface Account {
  id: string;
  display_name: string;
  handle: string | null;
}
interface AnalysisOption {
  id: string;
  displayName: string;
  description: string;
  tier: AiTier;
}

interface Props {
  accounts: Account[];
  analyses: AnalysisOption[];
  claudeAvailable: boolean;
}

const inputStyle: React.CSSProperties = {
  fontFamily: 'var(--font-jetbrains-mono), monospace',
  fontSize: 13,
  background: 'transparent',
  border: `1px solid ${colors.borderDefault}`,
  borderRadius: 4,
  color: colors.textPrimary,
  padding: '8px 12px',
  width: '100%',
};

export function AnalysisForm({ accounts, analyses, claudeAvailable }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isDeepPending, startDeepTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const today = new Date().toISOString().slice(0, 10);
  const thirtyAgo = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);

  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '');
  const [analysisType, setAnalysisType] = useState(analyses[0]?.id ?? '');
  const [rangeFrom, setRangeFrom] = useState(thirtyAgo);
  const [rangeTo, setRangeTo] = useState(today);

  const handle = (overrideTier?: AiTier) => {
    setError(null);
    const go = async () => {
      try {
        await runAnalysisAction({
          accountId,
          analysisType,
          rangeFrom,
          rangeTo,
          overrideTier,
        });
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Eroare necunoscută');
      }
    };
    if (overrideTier === 'deep') {
      startDeepTransition(go);
    } else {
      startTransition(go);
    }
  };

  if (accounts.length === 0) {
    return (
      <div style={{ padding: '16px 0' }}>
        <Mono tone="muted">
          NICIUN CONT CONECTAT.{' '}
          <a href="/dashboard/accounts" style={{ color: colors.accentLime }}>
            CONECTEAZĂ UN CONT
          </a>
        </Mono>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <Mono tone="muted">CONT</Mono>
          <select
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            style={inputStyle}
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.display_name}
                {a.handle ? ` (@${a.handle})` : ''}
              </option>
            ))}
          </select>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <Mono tone="muted">TIP ANALIZĂ</Mono>
          <select
            value={analysisType}
            onChange={(e) => setAnalysisType(e.target.value)}
            style={inputStyle}
          >
            {analyses.map((a) => (
              <option key={a.id} value={a.id}>
                {a.displayName}
              </option>
            ))}
          </select>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <Mono tone="muted">DE LA</Mono>
          <input
            type="date"
            value={rangeFrom}
            onChange={(e) => setRangeFrom(e.target.value)}
            style={inputStyle}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <Mono tone="muted">PÂNĂ LA</Mono>
          <input
            type="date"
            value={rangeTo}
            onChange={(e) => setRangeTo(e.target.value)}
            style={inputStyle}
          />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <AnalysisRunButton
          onClick={() => handle()}
          loading={isPending}
          disabled={isDeepPending}
        />
        <DeepAnalysisButton
          onClick={() => handle('deep')}
          loading={isDeepPending}
          disabled={isPending || !claudeAvailable}
          disabledReason={!claudeAvailable ? 'ANTHROPIC_API_KEY nu este setat' : undefined}
        />
      </div>

      {error && (
        <div
          style={{
            color: colors.accentCoral,
            fontFamily: 'var(--font-jetbrains-mono)',
            fontSize: 13,
          }}
        >
          EROARE: {error}
        </div>
      )}
    </div>
  );
}
