'use client';

import { Select } from 'antd';
import { useRouter, useSearchParams } from 'next/navigation';
import { colors } from '@/themes/ai-lichiditate/tokens';
import { AccountOption } from '@/lib/dashboard/data';

interface AccountSelectorProps {
  accounts: AccountOption[];
  activeAccountId: string;
}

export function AccountSelector({ accounts, activeAccountId }: AccountSelectorProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  if (accounts.length <= 1) {
    return (
      <span style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 12, color: colors.textPrimary, textTransform: 'uppercase' }}>
        {accounts[0]?.displayName ?? ''}
      </span>
    );
  }

  function handleChange(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('account', value);
    router.push(`/dashboard?${params.toString()}`);
  }

  return (
    <Select
      value={activeAccountId}
      onChange={handleChange}
      popupMatchSelectWidth={false}
      style={{ minWidth: 180, fontFamily: 'var(--font-jetbrains-mono)', fontSize: 12 }}
      options={accounts.map(a => ({
        value: a.id,
        label: `${a.displayName} · ${a.platform.toUpperCase()}`,
      }))}
    />
  );
}
