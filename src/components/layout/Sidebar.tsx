'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { colors } from '@/themes/platform/tokens';
import { signOut } from '@/app/dashboard/actions';
import { appConfig } from '@/config/app.config';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/dashboard/accounts', label: 'Conturi' },
  { href: '/dashboard/posts', label: 'Postări' },
  { href: '/dashboard/analyses', label: 'Analize' },
  { href: '/dashboard/chat', label: 'Chat' },
  { href: '/dashboard/settings', label: 'Setări' },
];

interface SidebarProps {
  userEmail: string;
}

export function Sidebar({ userEmail }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside
      style={{
        width: 240,
        flexShrink: 0,
        background: colors.bg,
        borderRight: `1px solid ${colors.borderDefault}`,
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        position: 'sticky',
        top: 0,
      }}
    >
      {/* App name */}
      <div
        style={{
          padding: '24px 20px 20px',
          borderBottom: `1px solid ${colors.borderDefault}`,
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-league-spartan), sans-serif',
            fontSize: 16,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            color: colors.textPrimary,
          }}
        >
          {appConfig.name}
        </span>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '16px 0' }}>
        {NAV_ITEMS.map(({ href, label }) => {
          const isActive = pathname === href || (href !== '/dashboard' && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '10px 20px',
                textDecoration: 'none',
                position: 'relative',
                borderLeft: `4px solid ${isActive ? colors.accentLime : 'transparent'}`,
              }}
            >
              <span
                style={{
                  fontFamily: 'var(--font-jetbrains-mono), monospace',
                  fontSize: 12,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: isActive ? colors.accentLime : colors.textSecondary,
                }}
              >
                {label}
              </span>
            </Link>
          );
        })}
      </nav>

      {/* User + logout */}
      <div
        style={{
          padding: '16px 20px',
          borderTop: `1px solid ${colors.borderDefault}`,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-jetbrains-mono), monospace',
            fontSize: 11,
            color: colors.textMuted,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {userEmail}
        </span>
        <form action={signOut}>
          <button
            type="submit"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'var(--font-jetbrains-mono), monospace',
              fontSize: 11,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: colors.textSecondary,
              padding: 0,
            }}
          >
            → LOG OUT
          </button>
        </form>
      </div>
    </aside>
  );
}
