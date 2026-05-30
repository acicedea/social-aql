import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseRouteHandlerClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const supabase = await createSupabaseRouteHandlerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const accountId = request.nextUrl.searchParams.get('accountId');

  let query: any = supabase
    .from('chat_conversations')
    .select('id, title, updated_at, message_count, last_message_preview, account_id')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })
    .limit(20);

  if (accountId) query = query.eq('account_id', accountId);

  const { data } = await query;
  return NextResponse.json(data ?? []);
}

export async function DELETE(request: NextRequest) {
  const supabase = await createSupabaseRouteHandlerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const id = request.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  await supabase
    .from('chat_conversations')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  return NextResponse.json({ success: true });
}
