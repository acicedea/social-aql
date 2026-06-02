# AI LICHIDITATE — Prompt 11b: Agent Email Fix — Design + Date Reale

## Context

Emailul agentului are două probleme critice:

**Problema 1 — Date vagi (cauza tehnică):**
`industry-scout.ts` rulează pe `gemini-2.5-flash` cu `jsonMode: true` + `responseSchema`.
Pe gemini-2.5-flash, Google Search grounding NU funcționează combinat cu structured outputs.
Modelul ignoră grounding-ul și generează știri inventate → hook-uri generice, fără valoare reală.
Fix: upgrade la `gemini-3.5-flash` pentru scout + separăm grounding call de structured output call
(două apeluri: primul cu grounding pentru știri raw, al doilea structurează datele).

**Problema 2 — Design (cauza tehnică):**
Email clients (Gmail, Apple Mail, Outlook) stripuiesc CSS classes și `<style>` blocks.
Background colors pe `body` și `div` sunt ignorate de Gmail.
Fix: inline styles pe toate elementele + table-based layout pentru compatibility.

## SCOPE BOUNDARY

Acest prompt modifică TREI fișiere:
1. `src/lib/agent/industry-scout.ts` — fix grounding + model upgrade
2. `src/lib/agent/email-composer.ts` — rescrie complet HTML cu table layout + inline styles
3. `src/lib/agent/opportunity-detector.ts` — prompt mai strict pentru date specifice din cont

## DO NOT TOUCH

- DB schema
- Agent runner
- Cron routes
- Dashboard agent page
- Account pulse
- Toate celelalte fișiere

---

## Deliverable 1: Fix Industry Scout — grounding real

Rescrie `src/lib/agent/industry-scout.ts` complet.

Problema: nu poți combina `responseSchema` (JSON mode) cu `googleSearch` grounding pe gemini-2.5-flash.

Soluția: **două apeluri separate**:
- **Apel 1:** `gemini-3.5-flash` + `googleSearch: {}` fără JSON schema → returnează text cu știri reale
- **Apel 2:** `gemini-3.5-flash` fără grounding + JSON schema → structurează textul din Apel 1

```ts
import 'server-only';
import { env } from '@/lib/env';
import type { IndustryNewsItem, UpcomingEvent } from './types';
import forkConfig from '../../../fork-config';

const GEMINI_MODEL = 'gemini-3.5-flash'; // required for grounding + structured outputs

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

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${env.GOOGLE_GENERATIVE_AI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        tools: [{ googleSearch: {} }],    // grounding activ, fără JSON schema
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

  // Step 1: Get real news via Google Search grounding
  const rawText = await fetchRealNewsText(runType);

  // Step 2: Structure into typed JSON
  const result = await structureNewsJson(rawText);

  console.log(`[scout] found ${result.news.length} news items, ${result.upcomingEvents.length} events`);
  return result;
}
```

---

## Deliverable 2: Fix Opportunity Detector — date mai specifice

In `src/lib/agent/opportunity-detector.ts`, înlocuiește system prompt cu unul mai strict:

```ts
const OPPORTUNITY_SYSTEM_PROMPT = `Ești un strateg de conținut financiar cu acces la datele unui cont specific de Instagram.

REGULI ABSOLUTE — violarea lor produce output inutilizabil:

1. **HOOK COMPLET ȘI SPECIFIC** — fiecare oportunitate TREBUIE să aibă un hook de 2 propoziții
   complete, în română, gata de copiat și folosit ca primele cuvinte ale unui video.
   NU: "Explorează strategiile de trading" (generic, vag)
   DA: "În ultimele 3 zile, S&P 500 a pierdut 2.1%. Asta nu e o corecție — e un semnal. Iată ce urmează."

2. **ANCORARE ÎN DATE REALE** — rationale TREBUIE să citeze CIFRE EXACTE din datele contului.
   NU: "Tema trading funcționează bine la tine"
   DA: "Tema trading_strategy are ER mediu 16.13% la tine (cel mai bun din toate temele, bazat pe 1 postare)"

3. **OPORTUNITATE = NEWS + DATE CONT** — combini OBLIGATORIU o știre/event real cu performanța
   temei respective în contul analizat. Dacă nu există o știre relevantă pentru o temă bună,
   propui conținut evergreen EXPLICIT: "Nu există news urgent, dar tema X performează bine."

4. **FORMAT SPECIFIC** — nu "Carousel" ci "Carousel 8 slide-uri". Nu "Reel" ci "Reel 30-45s".

5. **TIMING DIN DATE** — bestTimeToPost vine din analiza zilelor de postare din date, nu inventat.
   Dacă datele arată că vineri 19:00 performează bine, menționezi asta explicit cu cifra ER.

6. **URGENCY JUSTIFICATĂ** — "now" doar dacă există un event în <24h din secțiunea events.
   "tomorrow" dacă event în 24-48h. "this-week" pentru orice altceva.

Returnează DOAR JSON valid.`;
```

---

## Deliverable 3: Email HTML — rescris complet cu table layout

Rescrie `buildAgentEmailHtml` în `src/lib/agent/email-composer.ts`.

Regulile pentru email HTML care funcționează în Gmail/Apple Mail/Outlook:
- **Background pe `<td>` și `<table>`**, nu pe `<div>` sau `<body>`
- **Inline styles pe fiecare element** — nu CSS classes, nu `<style>` block
- **Table-based layout** — `<table>`, `<tr>`, `<td>` pentru structură
- **Max width 600px** — standard email width
- **Font stack safe** — `Arial, Helvetica, sans-serif` și `'Courier New', Courier, monospace`

```ts
export function buildAgentEmailHtml(params: {
  runType: RunType;
  pulse: AccountPulse;
  news: IndustryNewsItem[];
  events: UpcomingEvent[];
  opportunities: ContentOpportunity[];
  appUrl: string;
}): { subject: string; html: string; text: string } {
  const { runType, pulse, news, events, opportunities } = params;

  // ── Subject line ────────────────────────────────────────────────────
  const urgentEvent = events.find(e => e.urgency === 'urgent');
  const topOpportunity = opportunities.find(o => o.priority === 1);
  const hasAlerts = pulse.alertPosts.length > 0 || pulse.reachTrend === 'down';

  const runLabels: Record<RunType, string> = {
    monday: 'BRIEFING LUNI',
    wednesday: 'PULS MIERCURI',
    friday: 'PREP VINERI',
  };

  let subject = `📊 AI LICHIDITATE · ${runLabels[runType]}`;
  if (urgentEvent) subject += ` · ${urgentEvent.event}`;
  else if (topOpportunity) subject += ` · ${topOpportunity.title}`;
  if (hasAlerts) subject += ' ⚠️';

  // ── Colors (inline, not CSS vars) ───────────────────────────────────
  const C = {
    bg: '#000000',
    bgCard: '#111111',
    bgCardAlt: '#0A0A0A',
    bgPositive: '#0A1A04',
    bgNegative: '#1A0806',
    bgAlert: '#150A00',
    textPrimary: '#F2EFE4',
    textSecondary: '#8A8A8A',
    textMuted: '#5A5A5A',
    lime: '#C7F84C',
    limeDim: '#7A9A2E',
    coral: '#FF5A4E',
    coralDim: '#8C2F28',
    border: '#222222',
    borderPositive: '#2A4A10',
    borderNegative: '#4A1A14',
  };

  // ── Helpers ─────────────────────────────────────────────────────────
  const td = (content: string, style = '') =>
    `<td style="${style}">${content}</td>`;

  const row = (content: string, bg = C.bg, padding = '0') =>
    `<tr><td style="background-color:${bg};padding:${padding};">${content}</td></tr>`;

  const eyebrow = (text: string, color = C.textMuted) =>
    `<p style="margin:0 0 6px 0;font-family:'Courier New',Courier,monospace;font-size:10px;letter-spacing:0.12em;color:${color};text-transform:uppercase;">${text}</p>`;

  const mono = (text: string, size = 13, color = C.textPrimary, weight = 400) =>
    `<span style="font-family:'Courier New',Courier,monospace;font-size:${size}px;color:${color};font-weight:${weight};">${text}</span>`;

  const body = (text: string, size = 13, color = C.textPrimary) =>
    `<p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:${size}px;color:${color};line-height:1.6;">${text}</p>`;

  const divider = () =>
    `<tr><td style="background-color:${C.bg};padding:0 24px;"><div style="height:1px;background-color:${C.border};"></div></td></tr>`;

  const section = (title: string, content: string, topPad = '20px') =>
    `<tr><td style="background-color:${C.bg};padding:${topPad} 24px 0 24px;">
      ${eyebrow(title)}
    </td></tr>
    <tr><td style="background-color:${C.bg};padding:8px 24px 0 24px;">
      ${content}
    </td></tr>`;

  // ── Metric pill ──────────────────────────────────────────────────────
  const metricPill = (label: string, value: string, valueColor = C.textPrimary) =>
    `<table cellpadding="0" cellspacing="0" border="0" style="width:100%;margin-bottom:6px;">
      <tr>
        <td style="background-color:${C.bgCard};border:1px solid ${C.border};border-radius:4px;padding:10px 14px;">
          <table cellpadding="0" cellspacing="0" border="0" style="width:100%;">
            <tr>
              <td>${mono(label, 11, C.textSecondary)}</td>
              <td align="right">${mono(value, 13, valueColor, 600)}</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>`;

  // ── Alert box ────────────────────────────────────────────────────────
  const alertBox = (text: string) =>
    `<table cellpadding="0" cellspacing="0" border="0" style="width:100%;margin-bottom:8px;">
      <tr>
        <td style="background-color:${C.bgNegative};border-left:3px solid ${C.coral};border-radius:0 4px 4px 0;padding:10px 14px;">
          ${body(`⚠️ ${text}`, 12, C.coral)}
        </td>
      </tr>
    </table>`;

  // ── News card ────────────────────────────────────────────────────────
  const newsCard = (item: IndustryNewsItem) => {
    const borderColor = item.relevance === 'high' ? C.lime : C.limeDim;
    const dot = item.relevance === 'high' ? '🔴' : '🟡';
    return `<table cellpadding="0" cellspacing="0" border="0" style="width:100%;margin-bottom:8px;">
      <tr>
        <td style="background-color:${C.bgCard};border-left:3px solid ${borderColor};border-radius:0 4px 4px 0;padding:10px 14px;">
          ${body(`${dot} <strong>${item.title}</strong>`, 13, C.textPrimary)}
          <div style="height:4px;"></div>
          ${body(item.summary, 12, C.textSecondary)}
          ${item.source ? `<div style="height:4px;"></div>${mono(item.source + (item.url ? ` · <a href="${item.url}" style="color:${C.limeDim};text-decoration:none;">citește →</a>` : ''), 10, C.textMuted)}` : ''}
        </td>
      </tr>
    </table>`;
  };

  // ── Event card ───────────────────────────────────────────────────────
  const eventCard = (event: UpcomingEvent) => {
    const isUrgent = event.urgency === 'urgent';
    const bg = isUrgent ? C.bgNegative : C.bgCard;
    const border = isUrgent ? C.coral : C.limeDim;
    const urgencyLabel = isUrgent ? '⚡ URGENT' : '📅 PROGRAMAT';
    const urgencyColor = isUrgent ? C.coral : C.limeDim;
    return `<table cellpadding="0" cellspacing="0" border="0" style="width:100%;margin-bottom:6px;">
      <tr>
        <td style="background-color:${bg};border-left:3px solid ${border};border-radius:0 4px 4px 0;padding:10px 14px;">
          ${mono(`${urgencyLabel} · ${event.dateDescription.toUpperCase()}`, 10, urgencyColor)}
          <div style="height:4px;"></div>
          ${body(`<strong>${event.event}</strong>`, 13, C.textPrimary)}
          <div style="height:4px;"></div>
          ${body(event.description, 12, C.textSecondary)}
        </td>
      </tr>
    </table>`;
  };

  // ── Opportunity card ─────────────────────────────────────────────────
  const opportunityCard = (opp: ContentOpportunity, idx: number) => {
    const stars = '⭐'.repeat(4 - opp.priority);
    const urgencyLabel = opp.urgency === 'now' ? 'POSTEAZĂ ACUM'
      : opp.urgency === 'tomorrow' ? 'MÂINE'
      : 'ACEASTĂ SĂPTĂMÂNĂ';

    return `<table cellpadding="0" cellspacing="0" border="0" style="width:100%;margin-bottom:12px;">
      <tr>
        <td style="background-color:${C.bgPositive};border:1px solid ${C.borderPositive};border-radius:6px;padding:16px;">

          ${mono(`${stars} PRIORITATE ${opp.priority} · ${urgencyLabel}`, 10, C.lime)}
          <div style="height:8px;"></div>
          ${body(`<strong style="font-size:15px;">${opp.title}</strong>`, 15, C.textPrimary)}
          <div style="height:10px;"></div>

          <!-- Hook box -->
          <table cellpadding="0" cellspacing="0" border="0" style="width:100%;">
            <tr>
              <td style="background-color:${C.bgCard};border-left:3px solid ${C.lime};border-radius:0 4px 4px 0;padding:10px 14px;">
                ${body(`<em>"${opp.hook}"</em>`, 13, C.textPrimary)}
              </td>
            </tr>
          </table>
          <div style="height:10px;"></div>

          <!-- Badges -->
          <table cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td style="padding-right:6px;">
                <span style="display:inline-block;background-color:${C.bgCard};border:1px solid ${C.border};border-radius:3px;padding:3px 8px;font-family:'Courier New',Courier,monospace;font-size:10px;color:${C.textMuted};">${opp.format}</span>
              </td>
              <td style="padding-right:6px;">
                <span style="display:inline-block;background-color:${C.bgCard};border:1px solid ${C.border};border-radius:3px;padding:3px 8px;font-family:'Courier New',Courier,monospace;font-size:10px;color:${C.textMuted};">${opp.theme.toUpperCase()}</span>
              </td>
              <td style="padding-right:6px;">
                <span style="display:inline-block;background-color:${C.bgCard};border:1px solid ${C.border};border-radius:3px;padding:3px 8px;font-family:'Courier New',Courier,monospace;font-size:10px;color:${C.textMuted};">⏰ ${opp.bestTimeToPost}</span>
              </td>
              <td>
                <span style="display:inline-block;background-color:${C.bgCard};border:1px solid ${C.borderPositive};border-radius:3px;padding:3px 8px;font-family:'Courier New',Courier,monospace;font-size:10px;color:${C.limeDim};">ER est. ${opp.estimatedEr}</span>
              </td>
            </tr>
          </table>
          <div style="height:10px;"></div>

          ${body(opp.rationale, 12, C.textSecondary)}
        </td>
      </tr>
    </table>`;
  };

  // ── Build sections ───────────────────────────────────────────────────

  const dateStr = new Date().toLocaleDateString('ro-RO', {
    weekday: 'long', day: 'numeric', month: 'long',
  });

  const runLabelsFull: Record<RunType, string> = {
    monday: 'BRIEFING SĂPTĂMÂNAL · LUNI',
    wednesday: 'PULS MID-WEEK · MIERCURI',
    friday: 'PREP WEEKEND · VINERI',
  };

  const nextRunLabels: Record<RunType, string> = {
    monday: 'Miercuri dimineață',
    wednesday: 'Vineri dimineață',
    friday: 'Luni dimineața viitoare',
  };

  // ACCOUNT PULSE SECTION
  const reachColor = pulse.reachTrend === 'up' ? C.lime
    : pulse.reachTrend === 'down' ? C.coral : C.textPrimary;
  const reachArrow = pulse.reachTrend === 'up' ? '↑' : pulse.reachTrend === 'down' ? '↓' : '→';
  const reachDeltaStr = `${pulse.reachDelta > 0 ? '+' : ''}${pulse.reachDelta}%`;

  let pulseContent = '';

  if (pulse.reachTrend === 'down' && Math.abs(pulse.reachDelta) > 15) {
    pulseContent += alertBox(`Reach în scădere ${reachDeltaStr} față de perioada precedentă`);
  }
  if (pulse.daysSinceLastPost >= 3) {
    pulseContent += alertBox(`${pulse.daysSinceLastPost} zile fără postare — consistența e cheie`);
  }

  pulseContent += metricPill('POSTĂRI PUBLICATE', `${pulse.postsPublished}`);
  pulseContent += metricPill('TREND REACH', `${reachArrow} ${reachDeltaStr}`, reachColor);
  if (pulse.accountAvgEr != null) {
    pulseContent += metricPill('ER MEDIU CONT', `${pulse.accountAvgEr.toFixed(2)}%`, C.lime);
  }
  if (pulse.topPost) {
    pulseContent += metricPill(
      `TOP: "${(pulse.topPost.caption ?? '').slice(0, 35)}..."`,
      `ER ${pulse.topPost.erByReach?.toFixed(2)}%`,
      C.lime,
    );
  }

  for (const alert of pulse.alertPosts) {
    pulseContent += metricPill(
      `⚠️ "${(alert.caption ?? '').slice(0, 35)}..."`,
      alert.issue,
      C.coral,
    );
  }

  // NEWS SECTION
  const highNews = news.filter(n => n.relevance === 'high').slice(0, 3);
  const mediumNews = news.filter(n => n.relevance === 'medium').slice(0, 2);
  const hasNews = highNews.length > 0 || mediumNews.length > 0;
  const newsContent = [...highNews, ...mediumNews].map(newsCard).join('');

  // EVENTS SECTION
  const urgentEvents = events.filter(e => e.urgency === 'urgent');
  const plannedEvents = events.filter(e => e.urgency === 'planned');
  const hasEvents = urgentEvents.length > 0 || plannedEvents.length > 0;
  const eventsContent = [...urgentEvents, ...plannedEvents].map(eventCard).join('');

  // OPPORTUNITIES SECTION
  const sortedOpps = [...opportunities].sort((a, b) => a.priority - b.priority);
  const oppsContent = sortedOpps.map((o, i) => opportunityCard(o, i)).join('');

  // ── Final HTML ───────────────────────────────────────────────────────
  const html = `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background-color:${C.bg};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">

<!-- Outer wrapper -->
<table cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:${C.bg};">
  <tr>
    <td align="center" style="background-color:${C.bg};padding:32px 16px;">

      <!-- Inner container -->
      <table cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;width:100%;background-color:${C.bg};">

        <!-- HEADER -->
        <tr>
          <td style="background-color:${C.bg};padding:0 0 20px 0;border-bottom:1px solid ${C.border};">
            <p style="margin:0;font-family:'Courier New',Courier,monospace;font-size:14px;font-weight:700;letter-spacing:0.1em;color:${C.lime};">AI LICHIDITATE</p>
            <p style="margin:4px 0 0 0;font-family:'Courier New',Courier,monospace;font-size:11px;color:${C.textMuted};letter-spacing:0.06em;">${runLabelsFull[runType]} · ${dateStr.toUpperCase()}</p>
          </td>
        </tr>

        <!-- ACCOUNT PULSE -->
        <tr>
          <td style="background-color:${C.bg};padding:24px 0 0 0;">
            <p style="margin:0 0 10px 0;font-family:'Courier New',Courier,monospace;font-size:10px;letter-spacing:0.12em;color:${C.textMuted};text-transform:uppercase;">CONT · ULTIMELE ${runType === 'monday' ? '72H' : '48H'}</p>
            ${pulseContent}
          </td>
        </tr>

        ${hasNews ? `
        <!-- NEWS -->
        <tr>
          <td style="background-color:${C.bg};padding:24px 0 0 0;">
            <div style="height:1px;background-color:${C.border};margin-bottom:20px;"></div>
            <p style="margin:0 0 10px 0;font-family:'Courier New',Courier,monospace;font-size:10px;letter-spacing:0.12em;color:${C.textMuted};text-transform:uppercase;">PIEȚE · ȘTIRI RELEVANTE</p>
            ${newsContent}
          </td>
        </tr>` : ''}

        ${hasEvents ? `
        <!-- EVENTS -->
        <tr>
          <td style="background-color:${C.bg};padding:24px 0 0 0;">
            <div style="height:1px;background-color:${C.border};margin-bottom:20px;"></div>
            <p style="margin:0 0 10px 0;font-family:'Courier New',Courier,monospace;font-size:10px;letter-spacing:0.12em;color:${C.textMuted};text-transform:uppercase;">CALENDAR · EVENIMENTE</p>
            ${eventsContent}
          </td>
        </tr>` : ''}

        <!-- OPPORTUNITIES -->
        <tr>
          <td style="background-color:${C.bg};padding:24px 0 0 0;">
            <div style="height:1px;background-color:${C.border};margin-bottom:20px;"></div>
            <p style="margin:0 0 10px 0;font-family:'Courier New',Courier,monospace;font-size:10px;letter-spacing:0.12em;color:${C.textMuted};text-transform:uppercase;">OPORTUNITĂȚI CONȚINUT · ${opportunities.length} IDEI</p>
            ${oppsContent}
          </td>
        </tr>

        <!-- CTA BUTTON -->
        <tr>
          <td style="background-color:${C.bg};padding:28px 0 0 0;">
            <table cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="background-color:${C.lime};border-radius:4px;">
                  <a href="${params.appUrl}/dashboard/agent"
                     style="display:inline-block;padding:13px 28px;font-family:'Courier New',Courier,monospace;font-size:12px;font-weight:700;letter-spacing:0.1em;color:#000000;text-decoration:none;text-transform:uppercase;">
                    → DESCHIDE DASHBOARD COMPLET
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- FOOTER -->
        <tr>
          <td style="background-color:${C.bg};padding:28px 0 0 0;border-top:1px solid ${C.border};margin-top:28px;">
            <p style="margin:28px 0 0 0;font-family:'Courier New',Courier,monospace;font-size:10px;color:${C.textMuted};">AI LICHIDITATE · Agent Proactiv · ${runLabelsFull[runType]}</p>
            <p style="margin:4px 0 0 0;font-family:'Courier New',Courier,monospace;font-size:10px;color:${C.textMuted};">Următorul briefing: ${nextRunLabels[runType]}</p>
          </td>
        </tr>

      </table>
      <!-- /Inner container -->

    </td>
  </tr>
</table>
<!-- /Outer wrapper -->

</body>
</html>`;

  // ── Plain text ───────────────────────────────────────────────────────
  const text = [
    `AI LICHIDITATE · ${runLabelsFull[runType]}`,
    dateStr.toUpperCase(),
    '='.repeat(50),
    '',
    `CONT · ULTIMELE 48H`,
    `Postări: ${pulse.postsPublished} | Trend reach: ${reachArrow} ${reachDeltaStr}`,
    pulse.accountAvgEr ? `ER mediu cont: ${pulse.accountAvgEr.toFixed(2)}%` : '',
    pulse.alertPosts.map(p => `⚠️ ${p.issue}`).join('\n'),
    '',
    hasNews ? 'ȘTIRI:' : '',
    ...highNews.map(n => `🔴 ${n.title}\n   ${n.summary} (${n.source})`),
    '',
    hasEvents ? 'EVENIMENTE:' : '',
    ...urgentEvents.map(e => `⚡ ${e.event} — ${e.dateDescription}`),
    ...plannedEvents.map(e => `📅 ${e.event} — ${e.dateDescription}`),
    '',
    'OPORTUNITĂȚI:',
    ...sortedOpps.map((o, i) => [
      `${i + 1}. [P${o.priority}] ${o.title}`,
      `   Hook: "${o.hook}"`,
      `   ${o.format} · ${o.theme.toUpperCase()} · ${o.bestTimeToPost}`,
      `   ${o.rationale}`,
    ].join('\n')),
    '',
    `Dashboard: ${params.appUrl}/dashboard/agent`,
    `Următorul briefing: ${nextRunLabels[runType]}`,
  ].filter(s => s !== '').join('\n');

  return { subject, html, text };
}
```

---

## Verification checklist

1. `pnpm build` succeeds, zero TypeScript errors
2. `pnpm lint` passes
3. **Scout fix verificat:** testează manual cron-ul:
```bash
   curl -H "Authorization: Bearer $CRON_SECRET" \
     http://localhost:3000/api/cron/agent
```
   Verifică în DB:
```sql
   SELECT
     jsonb_array_length(industry_news) as news_count,
     industry_news->0->>'title' as first_news_title,
     industry_news->0->>'source' as first_news_source,
     jsonb_array_length(opportunities) as opps_count,
     opportunities->0->>'hook' as first_hook
   FROM agent_insights
   ORDER BY run_at DESC LIMIT 1;
```
   - `news_count` > 0
   - `first_news_title` e o știre reală (nu inventată)
   - `first_news_source` e un site real (Reuters, Bloomberg, etc.)
   - `first_hook` e o propoziție completă în română, specifică, cu cifre

4. **Email design:** primești emailul → deschizi în Gmail:
   - Background negru (#000000) pe tot emailul ✓
   - Text primary crem (#F2EFE4) ✓
   - Accent lime (#C7F84C) pe logo și labels ✓
   - Coral (#FF5A4E) pe alerts ✓
   - Font mono pe metrici și labels ✓
   - Butonul CTA verde lime cu text negru ✓

5. **Email design în Apple Mail:** same as above ✓

6. **Știri reale în email:** secțiunea "PIEȚE · ȘTIRI RELEVANTE" conține titluri reale cu surse (nu "Explorează strategiile de trading")

7. **Hook specific:** opportunity hook conține cifre sau referințe la events reale, nu fraze generice

8. **Opportunity rationale specifică:** menționează ER exact din cont ("trading_strategy are ER 16.13% la tine") nu generic ("funcționează bine")

9. **Events urgente:** dacă există events în <24h, apar cu banner ⚡ URGENT în coral

10. **Două apeluri Gemini în logs:** în Vercel logs/console, apare:
```
    [scout] grounding call returned XXXX chars
    [scout] found N news items, M events
```

## Notes pentru Claude Code

- **Două apeluri separate e intenționat și necesar.** Nu combina într-un singur apel — grounding + JSON schema nu funcționează stabil pe gemini-2.5-flash. Pe gemini-3.5-flash funcționează dar e mai scump. Două apeluri separate sunt mai fiabile și nu cu mult mai lente.
- **`gemini-3.5-flash` pentru scout** — diferit de `gemini-2.5-flash` folosit pentru analize. E mai scump per token dar pentru scout facem 2 apeluri de max 3000 tokens fiecare → cost neglijabil.
- **Table-based HTML email** e standardul din 2004 și funcționează în TOATE email clients. Nu există alternativă mai compatibilă. Rezistă tentației de a folosi CSS Grid sau Flexbox în email.
- **Inline styles pe fiecare element** — nu `<style>` block în `<head>`. Gmail strippuiește `<style>` blocks pentru emailuri externe.
- **`background-color` pe `<td>`** nu pe `<div>` — Outlook nu respectă background pe divuri.
- **Max width 600px** — standard pentru emailuri. Pe mobile se adaptează automat.
- Testează emailul cu [Litmus](https://litmus.com) sau [Email on Acid](https://www.emailonacid.com) dacă vrei să verifici compatibility completă. Sau trimite la o adresă Gmail și una Apple Mail.