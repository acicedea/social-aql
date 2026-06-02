'use client';

import React, { useTransition, useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { syncAccountAction } from '@/app/dashboard/accounts/actions';
import { colors } from '@/themes/platform/tokens';

interface Props {
  accountId: string;
}

type SyncRange = { label: string; days: number | 'all' };

const SYNC_RANGES: SyncRange[] = [
  { label: 'ALL', days: 'all' },
  { label: '90D', days: 90 },
  { label: '30D', days: 30 },
  { label: '7D', days: 7 },
];

export function SyncAccountButton({ accountId }: Props) {
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function triggerSync(days: number | 'all') {
    setFeedback(null);
    setMenuPos(null);
    startTransition(async () => {
      const result = await syncAccountAction(accountId, days);
      if (result.success) {
        setFeedback({ ok: true, msg: `Sincronizat: ${result.postsCount} postări` });
      } else {
        setFeedback({ ok: false, msg: result.error });
      }
      setTimeout(() => setFeedback(null), 4000);
    });
  }

  function onMouseEnter() {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setMenuPos({
        top: rect.bottom + window.scrollY + 4,
        right: window.innerWidth - rect.right,
      });
    }
  }

  function onMouseLeave() {
    hideTimer.current = setTimeout(() => setMenuPos(null), 150);
  }

  // Close menu on scroll/resize
  useEffect(() => {
    if (!menuPos) return;
    const close = () => setMenuPos(null);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [menuPos]);

  const menu = menuPos && !isPending && (
    <div
      onMouseEnter={() => { if (hideTimer.current) clearTimeout(hideTimer.current); }}
      onMouseLeave={onMouseLeave}
      style={{
        position: 'absolute',
        top: menuPos.top,
        right: menuPos.right,
        display: 'flex',
        flexDirection: 'column',
        background: colors.bgElevated,
        border: `1px solid ${colors.borderDefault}`,
        borderRadius: 4,
        overflow: 'hidden',
        zIndex: 9999,
        minWidth: 64,
      }}
    >
      {SYNC_RANGES.map(({ label, days }) => (
        <button
          key={label}
          onClick={() => triggerSync(days)}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontFamily: 'var(--font-jetbrains-mono), monospace',
            fontSize: 10,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: colors.accentLime,
            padding: '6px 10px',
            textAlign: 'left',
            whiteSpace: 'nowrap',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = colors.bgCard;
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = 'none';
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );

  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
      {feedback && (
        <span
          style={{
            fontFamily: 'var(--font-jetbrains-mono), monospace',
            fontSize: 10,
            color: feedback.ok ? colors.accentLime : colors.accentCoral,
          }}
        >
          {feedback.msg}
        </span>
      )}
      <button
        ref={buttonRef}
        onClick={() => triggerSync('all')}
        disabled={isPending}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        style={{
          background: 'none',
          border: 'none',
          cursor: isPending ? 'default' : 'pointer',
          fontFamily: 'var(--font-jetbrains-mono), monospace',
          fontSize: 11,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          color: isPending ? colors.textMuted : colors.accentLime,
          padding: '0 4px',
          flexShrink: 0,
        }}
      >
        {isPending ? 'SYNC...' : '↻ SYNC'}
      </button>
      {typeof document !== 'undefined' && menu && createPortal(menu, document.body)}
    </span>
  );
}
