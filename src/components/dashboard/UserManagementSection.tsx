'use client';

import React, { useState, useTransition } from 'react';
import { colors } from '@/themes/platform/tokens';
import { Eyebrow } from '@/components/design-system/Typography';
import { Button } from '@/components/design-system/Button';
import { inviteUserAction, revokeInviteAction, removeViewerAction } from '@/app/dashboard/settings/actions';

interface Viewer {
  userId: string;
  displayName: string | null;
  createdAt: string;
}

interface PendingInvite {
  id: string;
  email: string;
  expiresAt: string;
  createdAt: string;
}

interface Props {
  viewers: Viewer[];
  pendingInvites: PendingInvite[];
}

const mono = (fontSize = 13, color = colors.textPrimary): React.CSSProperties => ({
  fontFamily: 'var(--font-jetbrains-mono), monospace',
  fontSize,
  color,
});

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('ro-RO', { day: 'numeric', month: 'short', year: 'numeric' });
}

function daysUntil(iso: string) {
  const diff = new Date(iso).getTime() - Date.now();
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
}

export function UserManagementSection({ viewers: initialViewers, pendingInvites: initialInvites }: Props) {
  const [viewers, setViewers] = useState(initialViewers);
  const [pendingInvites, setPendingInvites] = useState(initialInvites);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleInvite() {
    if (!inviteEmail) return;
    setInviteError(null);
    startTransition(async () => {
      const result = await inviteUserAction(inviteEmail);
      if (result.success) {
        setInviteUrl(result.inviteUrl);
        setInviteEmail('');
        setPendingInvites((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            email: inviteEmail,
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
            createdAt: new Date().toISOString(),
          },
        ]);
      } else {
        setInviteError(result.error);
      }
    });
  }

  function handleCopy() {
    if (!inviteUrl) return;
    navigator.clipboard.writeText(inviteUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function handleRevoke(inviteId: string) {
    startTransition(async () => {
      await revokeInviteAction(inviteId);
      setPendingInvites((prev) => prev.filter((i) => i.id !== inviteId));
    });
  }

  function handleRemoveViewer(userId: string) {
    startTransition(async () => {
      await removeViewerAction(userId);
      setViewers((prev) => prev.filter((v) => v.userId !== userId));
    });
  }

  const cardStyle: React.CSSProperties = {
    background: colors.bgCard,
    border: `1px solid ${colors.borderDefault}`,
    borderRadius: 6,
    padding: '16px 20px',
  };

  const inputStyle: React.CSSProperties = {
    flex: 1,
    background: colors.bgCard,
    border: `1px solid ${colors.borderDefault}`,
    borderRadius: 4,
    padding: '8px 12px',
    fontFamily: 'var(--font-jetbrains-mono), monospace',
    fontSize: 12,
    color: colors.textPrimary,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Active viewers */}
      <div>
        <div style={{ marginBottom: 12 }}>
          <Eyebrow tone="muted">VIEWERS ACTIVI</Eyebrow>
        </div>
        {viewers.length === 0 ? (
          <div style={cardStyle}>
            <span style={mono(12, colors.textMuted)}>NICIUN VIEWER ACTIV.</span>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {viewers.map((v) => (
              <div
                key={v.userId}
                style={{ ...cardStyle, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <div>
                  <span style={mono()}>{v.displayName ?? v.userId.slice(0, 8) + '...'}</span>
                  <div style={{ marginTop: 2 }}>
                    <span style={mono(10, colors.textMuted)}>
                      SE ALĂTURAT {formatDate(v.createdAt)} · VIEWER
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => handleRemoveViewer(v.userId)}
                  disabled={isPending}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontFamily: 'var(--font-jetbrains-mono), monospace',
                    fontSize: 11,
                    fontWeight: 600,
                    color: colors.accentCoral,
                    padding: 0,
                  }}
                >
                  ELIMINĂ
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pending invitations */}
      <div>
        <div style={{ marginBottom: 12 }}>
          <Eyebrow tone="muted">INVITAȚII ACTIVE</Eyebrow>
        </div>
        {pendingInvites.length === 0 ? (
          <div style={cardStyle}>
            <span style={mono(12, colors.textMuted)}>NICIO INVITAȚIE ACTIVĂ.</span>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {pendingInvites.map((inv) => (
              <div
                key={inv.id}
                style={{ ...cardStyle, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}
              >
                <div>
                  <span style={mono()}>{inv.email}</span>
                  <div style={{ marginTop: 2 }}>
                    <span style={mono(10, colors.textMuted)}>
                      EXPIRĂ ÎN {daysUntil(inv.expiresAt)} ZILE
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => handleRevoke(inv.id)}
                  disabled={isPending}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontFamily: 'var(--font-jetbrains-mono), monospace',
                    fontSize: 11,
                    fontWeight: 600,
                    color: colors.textSecondary,
                    padding: 0,
                    flexShrink: 0,
                  }}
                >
                  REVOCĂ
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Invite new user */}
      <div>
        <div style={{ marginBottom: 12 }}>
          <Eyebrow tone="muted">INVITĂ VIEWER NOU</Eyebrow>
        </div>
        <div style={cardStyle}>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="email@domain.com"
              style={inputStyle}
              onKeyDown={(e) => e.key === 'Enter' && handleInvite()}
            />
            <Button onClick={handleInvite} disabled={isPending || !inviteEmail}>
              → TRIMITE
            </Button>
          </div>
          {inviteError && (
            <div style={{ marginTop: 8 }}>
              <span style={mono(11, colors.accentCoral)}>{inviteError}</span>
            </div>
          )}
          <div style={{ marginTop: 12 }}>
            <span style={mono(10, colors.textMuted)}>
              Userul invitat va primi rol VIEWER — poate vizualiza date și folosi chat-ul, dar nu poate modifica conturi sau genera analize.
            </span>
          </div>
        </div>
      </div>

      {/* Invite URL modal */}
      {inviteUrl && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 24,
          }}
          onClick={() => setInviteUrl(null)}
        >
          <div
            style={{
              background: colors.bgCard,
              border: `1px solid ${colors.borderDefault}`,
              borderRadius: 8,
              padding: 32,
              maxWidth: 480,
              width: '100%',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ marginBottom: 16 }}>
              <Eyebrow tone="lime">INVITAȚIE CREATĂ</Eyebrow>
            </div>
            <p style={{ margin: '0 0 16px', fontFamily: 'var(--font-inter), sans-serif', fontSize: 15, color: colors.textSecondary }}>
              Link valid 7 zile. Trimite-l manual prin email sau WhatsApp:
            </p>
            <div
              style={{
                background: colors.bg,
                border: `1px solid ${colors.borderDefault}`,
                borderRadius: 4,
                padding: '10px 12px',
                wordBreak: 'break-all',
                marginBottom: 20,
              }}
            >
              <span style={mono(11)}>{inviteUrl}</span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button onClick={handleCopy}>
                {copied ? '✓ COPIAT' : 'COPIAZĂ LINK'}
              </Button>
              <button
                onClick={() => setInviteUrl(null)}
                style={{
                  background: 'none',
                  border: `1px solid ${colors.borderDefault}`,
                  borderRadius: 4,
                  padding: '8px 16px',
                  cursor: 'pointer',
                  fontFamily: 'var(--font-jetbrains-mono), monospace',
                  fontSize: 11,
                  fontWeight: 600,
                  color: colors.textSecondary,
                }}
              >
                ÎNCHIDE
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
