'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { colors } from '@/themes/ai-lichiditate/tokens';

const RANGES = [7, 14, 30, 90] as const;

export function DateRangePicker() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showCustom, setShowCustom] = useState(
    searchParams.has('from') && searchParams.has('to')
  );
  const [customFrom, setCustomFrom] = useState(searchParams.get('from') ?? '');
  const [customTo, setCustomTo] = useState(searchParams.get('to') ?? '');

  const activeRange = searchParams.get('range') ?? '30';
  const hasCustom = searchParams.has('from') && searchParams.has('to');

  function navigate(params: URLSearchParams) {
    router.push(`/dashboard?${params.toString()}`);
  }

  function handleQuickRange(days: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('range', String(days));
    params.delete('from');
    params.delete('to');
    setShowCustom(false);
    navigate(params);
  }

  function handleCustomApply() {
    if (!customFrom || !customTo) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set('from', customFrom);
    params.set('to', customTo);
    params.delete('range');
    navigate(params);
  }

  const dateInputStyle = {
    fontFamily: 'var(--font-jetbrains-mono)',
    fontSize: 11,
    background: colors.bgCard,
    border: `1px solid ${colors.borderDefault}`,
    color: colors.textPrimary,
    padding: '4px 8px',
    borderRadius: 4,
    colorScheme: 'dark' as const,
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
      {RANGES.map(days => {
        const isActive = !hasCustom && !showCustom && activeRange === String(days);
        return (
          <button
            key={days}
            onClick={() => handleQuickRange(days)}
            style={{
              fontFamily: 'var(--font-jetbrains-mono)',
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              padding: '4px 10px',
              borderRadius: 4,
              cursor: 'pointer',
              border: `1px solid ${isActive ? colors.accentLime : colors.borderDefault}`,
              background: 'transparent',
              color: isActive ? colors.accentLime : colors.textMuted,
            }}
          >
            {days}D
          </button>
        );
      })}
      <button
        onClick={() => setShowCustom(v => !v)}
        style={{
          fontFamily: 'var(--font-jetbrains-mono)',
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          padding: '4px 10px',
          borderRadius: 4,
          cursor: 'pointer',
          border: `1px solid ${(hasCustom || showCustom) ? colors.accentLime : colors.borderDefault}`,
          background: 'transparent',
          color: (hasCustom || showCustom) ? colors.accentLime : colors.textMuted,
        }}
      >
        CUSTOM
      </button>
      {showCustom && (
        <>
          <input
            type="date"
            value={customFrom}
            onChange={e => setCustomFrom(e.target.value)}
            style={dateInputStyle}
          />
          <span style={{ color: colors.textMuted, fontSize: 11 }}>→</span>
          <input
            type="date"
            value={customTo}
            onChange={e => setCustomTo(e.target.value)}
            style={dateInputStyle}
          />
          <button
            onClick={handleCustomApply}
            disabled={!customFrom || !customTo}
            style={{
              fontFamily: 'var(--font-jetbrains-mono)',
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              padding: '4px 10px',
              borderRadius: 4,
              cursor: customFrom && customTo ? 'pointer' : 'not-allowed',
              border: `1px solid ${colors.accentLime}`,
              background: colors.accentLime,
              color: colors.textInverse,
              opacity: customFrom && customTo ? 1 : 0.5,
            }}
          >
            APLICĂ
          </button>
        </>
      )}
    </div>
  );
}
