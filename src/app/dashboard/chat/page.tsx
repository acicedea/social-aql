import { createSupabaseServerClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { ChatInterface } from '@/components/chat/ChatInterface';

interface Props {
  searchParams: Promise<{ conversation?: string; account?: string }>;
}

export default async function ChatPage({ searchParams }: Props) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const params = await searchParams;

  const { data: accounts } = await supabase
    .from('accounts')
    .select('id, display_name, handle, provider_id, status')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .order('created_at');

  if (!accounts || accounts.length === 0) {
    redirect('/dashboard/accounts');
  }

  const activeAccountId = params.account ?? accounts[0].id;
  const activeAccount = accounts.find(a => a.id === activeAccountId) ?? accounts[0];

  let initialMessages: Array<{ id: string; role: string; content: string; created_at: string }> = [];
  if (params.conversation) {
    const { data: msgs } = await supabase
      .from('chat_messages')
      .select('id, role, content, created_at')
      .eq('conversation_id', params.conversation)
      .order('created_at', { ascending: true });
    initialMessages = msgs ?? [];
  }

  return (
    <ChatInterface
      accounts={accounts}
      activeAccount={activeAccount}
      initialConversationId={params.conversation ?? null}
      initialMessages={initialMessages}
    />
  );
}
