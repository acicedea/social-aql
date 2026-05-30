-- =====================================================================
-- 0005: AI Chat — conversations and messages
-- =====================================================================

create table public.chat_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid references public.accounts(id) on delete set null,
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  message_count integer not null default 0,
  last_message_preview text
);

create index chat_conversations_user_id_idx
  on public.chat_conversations(user_id, updated_at desc);

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'tool')),
  content text not null,
  tool_calls jsonb,
  tool_results jsonb,
  tokens_used integer,
  created_at timestamptz not null default now()
);

create index chat_messages_conversation_id_idx
  on public.chat_messages(conversation_id, created_at asc);

-- RLS
alter table public.chat_conversations enable row level security;
alter table public.chat_messages enable row level security;

create policy "chat_conversations_owner" on public.chat_conversations
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "chat_messages_owner" on public.chat_messages
  for all using (
    exists (
      select 1 from public.chat_conversations c
      where c.id = conversation_id and c.user_id = auth.uid()
    )
  );

-- updated_at trigger
create trigger chat_conversations_touch before update on public.chat_conversations
  for each row execute function public.touch_updated_at();
