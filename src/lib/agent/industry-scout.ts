import 'server-only';
import { env } from '@/lib/env';
import type { IndustryNewsItem, UpcomingEvent } from './types';
import forkConfig from '../../../fork-config';

const GEMINI_MODEL = 'gemini-2.5-flash';

// ── STEP 1: Fetch real news via grounding ─────────────────────────────

async function fetchRealNewsText(runType: string): Promise<string> {
  const today = new Date().toLocaleDateString('ro-RO', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  const themes = forkConfig.contentNiche.themes.join(', ');

  const prompt = `Astăzi este ${today}.

Caută pe web și găsește:
1. Cele mai importante știri financiare din ultimele 48 de ore relevante pentru un creator de conținut financiar român
2. Evenimente financiare programate în următoarele 72 de ore (ședințe FED/BCE, earnings majore, date macro CPI/NFP/PIB)

Teme relevante: ${themes}

Pentru fiecare știre: titlu exact, sursă, rezumat 1-2 propoziții, relevanță (high/medium)
Pentru fiecare event: ce event, când exact, de ce contează pentru investitori români

Fii specific și bazează-te STRICT pe ce găsești în search. Nu inventa.`;

  void runType;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${env.GOOGLE_GENERATIVE_AI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        tools: [{ googleSearch: {} }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 3000,
        },
      }),
    }
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Scout grounding call failed: ${response.status} — ${err.slice(0, 200)}`);
  }

  const json = await response.json() as any;
  const text = json.candidates?.[0]?.content?.parts
    ?.filter((p: any) => p.text)
    ?.map((p: any) => p.text)
    ?.join('') ?? '';

  if (!text) throw new Error('Scout grounding returned empty response');

  console.log(`[scout] grounding call returned ${text.length} chars`);
  return text;
}

// ── STEP 2: Structure the raw news text into JSON ─────────────────────

const STRUCTURE_SCHEMA = {
  type: 'object',
  properties: {
    news: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          summary: { type: 'string' },
          source: { type: 'string' },
          url: { type: 'string' },
          relevance: { type: 'string', enum: ['high', 'medium', 'low'] },
          theme: {
            type: 'string',
            enum: [
              'fed', 'crypto', 'stocks_us', 'gold', 'forex',
              'real_estate', 'economy_eu', 'macro',
              'education', 'investing_principles', 'trading_strategy',
              'emerging_markets', 'other',
            ],
          },
        },
        required: ['title', 'summary', 'source', 'relevance'],
      },
    },
    upcoming_events: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          event: { type: 'string' },
          date_description: { type: 'string' },
          theme: { type: 'string' },
          urgency: { type: 'string', enum: ['urgent', 'planned', 'watch'] },
          description: { type: 'string' },
        },
        required: ['event', 'date_description', 'theme', 'urgency', 'description'],
      },
    },
  },
  required: ['news', 'upcoming_events'],
};

async function structureNewsJson(rawText: string): Promise<{
  news: IndustryNewsItem[];
  upcomingEvents: UpcomingEvent[];
}> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${env.GOOGLE_GENERATIVE_AI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `Structurează textul de mai jos în JSON conform schemei.
Păstrează titlurile și sursele EXACTE din text. Nu adăuga informații care nu sunt în text.
Maxim 5 știri (cele mai relevante) + maxim 4 events.

TEXT DE STRUCTURAT:
${rawText}`,
          }],
        }],
        generationConfig: {
          temperature: 0.0,
          maxOutputTokens: 2000,
          responseMimeType: 'application/json',
          responseSchema: STRUCTURE_SCHEMA,
        },
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Scout structure call failed: ${response.status}`);
  }

  const json = await response.json() as any;
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';

  let parsed: any;
  try {
    parsed = JSON.parse(text.replace(/```json\n?|```\n?/g, '').trim());
  } catch {
    throw new Error(`Scout failed to parse JSON: ${text.slice(0, 200)}`);
  }

  return {
    news: (parsed.news ?? []).map((n: any) => ({
      title: n.title,
      summary: n.summary,
      source: n.source,
      url: n.url ?? null,
      relevance: n.relevance as IndustryNewsItem['relevance'],
      theme: n.theme ?? null,
      publishedAt: null,
    })),
    upcomingEvents: (parsed.upcoming_events ?? []).map((e: any) => ({
      event: e.event,
      dateDescription: e.date_description,
      theme: e.theme,
      urgency: e.urgency as UpcomingEvent['urgency'],
      description: e.description,
    })),
  };
}

// ── Main export ───────────────────────────────────────────────────────

export async function runIndustryScout(runType: 'monday' | 'wednesday' | 'friday'): Promise<{
  news: IndustryNewsItem[];
  upcomingEvents: UpcomingEvent[];
}> {
  console.log(`[scout] starting industry scout for ${runType}`);

  const rawText = await fetchRealNewsText(runType);
  const result = await structureNewsJson(rawText);

  console.log(`[scout] found ${result.news.length} news items, ${result.upcomingEvents.length} events`);
  return result;
}
