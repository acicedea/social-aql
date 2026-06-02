import 'server-only';
import { getDefaultAiProvider } from '@/ai/registry';
import type { AccountPulse, IndustryNewsItem, UpcomingEvent, ContentOpportunity } from './types';
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase/server';

type SupabaseClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

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

Returnează DOAR JSON valid cu structura:
{"opportunities": [{"title": "...", "hook": "...", "format": "...", "theme": "...", "rationale": "...", "priority": "1|2|3", "urgency": "now|tomorrow|this-week", "best_time_to_post": "...", "estimated_er": "..."}]}`;

export async function detectOpportunities(params: {
  accountId: string;
  userId: string;
  pulse: AccountPulse;
  news: IndustryNewsItem[];
  events: UpcomingEvent[];
  supabaseClient?: SupabaseClient;
}): Promise<ContentOpportunity[]> {
  const provider = getDefaultAiProvider();
  const supabase = params.supabaseClient ?? (createSupabaseServiceClient() as unknown as SupabaseClient);

  const { data: themePosts } = await supabase
    .from('posts_with_latest_metrics')
    .select('theme, er_by_reach, saves_per_reach, sends_per_reach')
    .eq('account_id', params.accountId)
    .gte('published_at', new Date(Date.now() - 90 * 86400000).toISOString())
    .not('er_by_reach', 'is', null)
    .gt('er_by_reach', 0);

  const themeStats: Record<string, { count: number; erSum: number; savesSum: number }> = {};
  for (const p of themePosts ?? []) {
    const t = p.theme ?? 'other';
    if (!themeStats[t]) themeStats[t] = { count: 0, erSum: 0, savesSum: 0 };
    themeStats[t].count++;
    themeStats[t].erSum += p.er_by_reach ?? 0;
    themeStats[t].savesSum += p.saves_per_reach ?? 0;
  }

  const themePerformance = Object.entries(themeStats)
    .map(([theme, s]) => ({
      theme,
      avgEr: (s.erSum / s.count).toFixed(2),
      postCount: s.count,
    }))
    .sort((a, b) => parseFloat(b.avgEr) - parseFloat(a.avgEr))
    .slice(0, 6);

  const { data: timingPosts } = await supabase
    .from('posts_with_latest_metrics')
    .select('published_at, er_by_reach')
    .eq('account_id', params.accountId)
    .gte('published_at', new Date(Date.now() - 30 * 86400000).toISOString())
    .not('er_by_reach', 'is', null);

  const dayStats: Record<string, number[]> = {};
  const days = ['Duminică', 'Luni', 'Marți', 'Miercuri', 'Joi', 'Vineri', 'Sâmbătă'];
  for (const p of timingPosts ?? []) {
    const day = days[new Date(p.published_at).getDay()];
    if (!dayStats[day]) dayStats[day] = [];
    dayStats[day].push(p.er_by_reach ?? 0);
  }
  const bestDays = Object.entries(dayStats)
    .map(([day, ers]) => ({ day, avgEr: ers.reduce((a, b) => a + b, 0) / ers.length }))
    .sort((a, b) => b.avgEr - a.avgEr)
    .slice(0, 2)
    .map(d => d.day);

  void params.userId;

  const userPrompt = `Generează oportunități de conținut pe baza următoarelor date:

=== PERFORMANȚĂ CONT (ultimele 90 zile) ===
Media ER: ${params.pulse.accountAvgEr?.toFixed(2) ?? 'N/A'}%
Zile fără postare: ${params.pulse.daysSinceLastPost}
Cele mai bune zile de postare: ${bestDays.join(', ')} (19:00-21:00)
Trend reach: ${params.pulse.reachTrend} (${params.pulse.reachDelta > 0 ? '+' : ''}${params.pulse.reachDelta}%)

=== TOP TEME DIN CONT ===
${themePerformance.map(t => `${t.theme}: ER mediu ${t.avgEr}% (${t.postCount} postări)`).join('\n')}

=== ȘTIRI RELEVANTE DIN ULTIMELE 48H ===
${params.news.filter(n => n.relevance === 'high' || n.relevance === 'medium').map(n =>
  `[${n.relevance.toUpperCase()}] ${n.title}\n  Tema: ${n.theme ?? 'general'}\n  Rezumat: ${n.summary}`
).join('\n\n')}

=== EVENIMENTE PROGRAMATE ===
${params.events.map(e =>
  `[${e.urgency.toUpperCase()}] ${e.event} — ${e.dateDescription}\n  ${e.description}`
).join('\n')}

=== CONTEXT POSTARE RECENTĂ ===
${params.pulse.postsPublished} postări de la ultima rulare agent.
${params.pulse.alertPosts.length > 0
  ? `⚠️ ${params.pulse.alertPosts.length} postări sub medie.`
  : '✓ Toate postările recente în parametri.'}

Generează 2-3 oportunități concrete. Prioritizează evenimentele URGENTE.`;

  const result = await provider.generate({
    systemPrompt: OPPORTUNITY_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
    temperature: 0.5,
    maxOutputTokens: 2000,
    jsonMode: true,
  });

  const parsed = result.parsed as {
    opportunities?: Array<{
      title: string;
      hook: string;
      format: string;
      theme: string;
      rationale: string;
      priority: string;
      urgency: string;
      best_time_to_post?: string;
      estimated_er?: string;
    }>;
  };

  return (parsed?.opportunities ?? []).map(o => ({
    title: o.title,
    hook: o.hook,
    format: o.format,
    theme: o.theme,
    rationale: o.rationale,
    priority: parseInt(o.priority, 10) as 1 | 2 | 3,
    urgency: o.urgency as ContentOpportunity['urgency'],
    bestTimeToPost: o.best_time_to_post ?? 'această seară 19:00-21:00',
    estimatedEr: o.estimated_er ?? 'bazat pe tema detectată',
  }));
}
