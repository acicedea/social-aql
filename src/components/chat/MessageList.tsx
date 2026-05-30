'use client';

import { MessageBubble } from './MessageBubble';
import type { ChatMessage } from '@/ai/chat/types';

interface Props {
  messages: ChatMessage[];
}

export function MessageList({ messages }: Props) {
  return (
    <div>
      {messages.map(m => (
        <MessageBubble key={m.id} message={m} />
      ))}
    </div>
  );
}
