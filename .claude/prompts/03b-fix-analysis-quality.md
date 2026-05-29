# AI LICHIDITATE — Prompt 03b-fix: Analysis Data Bugs + Prompt Quality Upgrade

## Context

The first weekly summary generated correctly but has two categories of issues:

### Category A — Data bugs (critical, distort all numbers)

**Bug 1: KPI percentages are multiplied by 100 twice.**
Dashboard shows correct values (e.g., ER 9.28%, Save Rate 0.35%). But in the generated analysis, the same values appear as 948.14% and 49.93%. This means `data-builders.ts` is multiplying already-percentage values by 100 again before sending to Gemini. KPIs stored in DB are already in percentage form (9.28 means 9.28%). The data builder must pass them as-is, not multiply.

**Bug 2: Null/zero values sent as real data.**
The analysis mentions "Save Rate 0% (anomalie a datelor)" — meaning it received a 0 or null save rate and tried to reason about it. Null metrics should be excluded from aggregations. Zero saves on a specific post should be passed as null (data unavailable) rather than 0, to prevent skewing averages and confusing the AI.

### Category B — Analysis quality (important, makes output generic)

The current prompts produce correct but surface-level analysis. The AI receives aggregated stats (averages per theme) but not enough per-post detail to identify specific patterns. Recommendations are valid but not tied to specific content characteristics.

What's needed:
- Per-post caption analysis (first 10 words = hook, caption length, question vs statement)
- Post-to-post comparison within same theme (why did post A outperform post B on FED?)
- Recommendations anchored to specific past posts ("like you did in X, do more of Y")
- Comparison window: 14 days vs previous 14 days (more stable than 7 vs 7 with only 3-4 posts/week)

## SCOPE BOUNDARY

This prompt does FOUR things only:
1. Fix data builder to pass KPI values correctly (no double multiplication)
2. Fix null/zero handling in aggregations
3. Enrich data sent to AI with per-post hook analysis
4. Rewrite the weekly summary prompt for deeper, more actionable output

Content Patterns and Ideation prompts also get a quality pass — same principles.

No new pages. No DB changes. No new components. No architectural changes.

## Files allowed to change

- `src/ai/analyses/data-builders.ts` — fix multiplication + null handling + add per-post hook data
- `src/ai/analyses/weekly-summary.ts` — rewrite system prompt + user prompt builder
- `src/ai/analyses/content-patterns.ts` — improve prompt depth
- `src/ai/analyses/content-ideation.ts` — improve prompt actionability

## DO NOT TOUCH

- KPI calculation engine
- Gemini provider
- Analysis runner
- Schemas (JSON structure is fine)
- UI components
- DB schema
- Everything else

## Deliverable 1: Fix data builders

### 1.1 Fix the double multiplication bug

In `src/ai/analyses/data-builders.ts`, find every place where KPI values are processed before being included in the prompt data.

The values from `post_metrics_snapshots` are stored as percentages already:
- `er_by_reach = 9.28` means 9.28%
- `saves_per_reach = 0.35` means 0.35%
- `sends_per_reach = 1.08` means 1.08%

If anywhere in the data builder you see code like:
```ts
avgEr = (sum / count) * 100  // WRONG if values are already percentages
avgEr = value / reach * 100   // WRONG if value is already a ratio
```
Remove the `* 100`. Pass values directly from DB columns.

The formatter `fmtPct()` in weekly-summary.ts adds the `%` symbol — it must NOT also multiply by 100:
```ts
// CORRECT:
function fmtPct(v: number | null): string {
  return v == null ? 'N/A' : `${v.toFixed(2)}%`;
  // If v = 9.28, outputs "9.28%" ✓
}

// WRONG (this is likely the bug):
function fmtPct(v: number | null): string {
  return v == null ? 'N/A' : `${(v * 100).toFixed(2)}%`;
  // If v = 9.28, outputs "928.00%" ✗
}
```

Search for any `* 100` or `/ 100` in both files and verify each one is mathematically necessary given that DB values are already percentages.

### 1.2 Fix null and zero handling in aggregations

When computing averages over a set of posts, exclude null values AND zero values for rate metrics (saves_per_reach, sends_per_reach). Zero saves is usually "data not available from Meta" rather than "literally zero saves," especially for Reels where the metric name changed in v22.

```ts
function safeAvg(values: (number | null)[]): number | null {
  // Exclude null AND zero for rate metrics
  const valid = values.filter((v): v is number => v != null && v > 0);
  if (valid.length === 0) return null;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}
```

Use this for all KPI averages. For `reach` and `likes`, zeros are legitimate — only filter nulls.

For per-post data sent to AI: if saves_per_reach is null or 0, pass it as `null` (not 0). In the prompt text, display it as "N/A" not "0.00%". This prevents the AI from reasoning about a zero it can't interpret.

### 1.3 Extend per-post data with hook analysis

In `buildWeeklyData` and `buildPatternsData`, enrich each post entry with:

```ts
interface PostForAnalysis {
  postId: string;
  caption: string;           // truncated to 200 chars — enough for AI to understand content
  captionFull: string;       // first 400 chars for hook analysis
  hook: string;              // first 12 words of caption (the opening hook)
  hookType: 'question' | 'statement' | 'number' | 'quote' | 'command' | 'other';
  captionLength: 'short' | 'medium' | 'long';  // <50 words, 50-150 words, 150+ words
  hasQuestion: boolean;      // caption contains a question mark
  hasNumber: boolean;        // caption starts with or prominently features a number
  hashtagCount: number;
  mediaType: string;
  theme: string | null;
  themeSecondary: string | null;
  erByReach: number | null;
  savesPerReach: number | null;
  sendsPerReach: number | null;
  reach: number | null;
  publishedAt: string;
  dayOfWeek: string;         // "Luni", "Marți", etc.
  hourOfDay: number;
}
```

Compute these client-side in the data builder:

```ts
function extractHook(caption: string | null): string {
  if (!caption) return '';
  return caption.split(/\s+/).slice(0, 12).join(' ');
}

function classifyHookType(caption: string | null): HookType {
  if (!caption) return 'other';
  const first50 = caption.slice(0, 50).toLowerCase();
  if (first50.endsWith('?') || first50.includes('?')) return 'question';
  if (/^["""„]/.test(caption.trim())) return 'quote';
  if (/^\d/.test(caption.trim())) return 'number';
  if (/^(nu |fă |evit|start|înce|stop)/i.test(caption.trim())) return 'command';
  if (caption.includes('?')) return 'question';
  return 'statement';
}

function classifyCaptionLength(caption: string | null): 'short' | 'medium' | 'long' {
  const wordCount = (caption ?? '').split(/\s+/).filter(Boolean).length;
  if (wordCount < 50) return 'short';
  if (wordCount < 150) return 'medium';
  return 'long';
}

function getDayOfWeek(isoDate: string): string {
  const days = ['Duminică', 'Luni', 'Marți', 'Miercuri', 'Joi', 'Vineri', 'Sâmbătă'];
  return days[new Date(isoDate).getDay()];
}
```

### 1.4 Extend comparison window to 14 days

In `buildWeeklyData`, change the comparison window:
- **Current period:** last 14 days (not 7)
- **Previous period:** 14-28 days ago
- Keep the function name `buildWeeklyData` for compatibility

The data bundle should reflect this:
```ts
currentWeek: {
  from: string;  // 14 days ago
  to: string;    // today
  label: 'Ultimele 14 zile';
};
previousWeek: {
  from: string;  // 28 days ago
  to: string;    // 14 days ago
  label: 'Perioada precedentă (14 zile)';
};
```

With 3-4 posts/week, 14 days gives 6-8 posts per period — much more stable averages than 3-4.

## Deliverable 2: Rewrite Weekly Summary prompt

### 2.1 New system prompt

Replace the existing `WEEKLY_SUMMARY_SYSTEM_PROMPT` in `src/ai/analyses/weekly-summary.ts`:

```ts
export const WEEKLY_SUMMARY_SYSTEM_PROMPT = `Ești un analist de conținut specializat în creatori de conținut financiar românesc (nișă: economie, macro, trading, investiții).

Sarcina ta: analizează datele contului @${ACCOUNT_HANDLE} și produce un sumar EXTREM DE SPECIFIC și ACȚIONABIL în română.

## Reguli fundamentale

**SPECIFICITATE OBLIGATORIE:**
- Fiecare recomandare TREBUIE să menționeze un post concret din date ca exemplu
- Nu scrie "postează mai mult despre FED" — scrie "postarea ta 'Există o instituție ale cărei decizii...' (ER 9.3%) a funcționat pentru că HOOK-UL pune o întrebare enigmatică. Replică această formulă."
- Dacă nu ai date suficiente pentru o afirmație, SPUNE explicit "date insuficiente"

**ANALIZA HOOK-URILOR (cel mai important element):**
- Compară primele 12 cuvinte ale postărilor cu performanță înaltă vs. scăzută
- Identifică tiparul câștigător: întrebare vs. afirmație vs. citat vs. cifră
- Recomandă formule CONCRETE de hook bazate pe ce a funcționat

**COMPARAȚII POST-TO-POST:**
- Când două postări sunt pe aceeași temă dar performează diferit, explică DE CE
- Exemplu: "Ambele despre FED, dar prima (ER 9.3%) deschide cu o întrebare, a doua (ER 6.1%) deschide cu o afirmație. Întrebările perform mai bine pe audiența ta."

**RAȚIONAMENT VIZIBIL:**
- Arată calculele: "Postările cu hook tip întrebare: ER mediu 8.4%. Postările cu afirmații: ER mediu 5.2%. Delta: +61%."
- Nu inventa pattern-uri care nu apar în date

## Focus principal (în ordine prioritară)
1. COMPARAȚIE perioadă curentă vs. precedentă (cu cifre concrete, fără multiplicate greșit)
2. ANALIZA HOOK-URILOR (ce tip de deschidere funcționează pe audiența ta)
3. TOP PERFORMERS cu explicație specifică de CE au funcționat
4. 3 RECOMANDĂRI concrete, fiecare ancorată într-un post real din date

## Reguli tehnice
- Toate valorile KPI sunt deja în procente: 9.28 înseamnă 9.28%, NU 928%
- Save Rate și Send Rate de 0% sau N/A = date indisponibile, NU "performanță zero"
- Valorile N/A nu se includ în medii și nu se comentează ca "anomalie"
- Eșantion mic (sub 5 postări per perioadă) → menționează explicit "date limitate"
- Română cu diacritice corecte
- narrative_markdown: 250-400 cuvinte, REASONING vizibil, NU repeta key_findings verbatim

Returnează DOAR JSON valid conform schemei. Fără markdown code fences.`;
```

Note: replace `${ACCOUNT_HANDLE}` with the actual handle passed at runtime.

### 2.2 New user prompt builder

Replace `buildWeeklySummaryPrompt` to include per-post hook data:

```ts
export function buildWeeklySummaryPrompt(data: WeeklyDataBundle): string {
  const formatPost = (p: PostForAnalysis, idx: number) => `
  ${idx + 1}. [${p.postId}]
     Hook: "${p.hook}"
     Tip hook: ${p.hookType} | Lungime: ${p.captionLength} | Are întrebare: ${p.hasQuestion ? 'da' : 'nu'}
     Temă: ${p.theme ?? 'other'}${p.themeSecondary ? ` + ${p.themeSecondary}` : ''}
     Format: ${p.mediaType} | Publicat: ${p.dayOfWeek} ora ${p.hourOfDay}:00
     ER: ${fmt(p.erByReach)} | Save Rate: ${fmt(p.savesPerReach)} | Send Rate: ${fmt(p.sendsPerReach)} | Reach: ${p.reach ?? 'N/A'}
     Caption preview: "${p.caption}"`;

  // Sort posts: top 3 by ER, bottom 3 by ER (for contrast analysis)
  const byEr = [...data.currentPeriod.posts]
    .filter(p => p.erByReach != null)
    .sort((a, b) => (b.erByReach ?? 0) - (a.erByReach ?? 0));
  
  const top3 = byEr.slice(0, 3);
  const bottom3 = byEr.slice(-3).reverse();

  // Hook type analysis (pre-computed for AI to verify)
  const hookTypeStats = computeHookTypeStats(data.currentPeriod.posts);

  return `Analizează datele contului @${data.handle} (${data.accountName}).

=== PERIOADA CURENTĂ (${data.currentPeriod.label}: ${data.currentPeriod.from} → ${data.currentPeriod.to}) ===
Postări: ${data.currentPeriod.postCount}
ER mediu: ${fmt(data.currentPeriod.avgErByReach)} | Save Rate mediu: ${fmt(data.currentPeriod.avgSavesPerReach)} | Send Rate mediu: ${fmt(data.currentPeriod.avgSendsPerReach)}
Reach mediu: ${data.currentPeriod.avgReach ?? 'N/A'} | Reach total: ${data.currentPeriod.totalReach ?? 'N/A'}
Followeri: ${data.currentPeriod.followerStart ?? 'N/A'} → ${data.currentPeriod.followerEnd ?? 'N/A'}

=== PERIOADA PRECEDENTĂ (${data.previousPeriod.label}) ===
Postări: ${data.previousPeriod.postCount}
ER mediu: ${fmt(data.previousPeriod.avgErByReach)} | Save Rate mediu: ${fmt(data.previousPeriod.avgSavesPerReach)} | Send Rate mediu: ${fmt(data.previousPeriod.avgSendsPerReach)}
Reach mediu: ${data.previousPeriod.avgReach ?? 'N/A'}

${data.currentPeriod.postCount < 5 ? '⚠️ ATENȚIE: Eșantion mic (sub 5 postări). Mediile sunt mai puțin reprezentative.' : ''}

=== POSTĂRI PERIOADĂ CURENTĂ ===

TOP 3 (ER cel mai ridicat):
${top3.map(formatPost).join('\n')}

BOTTOM 3 (ER cel mai scăzut):
${bottom3.map(formatPost).join('\n')}

=== ANALIZA TIPURILOR DE HOOK (pre-calculat) ===
${hookTypeStats}

=== DISTRIBUȚIE TEME (perioada curentă) ===
${data.themeBreakdown.map(t => `${t.theme}: ${t.postCount} postări | ER mediu: ${fmt(t.avgEr)} | Save Rate: ${fmt(t.avgSaves)}`).join('\n')}

Instrucțiuni specifice pentru această analiză:
1. Compară TOP 3 vs BOTTOM 3: ce au diferit ca hook, format, temă?
2. Confirmă sau infirmă statisticile de hook de mai sus cu raționament tău
3. Recomandările TREBUIE să menționeze postări specifice (folosește post_id) ca exemple
4. Dacă Save Rate sau Send Rate e N/A pentru un post, ignoră-l în calcule, nu comenta`;
}

function computeHookTypeStats(posts: PostForAnalysis[]): string {
  const byType: Record<string, { ers: number[]; count: number }> = {};
  for (const p of posts) {
    if (!byType[p.hookType]) byType[p.hookType] = { ers: [], count: 0 };
    byType[p.hookType].count++;
    if (p.erByReach != null && p.erByReach > 0) byType[p.hookType].ers.push(p.erByReach);
  }
  return Object.entries(byType)
    .map(([type, { ers, count }]) => {
      const avgEr = ers.length ? ers.reduce((a, b) => a + b, 0) / ers.length : null;
      return `${type}: ${count} postări | ER mediu: ${avgEr != null ? avgEr.toFixed(2) + '%' : 'N/A'}`;
    })
    .join('\n');
}

function fmt(v: number | null): string {
  return v == null ? 'N/A' : `${v.toFixed(2)}%`;
}
```

## Deliverable 3: Improve Content Patterns prompt

In `src/ai/analyses/content-patterns.ts`, update the system prompt and user prompt to:

**System prompt additions:**
- "Identifică cel puțin 2 PERECHI de postări pe aceeași temă cu performanțe diferite și explică diferența"
- "Analiza hook-urilor este PRIORITATEA #1 — ce tip de deschidere funcționează cel mai bine"
- "Pattern-urile trebuie să fie FALSIFICABILE: dacă spui 'întrebările performează mai bine', arată datele care susțin și datele care ar putea infirma"
- "Evită platitudini: 'conținutul educațional funcționează bine' nu e un pattern, e o observație. Un pattern e: 'Caruselurile cu întrebare în titlu și cifre în slide 2 au ER mediu 8.7% vs 5.1% fără aceste caracteristici'"

**User prompt additions:**
- Include TOATE postările (nu doar top/bottom), sortate de la mai bun la mai slab
- Include ziua săptămânii și ora publicării (pentru timing analysis)
- Include numărul de hashtag-uri (pentru hashtag density analysis)

## Deliverable 4: Improve Content Ideation prompt

In `src/ai/analyses/content-ideation.ts`, update to:

**System prompt:**
```
Ești un strategist de conținut financiar care propune idei bazate STRICT pe ce a funcționat.

Regula #1: Fiecare idee trebuie să fie inspirată dintr-un post real care a performat bine.
"Ai avut succes cu 'Nu pune toate ouăle...' (hook tip investing_principles + metaforă clasică). Propun: 'Nu te uita la dobândă. Uită-te la dobânda la dobânda la dobândă.' (compound interest, același pattern narativ)"

Regula #2: Fiecare idee include:
- Hook complet (primele 2 propoziții scrise, gata de folosit)
- Structura conținutului (pentru Reel: scena 1, 2, 3; pentru Carousel: slide 1, 2, 3...)
- De ce ar funcționa (bazat pe datele tale specifice, nu generic)
- Ce KPI ar îmbunătăți și de ce

Regula #3: Nu propune idei pe teme unde ai deja performanță slabă fără să explici ce vei face diferit.

Idei: 4-5 idei, mix de formate (cel puțin un Reel și un Carousel).
```

## Verification checklist

1. `pnpm build` succeeds, zero TS errors
2. `pnpm lint` passes
3. **Double multiplication fixed:** run weekly summary. ER values should be in range 0-100%, not 0-2000%.
4. **Specific sanity check:** if dashboard shows ER 9.28% for a post, the analysis should also show ~9.28%, not 928%.
5. **Null handling:** if a post has null saves_per_reach, it appears as "N/A" in the analysis, NOT as "0.00%", NOT as "anomalie a datelor".
6. **Hook analysis present:** the analysis narrative mentions hook types by name (question, statement, quote, etc.) with supporting ER data.
7. **Post-to-post comparison:** at least one key finding compares two specific posts explaining WHY one outperformed the other.
8. **Recommendations anchored:** each recommendation mentions at least one specific post_id or caption excerpt as its basis.
9. **14-day window:** the analysis header says "Ultimele 14 zile" not "Ultimele 7 zile". Previous period is correctly 14-28 days ago.
10. **Eșantion mic warning:** if a period has fewer than 5 posts, the narrative mentions "date limitate".
11. **Content Patterns improved:** generates specific patterns with evidence (e.g., "hook type X has Y% higher ER than hook type Z based on N posts").
12. **Content Ideation improved:** each idea has a FULL hook written out in Romanian, ready to use.
13. **Romanian quality:** diacritice corecte, ton profesional dar direct.
14. **No regression:** dashboard KPI cards still show correct values (9.28%, 0.35%, etc.).

## Notes for Claude Code

- The bug is almost certainly in `data-builders.ts` or `weekly-summary.ts` in the `fmtPct` / format helper function. Look for `* 100` applied to values that are already percentages.
- The `computeHookTypeStats` helper can be co-located in `weekly-summary.ts` or in `data-builders.ts` — whichever makes more sense given the existing structure.
- Don't change the analysis runner or server actions — only the data/prompt layer changes.
- The per-post data structure `PostForAnalysis` might need to be added to `types.ts` or defined inline in `data-builders.ts`. Choose based on reuse.
- Keep token usage reasonable: with 14 posts and truncated captions, we're at ~15-25K input tokens — well within Gemini's context and cost budget.
- Make sure `hookType` classification handles Romanian text correctly (the `command` pattern should match Romanian imperative verb starts: "Nu ", "Fă ", "Evită", "Începe", etc.).

## What Andrei will do after this prompt

1. `pnpm dev`, verify build clean
2. Generate a new Weekly Summary (the old one in DB is still there — history is preserved)
3. Verify ER values are in normal range (5-15%, not 500-1500%)
4. Look at key findings: do they compare specific posts? Do they analyze hooks?
5. Look at recommendations: are they tied to specific posts from your data?
6. Generate Content Patterns — does it produce specific, falsifiable patterns?
7. Generate Content Ideation — are the hooks written out fully in Romanian?
8. Report: is this actionable now, or still too generic?