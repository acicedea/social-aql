import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseRouteHandlerClient } from '@/lib/supabase/server';
import { buildChatSystemPrompt } from '@/ai/chat/system-prompt';
import { CHAT_TOOLS, executeTool } from '@/ai/chat/tools';
import { env } from '@/lib/env';
import forkConfig from '../../../../../fork-config';

const GEMINI_MODEL = forkConfig.ai.chatModel;
const MAX_TOOL_ROUNDS = 5;

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseRouteHandlerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json() as {
    message: string;
    conversationId: string | null;
    accountId: string;
  };

  const { message, conversationId, accountId } = body;

  const { data: account } = await supabase
    .from('accounts')
    .select('id, display_name, handle, provider_id')
    .eq('id', accountId)
    .eq('user_id', user.id)
    .single();

  if (!account) return NextResponse.json({ error: 'Account not found' }, { status: 404 });

  let convId = conversationId;
  if (!convId) {
    const { data: conv } = await supabase
      .from('chat_conversations')
      .insert({
        user_id: user.id,
        account_id: accountId,
        title: message.slice(0, 60),
        last_message_preview: message.slice(0, 100),
      })
      .select('id')
      .single();
    convId = conv!.id;
  }

  const { data: history } = await supabase
    .from('chat_messages')
    .select('role, content')
    .eq('conversation_id', convId)
    .order('created_at', { ascending: true })
    .limit(20);

  await supabase.from('chat_messages').insert({
    conversation_id: convId,
    role: 'user',
    content: message,
  });

  const systemPrompt = buildChatSystemPrompt({
    displayName: account.display_name,
    handle: account.handle ?? account.display_name,
    platform: account.provider_id,
    followerCount: null,
  });

  const contents = [
    ...(history ?? []).map((m: any) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    })),
    { role: 'user', parts: [{ text: message }] },
  ];

  const functionDeclarationsForGemini = {
    functionDeclarations: CHAT_TOOLS.map(t => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    })),
  };

  const apiKey = env.GOOGLE_GENERATIVE_AI_API_KEY!;

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      const send = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        let currentContents = contents;
        let toolRound = 0;
        let finalText = '';
        const allToolCalls: object[] = [];
        const allToolResults: object[] = [];

        while (toolRound < MAX_TOOL_ROUNDS) {
          const geminiRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: currentContents,
                systemInstruction: { parts: [{ text: systemPrompt }] },
                tools: [
                  functionDeclarationsForGemini,
                  { googleSearch: {} },
                ],
                generationConfig: {
                  temperature: 0.7,
                  maxOutputTokens: 2048,
                },
              }),
            }
          );

          if (!geminiRes.ok) {
            const err = await geminiRes.text();
            console.error('[chat] Gemini error:', err);
            send({ type: 'error', message: 'Eroare la generarea răspunsului.' });
            controller.close();
            return;
          }

          const geminiJson = await geminiRes.json() as any;
          const candidate = geminiJson.candidates?.[0];
          const parts = candidate?.content?.parts ?? [];

          const functionCalls = parts.filter((p: any) => p.functionCall);
          const textParts = parts.filter((p: any) => p.text);

          if (functionCalls.length > 0) {
            send({ type: 'tool_start', tools: functionCalls.map((p: any) => p.functionCall.name) });

            const toolResponseParts = [];
            for (const part of functionCalls) {
              const { name, args } = part.functionCall;
              allToolCalls.push({ name, args });

              let result: unknown;
              try {
                result = await executeTool(name, args, { userId: user.id, accountId });
                console.log(`[chat] tool ${name} executed successfully`);
              } catch (err) {
                result = { error: err instanceof Error ? err.message : 'Tool execution failed' };
                console.error(`[chat] tool ${name} failed:`, err);
              }

              allToolResults.push({ name, result });
              // Gemini functionResponse.response must be a plain object (Struct), not array
              const responseObj = Array.isArray(result) ? { items: result } : (result as object ?? {});
              toolResponseParts.push({
                functionResponse: { name, response: responseObj },
              });
            }

            currentContents = [
              ...currentContents,
              { role: 'model', parts },
              { role: 'user', parts: toolResponseParts },
            ];

            toolRound++;
            continue;
          }

          if (textParts.length > 0) {
            finalText = textParts.map((p: any) => p.text).join('');

            // Word-by-word simulation (true streaming requires streamGenerateContent endpoint)
            const words = finalText.split(' ');
            for (let i = 0; i < words.length; i++) {
              const chunk = i === 0 ? words[i] : ' ' + words[i];
              send({ type: 'chunk', text: chunk });
              await new Promise(r => setTimeout(r, 15));
            }

            // Extract grounding metadata (present when Gemini used Google Search)
            const groundingMetadata = candidate?.groundingMetadata;
            const webSources = (groundingMetadata?.groundingChunks ?? [])
              .filter((chunk: any) => chunk.web)
              .map((chunk: any) => ({ title: chunk.web.title, uri: chunk.web.uri }));
            if (webSources.length > 0) {
              send({ type: 'sources', sources: webSources });
            }
          }

          break;
        }

        await supabase.from('chat_messages').insert({
          conversation_id: convId,
          role: 'assistant',
          content: finalText,
          tool_calls: allToolCalls.length > 0 ? allToolCalls : null,
          tool_results: allToolResults.length > 0 ? allToolResults : null,
        });

        await supabase
          .from('chat_conversations')
          .update({
            last_message_preview: finalText.slice(0, 100),
            updated_at: new Date().toISOString(),
          })
          .eq('id', convId);

        send({ type: 'done', conversationId: convId });
        controller.close();

      } catch (err) {
        console.error('[chat] stream error:', err);
        send({ type: 'error', message: 'A apărut o eroare neașteptată.' });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
