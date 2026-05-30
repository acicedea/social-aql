'use client';

import { useEffect, useState } from 'react';

interface Conversation {
  id: string;
  title: string | null;
  updated_at: string;
  message_count: number;
  last_message_preview: string | null;
  account_id: string | null;
}

interface Props {
  accountId: string;
  activeConversationId: string | null;
  onSelect: (id: string) => void;
}

export function ConversationList({ accountId, activeConversationId, onSelect }: Props) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/chat/conversations?accountId=${accountId}`)
      .then(r => r.json())
      .then(setConversations)
      .catch(console.error);
  }, [accountId, activeConversationId]);

  const deleteConversation = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    await fetch(`/api/chat/conversations?id=${id}`, { method: 'DELETE' });
    setConversations(prev => prev.filter(c => c.id !== id));
  };

  const relativeTime = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    return `${Math.floor(hrs / 24)}z`;
  };

  if (conversations.length === 0) {
    return (
      <div style={{ padding: '12px 16px' }}>
        <span style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 11, color: 'var(--color-text-muted)' }}>Nicio conversație încă</span>
      </div>
    );
  }

  return (
    <div style={{ overflowY: 'auto', flex: 1 }}>
      {conversations.map(conv => {
        const isActive = conv.id === activeConversationId;
        const isHovered = conv.id === hoveredId;

        return (
          <div
            key={conv.id}
            onClick={() => onSelect(conv.id)}
            onMouseEnter={() => setHoveredId(conv.id)}
            onMouseLeave={() => setHoveredId(null)}
            style={{
              padding: '10px 16px',
              cursor: 'pointer',
              borderLeft: isActive ? '3px solid var(--color-accent-lime)' : '3px solid transparent',
              background: isActive ? 'rgba(255,255,255,0.04)' : isHovered ? 'rgba(255,255,255,0.02)' : 'transparent',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              gap: 8,
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 13,
                color: 'var(--color-text-primary)',
                fontFamily: 'var(--font-inter)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {conv.title ?? 'Conversație nouă'}
              </div>
              {conv.last_message_preview && (
                <span style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, color: 'var(--color-text-muted)', marginTop: 2, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {conv.last_message_preview}
                </span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
              <span style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, color: 'var(--color-text-muted)' }}>{relativeTime(conv.updated_at)}</span>
              {isHovered && (
                <button
                  onClick={(e) => deleteConversation(e, conv.id)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--color-text-secondary)',
                    cursor: 'pointer',
                    padding: '0 2px',
                    fontSize: 14,
                    lineHeight: 1,
                  }}
                >
                  ×
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
