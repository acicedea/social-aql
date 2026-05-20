'use client';
import React, { useState, useEffect } from 'react';
import { Button } from '@/components/design-system/Button';
import { colors } from '@/themes/ai-lichiditate/tokens';

interface Props {
  onClick: () => void;
  loading: boolean;
  disabled?: boolean;
  disabledReason?: string;
}

export function DeepAnalysisButton({ onClick, loading, disabled, disabledReason }: Props) {
  const [cursor, setCursor] = useState('_');
  useEffect(() => {
    if (!loading) return;
    const iv = setInterval(() => setCursor((c) => (c === '_' ? ' ' : '_')), 500);
    return () => clearInterval(iv);
  }, [loading]);

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <Button
        variant="ghost"
        onClick={onClick}
        disabled={disabled || loading}
        title={disabled ? disabledReason : undefined}
        style={{
          color: disabled ? colors.textMuted : colors.accentLime,
          border: `1px solid ${disabled ? colors.borderDefault : colors.accentLime}`,
          opacity: disabled ? 0.5 : 1,
        }}
      >
        {loading ? `→ ANALIZEZ DEEP${cursor}` : '→ DEEP ANALYSIS (CLAUDE)'}
      </Button>
    </div>
  );
}
