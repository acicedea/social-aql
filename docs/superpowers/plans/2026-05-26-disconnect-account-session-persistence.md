# Disconnect Account + Session Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a disconnect-account flow with confirmation dialog, and ensure Supabase session cookies use `env` module consistently across server/middleware files.

**Architecture:** New server action `disconnectAccountAction` in `actions.ts`. New `ConnectedAccountsList` client component wraps existing `DataRow` list with per-row disconnect buttons and manages dialog open state. `DisconnectAccountDialog` is a separate client component handling confirmation input, action call, and error display. Accounts page becomes a thin server component that passes serializable data to `ConnectedAccountsList`. Session files already use correct `@supabase/ssr` patterns — only change is switching `process.env.X!` to `env.X` in server.ts and middleware.ts (browser client.ts keeps `process.env.NEXT_PUBLIC_*!` because env.ts validates server-only vars that are absent in browser).

**Tech Stack:** Next.js 14 App Router, React 18 `useTransition`, Ant Design `Modal` + `Input`, `@supabase/ssr`, design system (Button, Eyebrow, H3, Body, Mono from Typography), Supabase server actions with `revalidatePath`.

---

### Task 1: Add `disconnectAccountAction` to actions.ts

**Files:**
- Modify: `src/app/dashboard/accounts/actions.ts`

- [ ] **Step 1: Add the action**

Open `src/app/dashboard/accounts/actions.ts`. The file already has `'use server'` at top and imports `revalidatePath`, `createSupabaseServerClient`. Add this action at the end of the file:

```ts
export async function disconnectAccountAction(
  accountId: string,
  confirmationHandle: string
): Promise<{ success: true } | { success: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'unauthenticated' };
  }

  const { data: account, error: fetchErr } = await supabase
    .from('accounts')
    .select('id, handle, display_name, provider_id')
    .eq('id', accountId)
    .eq('user_id', user.id)
    .single();

  if (fetchErr || !account) {
    return { success: false, error: 'not_found' };
  }

  const expected = account.handle ?? account.display_name;
  if (confirmationHandle.trim() !== expected.trim()) {
    return { success: false, error: 'confirmation_mismatch' };
  }

  const { error: deleteErr } = await supabase
    .from('accounts')
    .delete()
    .eq('id', accountId)
    .eq('user_id', user.id);

  if (deleteErr) {
    return { success: false, error: 'delete_failed' };
  }

  revalidatePath('/dashboard/accounts');
  revalidatePath('/dashboard');
  revalidatePath('/dashboard/posts');
  revalidatePath('/dashboard/analyses');

  return { success: true };
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/project.cicedea/Documents/repos/ai-lichiditate-aql
pnpm tsc --noEmit 2>&1 | head -30
```

Expected: zero errors in `actions.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/app/dashboard/accounts/actions.ts
git commit -m "feat: add disconnectAccountAction server action"
```

---

### Task 2: Create `DisconnectAccountDialog.tsx`

**Files:**
- Create: `src/components/providers/DisconnectAccountDialog.tsx`

- [ ] **Step 1: Create the dialog component**

Create `src/components/providers/DisconnectAccountDialog.tsx` with this exact content:

```tsx
'use client';

import React, { useState, useTransition } from 'react';
import { Modal, Input } from 'antd';
import { disconnectAccountAction } from '@/app/dashboard/accounts/actions';
import { Eyebrow, H3, Body, Mono } from '@/components/design-system/Typography';
import { Button } from '@/components/design-system/Button';
import { colors } from '@/themes/ai-lichiditate/tokens';

interface Props {
  open: boolean;
  onClose: () => void;
  account: {
    id: string;
    display_name: string;
    handle: string | null;
    provider_id: string;
  };
}

const ERROR_MESSAGES: Record<string, string> = {
  unauthenticated: 'Sesiune expirată. Re-loghează-te.',
  not_found: 'Contul nu mai există.',
  confirmation_mismatch: 'Handle-ul introdus nu corespunde.',
  delete_failed: 'Eroare la ștergere. Încearcă din nou.',
};

export function DisconnectAccountDialog({ open, onClose, account }: Props) {
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const expectedConfirmation = account.handle ?? account.display_name;
  const isConfirmed = typed.trim() === expectedConfirmation.trim();

  const handleClose = () => {
    setTyped('');
    setError(null);
    onClose();
  };

  const handleConfirm = () => {
    setError(null);
    startTransition(async () => {
      const result = await disconnectAccountAction(account.id, typed);
      if (result.success) {
        handleClose();
      } else {
        setError(ERROR_MESSAGES[result.error] ?? 'Eroare neașteptată.');
      }
    });
  };

  return (
    <Modal
      open={open}
      onCancel={handleClose}
      footer={null}
      centered
      destroyOnClose
      styles={{
        content: { backgroundColor: colors.bgCard, borderRadius: 6, boxShadow: 'none' },
        header: { backgroundColor: 'transparent' },
        mask: { backgroundColor: 'rgba(0,0,0,0.7)' },
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Eyebrow */}
        <Eyebrow tone="coral">ACȚIUNE · DEZCONECTARE</Eyebrow>

        {/* Title */}
        <H3>Dezconectează contul</H3>

        {/* Destructive warning */}
        <Body tone="secondary">
          Această acțiune va șterge contul{' '}
          <Mono tone="coral">{account.display_name}</Mono>, toate postările
          sincronizate și toate analizele AI asociate. Nu poate fi anulată.
        </Body>

        {/* Typing instruction */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Body tone="secondary">
            Pentru confirmare, tastează handle-ul contului:
          </Body>
          <Mono tone="lime">{expectedConfirmation}</Mono>
        </div>

        {/* Input */}
        <Input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder={expectedConfirmation}
          onPressEnter={isConfirmed && !isPending ? handleConfirm : undefined}
          style={{
            fontFamily: 'var(--font-jetbrains-mono), monospace',
            fontSize: 13,
            backgroundColor: colors.bg,
            borderColor: isConfirmed ? colors.accentLime : colors.borderDefault,
            color: colors.textPrimary,
          }}
        />

        {/* Error */}
        {error && (
          <Mono tone="coral">{error}</Mono>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 4 }}>
          <Button variant="ghost" onClick={handleClose} disabled={isPending}>
            ANULEAZĂ
          </Button>
          <Button
            variant="danger"
            onClick={handleConfirm}
            disabled={!isConfirmed || isPending}
            loading={isPending}
          >
            DEZCONECTEAZĂ
          </Button>
        </div>
      </div>
    </Modal>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm tsc --noEmit 2>&1 | head -30
```

Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/providers/DisconnectAccountDialog.tsx
git commit -m "feat: DisconnectAccountDialog component with handle confirmation"
```

---

### Task 3: Create `ConnectedAccountsList.tsx`

**Files:**
- Create: `src/components/providers/ConnectedAccountsList.tsx`

This is a client component that takes serializable account data, renders the list with disconnect buttons, manages dialog open state locally.

- [ ] **Step 1: Create the component**

Create `src/components/providers/ConnectedAccountsList.tsx`:

```tsx
'use client';

import React, { useState } from 'react';
import { DataRow } from '@/components/design-system/DataRow';
import { Mono } from '@/components/design-system/Typography';
import { DisconnectAccountDialog } from './DisconnectAccountDialog';
import { colors } from '@/themes/ai-lichiditate/tokens';

interface Account {
  id: string;
  display_name: string;
  handle: string | null;
  provider_id: string;
  status: string;
}

interface Props {
  accounts: Account[];
}

export function ConnectedAccountsList({ accounts }: Props) {
  const [disconnectingAccount, setDisconnectingAccount] = useState<Account | null>(null);

  if (accounts.length === 0) {
    return (
      <div
        style={{
          background: colors.bgCard,
          border: `1px solid ${colors.borderDefault}`,
          borderRadius: 6,
          padding: '24px 20px',
          textAlign: 'center',
        }}
      >
        <Mono tone="muted">NICIUN CONT CONECTAT. ADAUGĂ UN CONT MAI JOS.</Mono>
      </div>
    );
  }

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {accounts.map((account) => (
          <div key={account.id} style={{ position: 'relative' }}>
            <DataRow
              label={account.display_name}
              description={account.handle ?? account.provider_id}
              status={account.status.toUpperCase()}
              tone={account.status === 'active' ? 'positive' : 'negative'}
              action={
                <button
                  onClick={() => setDisconnectingAccount(account)}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontFamily: 'var(--font-jetbrains-mono), monospace',
                    fontSize: 11,
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    color: colors.accentCoral,
                    padding: '0 4px',
                    marginLeft: 16,
                    flexShrink: 0,
                  }}
                >
                  DEZCONECTEAZĂ
                </button>
              }
            />
          </div>
        ))}
      </div>

      {disconnectingAccount && (
        <DisconnectAccountDialog
          open={disconnectingAccount !== null}
          onClose={() => setDisconnectingAccount(null)}
          account={disconnectingAccount}
        />
      )}
    </>
  );
}
```

- [ ] **Step 2: Check if DataRow supports `action` prop**

Read `src/components/design-system/DataRow.tsx`. If the `DataRowProps` interface doesn't have an `action` prop, we need to add it (the action renders to the right of the status badge).

The current `DataRow` interface is:
```ts
interface DataRowProps {
  label: string;
  description: React.ReactNode;
  status: string;
  tone: 'positive' | 'negative' | 'neutral';
}
```

It does NOT have `action`. Add it:

In `src/components/design-system/DataRow.tsx`, update the interface and render:

```tsx
interface DataRowProps {
  label: string;
  description: React.ReactNode;
  status: string;
  tone: 'positive' | 'negative' | 'neutral';
  action?: React.ReactNode;
}

export function DataRow({ label, description, status, tone, action }: DataRowProps) {
```

And in the content div, after the `{/* Status */}` span, add:
```tsx
{/* Action (optional) */}
{action}
```

Full updated `DataRow.tsx`:

```tsx
'use client';

import React from 'react';
import { colors } from '@/themes/ai-lichiditate/tokens';

interface DataRowProps {
  label: string;
  description: React.ReactNode;
  status: string;
  tone: 'positive' | 'negative' | 'neutral';
  action?: React.ReactNode;
}

export function DataRow({ label, description, status, tone, action }: DataRowProps) {
  const accentColor = tone === 'positive' ? colors.accentLime : tone === 'neutral' ? colors.textSecondary : colors.accentCoral;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'stretch',
        background: colors.bgCard,
        borderRadius: 6,
        overflow: 'hidden',
        border: `1px solid ${colors.borderDefault}`,
        minHeight: 64,
      }}
    >
      {/* Left accent bar */}
      <div
        style={{
          width: 4,
          flexShrink: 0,
          background: accentColor,
        }}
      />
      {/* Content */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          padding: '12px 16px',
          flex: 1,
        }}
      >
        {/* Label */}
        <span
          style={{
            fontFamily: 'var(--font-jetbrains-mono), monospace',
            fontSize: 13,
            fontWeight: 700,
            textTransform: 'uppercase',
            color: colors.textPrimary,
            minWidth: 100,
            flexShrink: 0,
          }}
        >
          {label}
        </span>
        {/* Description */}
        <span
          style={{
            fontFamily: 'var(--font-inter), sans-serif',
            fontSize: 14,
            color: colors.textSecondary,
            flex: 1,
          }}
        >
          {description}
        </span>
        {/* Status */}
        <span
          style={{
            fontFamily: 'var(--font-jetbrains-mono), monospace',
            fontSize: 11,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: accentColor,
            flexShrink: 0,
          }}
        >
          {status}
        </span>
        {/* Action (optional) */}
        {action}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
pnpm tsc --noEmit 2>&1 | head -30
```

Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/providers/ConnectedAccountsList.tsx src/components/design-system/DataRow.tsx
git commit -m "feat: ConnectedAccountsList client component with disconnect button"
```

---

### Task 4: Update `accounts/page.tsx` to use `ConnectedAccountsList`

**Files:**
- Modify: `src/app/dashboard/accounts/page.tsx`

The server component currently renders `DataRow` inline inside a `.map()`. Replace that section (and the empty state div) with `<ConnectedAccountsList accounts={accounts ?? []} />`.

- [ ] **Step 1: Update the page**

Full updated `src/app/dashboard/accounts/page.tsx`:

```tsx
import React from 'react';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { listProviderManifests } from '@/config/providers.manifests';
import { Eyebrow, H2 } from '@/components/design-system/Typography';
import { AvailableProvidersGrid } from '@/components/providers/AvailableProvidersGrid';
import { ConnectedAccountsList } from '@/components/providers/ConnectedAccountsList';
import { connectProviderAction } from './actions';

export default async function AccountsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: accounts } = await supabase
    .from('accounts')
    .select('id, display_name, handle, provider_id, status')
    .eq('user_id', user!.id)
    .order('created_at', { ascending: false });

  const providerManifests = listProviderManifests();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 48 }}>
      {/* Connected accounts */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div>
          <Eyebrow>CONTURI · CONECTATE</Eyebrow>
          <div style={{ marginTop: 8 }}>
            <H2>CONTURI CONECTATE</H2>
          </div>
        </div>

        <ConnectedAccountsList accounts={accounts ?? []} />
      </section>

      {/* Available providers */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div>
          <Eyebrow>PROVIDERI · DISPONIBILI</Eyebrow>
          <div style={{ marginTop: 8 }}>
            <H2>CONECTEAZĂ UN CONT</H2>
          </div>
        </div>

        <AvailableProvidersGrid
          providers={providerManifests}
          onConnectAction={connectProviderAction}
        />
      </section>
    </div>
  );
}
```

Note: The select query is now explicit (`id, display_name, handle, provider_id, status`) instead of `*` — this ensures the shape matches the `Account` interface in `ConnectedAccountsList`.

- [ ] **Step 2: Verify TypeScript and build**

```bash
pnpm tsc --noEmit 2>&1 | head -40
```

Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/dashboard/accounts/page.tsx
git commit -m "feat: wire ConnectedAccountsList into accounts page"
```

---

### Task 5: Session persistence — switch server/middleware files to use `env`

**Files:**
- Modify: `src/lib/supabase/server.ts`
- Modify: `src/lib/supabase/middleware.ts`
- DO NOT modify: `src/lib/supabase/client.ts` — uses `process.env.NEXT_PUBLIC_*!` which is correct for browser (env.ts validates server-only vars that are absent in browser and would cause zod failure)

**Why:** Using `env` from `@/lib/env` gives compile-time type safety and fails fast at server startup if vars are missing, instead of silently passing `undefined` as a string.

- [ ] **Step 1: Update `server.ts`**

Full updated `src/lib/supabase/server.ts`:

```ts
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { env } from '@/lib/env';

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Server component — cookies can't be set here, middleware handles session
          }
        },
      },
    }
  );
}

export async function createSupabaseRouteHandlerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        },
      },
    }
  );
}

export function createSupabaseServiceClient() {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY not set');
  return createClient(url, key);
}
```

- [ ] **Step 2: Update `middleware.ts`**

Full updated `src/lib/supabase/middleware.ts`:

```ts
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { env } from '@/lib/env';

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  await supabase.auth.getUser();

  return supabaseResponse;
}
```

- [ ] **Step 3: Verify TypeScript and build**

```bash
pnpm tsc --noEmit 2>&1 | head -40
pnpm build 2>&1 | tail -20
```

Expected: zero TypeScript errors, build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/lib/supabase/server.ts src/lib/supabase/middleware.ts
git commit -m "fix: use env module in supabase server/middleware clients"
```

---

### Task 6: Final verification

- [ ] **Step 1: Run lint**

```bash
pnpm lint 2>&1 | tail -20
```

Expected: no errors.

- [ ] **Step 2: Run dev and verify UI**

```bash
pnpm dev
```

Navigate to `http://localhost:3000/dashboard/accounts`.

Verify:
- Each connected account row shows `DEZCONECTEAZĂ` in coral on the right
- Clicking opens modal with eyebrow `ACȚIUNE · DEZCONECTARE`, title, destructive warning, handle input
- Typing wrong handle keeps confirm button disabled
- Typing exact handle enables confirm button
- Clicking ANULEAZĂ closes without changes
- Clicking DEZCONECTEAZĂ deletes the account, dialog closes, page re-renders without the account

- [ ] **Step 3: Verify session persistence**

1. Log in
2. Quit browser entirely (Cmd+Q)
3. Reopen browser, navigate to `http://localhost:3000/dashboard`
4. Expected: still logged in, no redirect to `/login`
5. DevTools → Application → Cookies → `http://localhost:3000` → confirm `sb-*-auth-token` cookie has future `Expires` (not "Session")

---

## Self-Review

### Spec coverage check

| Requirement | Task |
|---|---|
| `disconnectAccountAction` with ownership check + handle confirmation | Task 1 |
| Returns structured result, not throws | Task 1 |
| `revalidatePath` for 4 paths | Task 1 |
| Disconnect button on each row, coral, mono font | Task 3 |
| Dialog with eyebrow ACȚIUNE·DEZCONECTARE | Task 2 |
| Dialog: destructive warning in coral | Task 2 |
| Dialog: handle input + enable button only on match | Task 2 |
| Dialog: loading state, error display | Task 2 |
| Romanian error messages (all 4 cases) | Task 2 |
| ANULEAZĂ / DEZCONECTEAZĂ buttons | Task 2 |
| `disconnectingAccount` state pattern, one dialog instance | Task 3 |
| Session: server.ts uses env | Task 5 |
| Session: middleware.ts uses env | Task 5 |
| Session: client.ts keeps process.env (browser safe) | noted, no change |
| accounts/page.tsx passes serializable data shape | Task 4 |

### Placeholder scan

No TBDs or vague steps. All code blocks are complete.

### Type consistency

- `Account` interface in `ConnectedAccountsList.tsx`: `{ id, display_name, handle, provider_id, status }`
- `Props.account` in `DisconnectAccountDialog.tsx`: `{ id, display_name, handle, provider_id }` (subset — status not needed by dialog)
- `accounts/page.tsx` select query: `id, display_name, handle, provider_id, status` — matches Account interface exactly
- `disconnectAccountAction(accountId: string, confirmationHandle: string)` matches call in `DisconnectAccountDialog`: `disconnectAccountAction(account.id, typed)`
