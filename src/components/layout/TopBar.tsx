'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { colors } from '@/themes/ai-lichiditate/tokens';
import { DateRangePicker } from '@/components/dashboard/DateRangePicker';

interface TopBarProps {
  title: string;
}

export function TopBar({ title }: TopBarProps) {
  const pathname = usePathname();

  return (
    <header
      style={{
        height: 64,
        background: colors.bg,
        borderBottom: `1px solid ${colors.borderDefault}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 32px',
        flexShrink: 0,
      }}
    >
      <span
        style={{
          fontFamily: 'var(--font-jetbrains-mono), monospace',
          fontSize: 12,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: colors.textPrimary,
        }}
      >
        {title}
      </span>
      {pathname === '/dashboard' ? <DateRangePicker /> : null}
    </header>
  );
}
