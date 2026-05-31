import React from 'react';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

interface AppShellProps {
  children: React.ReactNode;
  userEmail: string;
  pageTitle: string;
  userRole?: 'admin' | 'viewer';
}

export function AppShell({ children, userEmail, pageTitle, userRole }: AppShellProps) {
  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar userEmail={userEmail} userRole={userRole} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <TopBar title={pageTitle} />
        <main style={{ flex: 1, padding: '24px 32px' }}>{children}</main>
      </div>
    </div>
  );
}
