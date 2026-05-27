# Sync Flow / Dashboard States / Session Persistence / Manual Re-sync Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix four bugs: wire Meta OAuth callback → syncAccount, add 3-state dashboard, add session persistence diagnostic, add manual Sync button per account row.

**Architecture:** Bug fixes are independent — each touches a different file. Execute in order: Bug1 → Bug2 → Bug3 → Bug4. No new abstractions. Surgical edits only.

**Tech Stack:** Next.js 14 App Router, Supabase SSR (`@supabase/ssr`), TypeScript, server actions, `useTransition` for async UI.

---

## File Map

| File | Change |
|------|--------|
| `src/app/(auth)/auth/callback/meta/route.ts` | Add `.select('id').single()` + syncAccount call with error path |
| `src/app/dashboard/page.tsx` | Rewrite for 3-state logic (A/B/C) with post count query |
| `src/lib/supabase/middleware.ts` | Add diagnostic console.log lines |
| `src/app/dashboard/layout.tsx` | Add diagnostic console.log lines |
| `src/app/dashboard/accounts/actions.ts` | Add `syncAccountAction` |
| `src/app/dashboard/accounts/page.tsx` | Add `last_sync_at` to select query |
| `src/components/providers/ConnectedAccountsList.tsx` | Extend Account type + add Sync button |
| `src/components/providers/SyncAccountButton.tsx` | **New** — isolated sync button client component |

---

## Task 1: Bug 1 — Wire syncAccount into Meta OAuth callback

**Files:**
- Modify: `src/app/(auth)/auth/callback/meta/route.ts`

Current: upsert on line 64-76 has no `.select()`, no syncAccount call. Redirect on line 78 fires immediately.

- [ ] **Step 1: Read the file to confirm current state**

Lines 54-81 in `src/app/(auth)/auth/callback/meta/route.ts`:
```ts
if (igAccounts.length === 1) {
  // ... builds token ...
  await supabase.from('accounts').upsert(
    { ... },
    { onConflict: 'user_id,provider_id,external_account_id' }
  );

  const response = NextResponse.redirect(`${origin}/dashboard/accounts`);
  response.cookies.delete('meta_instagram_oauth_state');
  return response;
}
```

- [ ] **Step 2: Add syncAccount import and rewrite the single-account block**

Add import at top (after existing imports):
```ts
import { syncAccount } from '@/lib/sync/sync-account';
```

Replace the single-account block (lines 54-81). New code:

```ts
if (igAccounts.length === 1) {
  const ig = igAccounts[0];
  const pageId = (ig.raw as { pageId: string }).pageId;
  const token = await buildTokenForPage(
    userToken,
    pageId,
    partialToken.expiresAt ??
      new Date(Date.now() + 5_184_000_000).toISOString()
  );

  const { data: row } = await supabase
    .from('accounts')
    .upsert(
      {
        user_id: user.id,
        provider_id: 'meta-instagram',
        external_account_id: ig.externalId,
        display_name: ig.displayName,
        handle: ig.handle,
        avatar_url: ig.avatarUrl,
        encrypted_tokens: encryptJson(token),
        status: 'active',
      },
      { onConflict: 'user_id,provider_id,external_account_id' }
    )
    .select('id')
    .single();

  try {
    if (row) {
      await syncAccount(row.id, user.id);
    }
  } catch (syncError) {
    console.error('[meta callback] initial sync failed:', syncError);
    if (row) {
      await supabase
        .from('accounts')
        .update({
          last_sync_error:
            syncError instanceof Error ? syncError.message : String(syncError),
          status: 'error',
        })
        .eq('id', row.id);
    }
    const response = NextResponse.redirect(
      `${origin}/dashboard/accounts?warning=initial_sync_failed`
    );
    response.cookies.delete('meta_instagram_oauth_state');
    return response;
  }

  const response = NextResponse.redirect(`${origin}/dashboard/accounts`);
  response.cookies.delete('meta_instagram_oauth_state');
  return response;
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /Users/project.cicedea/Documents/repos/ai-lichiditate-aql && pnpm tsc --noEmit 2>&1 | head -30
```

Expected: zero errors related to this file.

- [ ] **Step 4: Commit**

```bash
git add src/app/(auth)/auth/callback/meta/route.ts
git commit -m "feat: wire syncAccount into Meta OAuth callback"
```

---

## Task 2: Bug 2 — Three-state dashboard home page

**Files:**
- Modify: `src/app/dashboard/page.tsx`

Current page has State A (no accounts) correct, but combines everything else into one block. Need to add a post count query and split into State B (accounts but no posts) and State C (accounts + posts).

- [ ] **Step 1: Write the new page.tsx**

Replace the entire file with:

```tsx
import React from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { colors } from '@/themes/ai-lichiditate/tokens';
import { Eyebrow, H1, Body, Mono } from '@/components/design-system/Typography';
import { Button } from '@/components/design-system/Button';
import { Card } from '@/components/design-system/Card';
import { DataRow } from '@/components/design-system/DataRow';

function relativeTime(isoString: string | null): string {
  if (!isoString) return 'Nicio sincronizare încă';
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'Acum';
  if (mins < 60) return `Acum ${mins} minut${mins === 1 ? '' : 'e'}`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `Acum ${hrs} or${hrs === 1 ? 'ă' : 'e'}`;
  const days = Math.floor(hrs / 24);
  return `Acum ${days} zi${days === 1 ? '' : 'le'}`;
}

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: accounts } = await supabase
    .from('accounts')
    .select(
      'id, display_name, handle, provider_id, status, last_sync_at, last_sync_error'
    )
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  const hasAccounts = (accounts?.length ?? 0) > 0;

  // Only query posts if we have accounts
  let postCount = 0;
  if (hasAccounts) {
    const accountIds = (accounts ?? []).map((a) => a.id);
    const { count } = await supabase
      .from('posts')
      .select('id', { count: 'exact', head: true })
      .in(
        'account_id',
        accountIds.length > 0
          ? accountIds
          : ['00000000-0000-0000-0000-000000000000']
      );
    postCount = count ?? 0;
  }

  const hasPosts = postCount > 0;

  // --- State A: no accounts ---
  if (!hasAccounts) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '60vh',
          gap: 24,
          textAlign: 'center',
        }}
      >
        <Eyebrow>DASHBOARD · STARE</Eyebrow>
        <H1 accent={{ text: 'NICIUN CONT', tone: 'coral' }}>
          NICIUN CONT CONECTAT.
        </H1>
        <Body tone="secondary">
          Conectează primul tău cont pentru a începe analiza.
        </Body>
        <Link href="/dashboard/accounts" style={{ textDecoration: 'none', marginTop: 8 }}>
          <Button variant="ghost">→ CONECTEAZĂ UN CONT</Button>
        </Link>
      </div>
    );
  }

  // --- State B: accounts but no posts yet ---
  if (!hasPosts) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
        <div>
          <Eyebrow>DASHBOARD · SINCRONIZARE</Eyebrow>
          <div style={{ marginTop: 8 }}>
            <H1 accent={{ text: 'ÎN CURS', tone: 'lime' }}>
              SINCRONIZARE ÎN CURS.
            </H1>
          </div>
          <div style={{ marginTop: 12 }}>
            <Body tone="secondary">
              Conturile tale sunt conectate. Datele se sincronizează în background.
              Reîmprospătează pagina în câteva minute.
            </Body>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {(accounts ?? []).map((account) => (
            <DataRow
              key={account.id}
              label={account.display_name}
              description={
                <span>
                  {account.handle ?? account.provider_id}
                  <span
                    style={{
                      marginLeft: 12,
                      fontSize: 11,
                      color: colors.textMuted,
                      fontFamily: 'var(--font-jetbrains-mono), monospace',
                    }}
                  >
                    {relativeTime(account.last_sync_at)}
                  </span>
                </span>
              }
              status={account.status.toUpperCase()}
              tone={account.status === 'active' ? 'positive' : 'neutral'}
            />
          ))}
        </div>

        <Link
          href="/dashboard/accounts"
          style={{
            fontFamily: 'var(--font-jetbrains-mono), monospace',
            fontSize: 11,
            color: colors.accentLime,
            textDecoration: 'none',
          }}
        >
          → VEZI CONTURILE
        </Link>
      </div>
    );
  }

  // --- State C: accounts + posts synced ---
  // Fetch post counts per account
  const accountIds = (accounts ?? []).map((a) => a.id);
  const postCountsByAccount: Record<string, number> = {};
  for (const acc of accounts ?? []) {
    const { count } = await supabase
      .from('posts')
      .select('id', { count: 'exact', head: true })
      .eq('account_id', acc.id)
      .gte(
        'published_at',
        new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
      );
    postCountsByAccount[acc.id] = count ?? 0;
  }

  // Fetch latest follower count per account
  const followersByAccount: Record<string, number | null> = {};
  if (accountIds.length > 0) {
    for (const acc of accounts ?? []) {
      const { data: snap } = await supabase
        .from('account_metrics_snapshots')
        .select('followers')
        .eq('account_id', acc.id)
        .order('captured_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      followersByAccount[acc.id] = snap?.followers ?? null;
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
      <div>
        <Eyebrow>DASHBOARD · OVERVIEW</Eyebrow>
        <div style={{ marginTop: 8 }}>
          <H1>OVERVIEW.</H1>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: 16,
        }}
      >
        {(accounts ?? []).map((account) => (
          <Card key={account.id} variant="default">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <Eyebrow tone="lime">{account.handle ?? account.display_name}</Eyebrow>
                <div style={{ marginTop: 4 }}>
                  <span
                    style={{
                      fontFamily: 'var(--font-league-spartan), sans-serif',
                      fontSize: 20,
                      fontWeight: 700,
                      color: colors.textPrimary,
                    }}
                  >
                    {account.display_name}
                  </span>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 24 }}>
                <div>
                  <Mono tone="muted">POSTĂRI (30Z)</Mono>
                  <div>
                    <Mono tone="lime">
                      {postCountsByAccount[account.id] ?? 0}
                    </Mono>
                  </div>
                </div>
                {followersByAccount[account.id] != null && (
                  <div>
                    <Mono tone="muted">URMĂRITORI</Mono>
                    <div>
                      <Mono tone="lime">
                        {followersByAccount[account.id]!.toLocaleString('ro-RO')}
                      </Mono>
                    </div>
                  </div>
                )}
              </div>

              <span
                style={{
                  fontFamily: 'var(--font-jetbrains-mono), monospace',
                  fontSize: 10,
                  color: 'var(--color-text-muted)',
                }}
              >
                {relativeTime(account.last_sync_at)}
              </span>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/project.cicedea/Documents/repos/ai-lichiditate-aql && pnpm tsc --noEmit 2>&1 | head -30
```

Expected: zero new errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/dashboard/page.tsx
git commit -m "feat: three-state dashboard home (no accounts / syncing / overview)"
```

---

## Task 3: Bug 3 — Session persistence diagnostic logging

**Files:**
- Modify: `src/lib/supabase/middleware.ts`
- Modify: `src/app/dashboard/layout.tsx`

These logs are TEMPORARY. After Andrei runs the scenario and reports findings, a follow-up edit removes them and applies the identified fix.

- [ ] **Step 1: Add diagnostic logging to middleware**

Replace `src/lib/supabase/middleware.ts` with:

```ts
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { env } from '@/lib/env';

export async function updateSession(request: NextRequest) {
  console.log('[mw] entering for path:', request.nextUrl.pathname);
  console.log(
    '[mw] incoming cookies:',
    request.cookies.getAll().map((c) => c.name).join(', ')
  );

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

  const { data: { user }, error } = await supabase.auth.getUser();
  console.log('[mw] getUser result:', {
    userId: user?.id ?? null,
    errorMessage: error?.message ?? null,
  });

  return supabaseResponse;
}
```

- [ ] **Step 2: Add diagnostic logging to dashboard layout**

Replace `src/app/dashboard/layout.tsx` with:

```tsx
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/layout/AppShell';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  console.log('[dashboard layout] user:', user?.id, 'error:', error?.message);

  if (!user) {
    console.log('[dashboard layout] redirecting to /login because no user');
    redirect('/login');
  }

  return (
    <AppShell userEmail={user.email ?? ''} pageTitle="Dashboard">
      {children}
    </AppShell>
  );
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /Users/project.cicedea/Documents/repos/ai-lichiditate-aql && pnpm tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 4: Commit diagnostic logs**

```bash
git add src/lib/supabase/middleware.ts src/app/dashboard/layout.tsx
git commit -m "debug: add session persistence diagnostic logging"
```

> **PAUSE HERE** — Andrei runs the close-and-reopen scenario and reads terminal output. Then apply the fix from Task 3b below based on findings.

---

## Task 3b: Bug 3 — Apply fix and remove logs

This task runs AFTER Andrei reports what the logs showed.

**Decision tree:**

| Log output | Root cause | Fix |
|---|---|---|
| `incoming cookies:` is empty on reopen | Cookie not persisted (browser deleted it) | Check cookie `Expires` in DevTools — if `Session`, the Supabase client isn't setting `maxAge`. Set `NEXT_PUBLIC_SUPABASE_URL` correctly so `@supabase/ssr` can derive the project ref. |
| Cookies present, `getUser` returns `errorMessage: 'JWT expired'` | Token expired, not refreshing | Middleware's `setAll` isn't writing refreshed cookies back to response. Verify the `setAll` implementation rebuilds `supabaseResponse` correctly (current impl does — may be a build cache issue; try `pnpm build` clean). |
| Cookies present, middleware `userId` present, layout `user` is null | Two separate Supabase clients, second doesn't see refreshed token | `createSupabaseServerClient` swallows `setAll` errors in server components — that's intentional. But if the refreshed token wasn't written to the cookie store, the layout client reads the old (expired) token. Fix: ensure middleware runs before layout auth check (it does via Next.js config). |
| All logs show valid user but UI redirects | Client-side `onAuthStateChange` listener fires with stale state | In `src/lib/supabase/client.ts`, check if there's a listener that calls `router.push('/login')` on `SIGNED_OUT`. If the browser session cookie is `sb-*-auth-token.1` (chunked), old listener code may misread it. |

**After identifying root cause and applying fix:**

- [ ] **Step 1: Remove all diagnostic console.log statements**

From `src/lib/supabase/middleware.ts` remove the 3 console.log lines added in Task 3.
From `src/app/dashboard/layout.tsx` remove the 2 console.log lines added in Task 3.

Restore `layout.tsx` to its original form (without error destructuring — `getUser` return is just `{ data: { user } }`):

```tsx
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/layout/AppShell';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  return (
    <AppShell userEmail={user.email ?? ''} pageTitle="Dashboard">
      {children}
    </AppShell>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/project.cicedea/Documents/repos/ai-lichiditate-aql && pnpm tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/supabase/middleware.ts src/app/dashboard/layout.tsx
git commit -m "fix: session persistence — <describe root cause here>"
```

---

## Task 4: Bug 4 — Manual sync button

**Files:**
- Modify: `src/app/dashboard/accounts/actions.ts` — add `syncAccountAction`
- Modify: `src/app/dashboard/accounts/page.tsx` — add `last_sync_at` to query
- Create: `src/components/providers/SyncAccountButton.tsx`
- Modify: `src/components/providers/ConnectedAccountsList.tsx` — extend Account type, render SyncAccountButton

### 4a — Add syncAccountAction

- [ ] **Step 1: Add syncAccountAction to actions.ts**

At end of `src/app/dashboard/accounts/actions.ts`, add:

```ts
export async function syncAccountAction(
  accountId: string
): Promise<{ success: true; postsCount: number } | { success: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'unauthenticated' };

  const { data: account } = await supabase
    .from('accounts')
    .select('id')
    .eq('id', accountId)
    .eq('user_id', user.id)
    .single();
  if (!account) return { success: false, error: 'not_found' };

  try {
    const result = await syncAccount(accountId, user.id);
    revalidatePath('/dashboard');
    revalidatePath('/dashboard/accounts');
    revalidatePath('/dashboard/posts');
    return { success: true, postsCount: result.postsInserted };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown_sync_error';
    await supabase
      .from('accounts')
      .update({ last_sync_error: message })
      .eq('id', accountId);
    return { success: false, error: message };
  }
}
```

### 4b — Create SyncAccountButton component

- [ ] **Step 2: Create `src/components/providers/SyncAccountButton.tsx`**

```tsx
'use client';

import React, { useTransition, useState } from 'react';
import { syncAccountAction } from '@/app/dashboard/accounts/actions';
import { colors } from '@/themes/ai-lichiditate/tokens';

interface Props {
  accountId: string;
}

export function SyncAccountButton({ accountId }: Props) {
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);

  function handleSync() {
    setFeedback(null);
    startTransition(async () => {
      const result = await syncAccountAction(accountId);
      if (result.success) {
        setFeedback({ ok: true, msg: `Sincronizat: ${result.postsCount} postări` });
      } else {
        setFeedback({ ok: false, msg: result.error });
      }
      // Auto-clear feedback after 4 seconds
      setTimeout(() => setFeedback(null), 4000);
    });
  }

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
        onClick={handleSync}
        disabled={isPending}
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
    </span>
  );
}
```

### 4c — Extend ConnectedAccountsList

- [ ] **Step 3: Update Account interface and render SyncAccountButton in ConnectedAccountsList.tsx**

```tsx
'use client';

import React, { useState } from 'react';
import { DataRow } from '@/components/design-system/DataRow';
import { Mono } from '@/components/design-system/Typography';
import { DisconnectAccountDialog } from './DisconnectAccountDialog';
import { SyncAccountButton } from './SyncAccountButton';
import { colors } from '@/themes/ai-lichiditate/tokens';

interface Account {
  id: string;
  display_name: string;
  handle: string | null;
  provider_id: string;
  status: string;
  last_sync_at: string | null;
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
          <DataRow
            key={account.id}
            label={account.display_name}
            description={account.handle ?? account.provider_id}
            status={account.status.toUpperCase()}
            tone={account.status === 'active' ? 'positive' : 'negative'}
            action={
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                <SyncAccountButton accountId={account.id} />
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
              </span>
            }
          />
        ))}
      </div>

      {disconnectingAccount && (
        <DisconnectAccountDialog
          open
          onClose={() => setDisconnectingAccount(null)}
          account={disconnectingAccount}
        />
      )}
    </>
  );
}
```

### 4d — Update accounts page query to include last_sync_at

- [ ] **Step 4: Add `last_sync_at` to the select in accounts/page.tsx**

In `src/app/dashboard/accounts/page.tsx`, change line 16:

```ts
// Before:
.select('id, display_name, handle, provider_id, status')

// After:
.select('id, display_name, handle, provider_id, status, last_sync_at')
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd /Users/project.cicedea/Documents/repos/ai-lichiditate-aql && pnpm tsc --noEmit 2>&1 | head -30
```

Expected: zero errors.

- [ ] **Step 6: Verify full build passes**

```bash
cd /Users/project.cicedea/Documents/repos/ai-lichiditate-aql && pnpm build 2>&1 | tail -20
```

Expected: `✓ Compiled successfully` or equivalent, zero TypeScript errors.

- [ ] **Step 7: Commit**

```bash
git add \
  src/app/dashboard/accounts/actions.ts \
  src/app/dashboard/accounts/page.tsx \
  src/components/providers/SyncAccountButton.tsx \
  src/components/providers/ConnectedAccountsList.tsx
git commit -m "feat: manual sync button per account row with server action"
```

---

## Final Verification Checklist

- [ ] `pnpm tsc --noEmit` — zero errors
- [ ] `pnpm build` — succeeds
- [ ] `pnpm lint` — passes (or only pre-existing warnings)
- [ ] Meta OAuth connect → terminal shows sync logs → Supabase `posts` table has rows
- [ ] `/dashboard` with no accounts → State A (NICIUN CONT CONECTAT + coral accent)
- [ ] `/dashboard` with accounts but no posts → State B (SINCRONIZARE ÎN CURS + lime accent + DataRow list)
- [ ] `/dashboard` with accounts + posts → State C (OVERVIEW + grid of cards)
- [ ] Sync button on each row in `/dashboard/accounts` — shows feedback inline
- [ ] Close browser → reopen → `/dashboard` — still logged in (after Bug 3 fix applied)
- [ ] Sync does NOT duplicate posts (upsert by `account_id,external_post_id`)
