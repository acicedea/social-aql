'use client';

import React, { useTransition, useState } from 'react';
import { useRouter } from 'next/navigation';
import { colors } from '@/themes/ai-lichiditate/tokens';
import { runAnalysisAction } from '@/app/dashboard/analyses/actions';
import type { AnalysisType } from '@/ai/analyses/types';

interface Props {
  analysisType: AnalysisType;
  accountId: string;
}

export function RunAnalysisButton({ analysisType, accountId }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await runAnalysisAction(analysisType, accountId);
      if (!result.success) {
        setError(result.error);
        return;
      }
      router.push(`/dashboard/analyses/${result.analysisId}`);
    });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <button
        onClick={handleClick}
        disabled={isPending}
        style={{
          fontFamily: 'var(--font-jetbrains-mono), monospace',
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          padding: '10px 20px',
          background: isPending ? 'transparent' : colors.accentLime,
          color: isPending ? colors.accentLime : colors.textInverse,
          border: `1px solid ${colors.accentLime}`,
          borderRadius: 4,
          cursor: isPending ? 'not-allowed' : 'pointer',
          transition: 'opacity 0.15s',
          opacity: isPending ? 0.7 : 1,
          whiteSpace: 'nowrap',
        }}
      >
        {isPending ? 'ANALIZEZ... (~30s)' : '→ GENEREAZĂ'}
      </button>
      {isPending && (
        <span
          style={{
            fontFamily: 'var(--font-jetbrains-mono), monospace',
            fontSize: 11,
            color: colors.textMuted,
          }}
        >
          Datele se procesează. Nu închide pagina.
        </span>
      )}
      {error && (
        <span
          style={{
            fontFamily: 'var(--font-jetbrains-mono), monospace',
            fontSize: 11,
            color: colors.accentCoral,
          }}
        >
          EROARE: {error}
        </span>
      )}
    </div>
  );
}
