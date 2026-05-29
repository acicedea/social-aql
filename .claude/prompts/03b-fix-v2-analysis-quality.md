# AI LICHIDITATE — Prompt 03b-fix-v2: KPI Bug Fix + Actionable Analysis Upgrade

## Context

Two categories of issues with the current AI analysis output:

### Category A — Critical data bug
KPI percentages are multiplied by 100 twice. Dashboard shows correct values (ER 9.28%) but the weekly summary generated "ER 948.14%". Values in `post_metrics_snapshots` are already stored as percentages (9.28 = 9.28%). Something in the data builder or prompt formatter applies `* 100` again. Every generated analysis is currently factually wrong on all KPI numbers.

### Category B — Analysis quality
The generated analysis is too generic. Recommendations like "fă carouseluri educaționale" are correct but not anchored to specific posts or specific patterns. The system prompt doesn't instruct the AI to detect the specific actionable issues that matter for a financial creator. The data builder already sends hookType, dayOfWeek, captionLength — but the system prompt doesn't tell the AI what to DO with them.

This prompt fixes both categories. It does NOT change architecture, DB schema, UI, or the runner. Only data formatting and prompt text change.

## SCOPE BOUNDARY

This prompt changes FOUR files only:
1. `src/ai/analyses/data-builders.ts` — fix KPI value formatting
2. `src/ai/analyses/weekly-summary.ts` — rewrite system prompt + user prompt
3. `src/ai/analyses/content-patterns.ts` — rewrite system prompt
4. `src/ai/analyses/content-ideation.ts` — rewrite system prompt

If completing this requires touching anything else, STOP and report.

## DO NOT TOUCH

- KPI calculation engine (`src/lib/kpis/`)
- Gemini provider
- Analysis runner (`src/ai/analyses/runner.ts`)
- Analysis schemas (`src/ai/analyses/schemas.ts`)
- All UI components
- DB schema
- Sync logic
- Auth
- Everything else

## Carry-over (LOCKED)

- All design system, tokens, fonts
- All KPI values in dashboard remain correct (9.28% etc.) — we are NOT touching the KPI engine
- Theme detection working
- Existing analyses in DB stay (history preserved — new analyses will be correct)

---

## Deliverable 1: Fix KPI double-multiplication in data builders

### 1.1 Find and fix the bug

In `src/ai/analyses/data-builders.ts`, audit every place where a KPI value from `post_metrics_snapshots` is processed before being included in prompt data.

**The values from DB are already percentages:**
- `er_by_reach = 9.28` → means 9.28% → display as "9.28%"
- `saves_per_reach = 0.35` → means 0.35% → display as "0.35%"
- `sends_per_reach = 1.08` → means 1.08% → display as "1.08%"
- `reach_rate = 12.5` → means 12.5% → display as "12.5%"

**Find and remove any `* 100` applied to these values.** Common patterns to look for:

```ts
// WRONG — value is already a percentage, this produces 928%:
const erPct = (post.er_by_reach ?? 0) * 100;
const erPct = value / reach * 100;
const avg = (sum / count) * 100;

// CORRECT — pass through directly:
const erPct = post.er_by_reach; // already 9.28
```

Also check the `fmtPct` / `fmt` helper function used when building prompt strings. It must NOT multiply by 100:

```ts
// WRONG:
function fmtPct(v: number | null): string {
  return v == null ? 'N/A' : `${(v * 100).toFixed(2)}%`; // produces "928.00%"
}

// CORRECT:
function fmtPct(v: number | null): string {
  return v == null ? 'N/A' : `${v.toFixed(2)}%`; // produces "9.28%"
}
```

Search for ALL occurrences of `* 100` and `/ 100` in both `data-builders.ts` and `weekly-summary.ts`. Each one must be justified — if the value is already stored as a percentage, remove the multiplication.

### 1.2 Fix null and zero handling

When computing averages, null values AND zero values for rate metrics must be excluded. Zero saves_per_reach usually means "data not available from Meta API" for that media type, not literally zero saves.

```ts
// Use this for ALL KPI averages:
function safeAvg(values: (number | null)[]): number | null {
  const valid = values.filter((v): v is number => v != null && v > 0);
  if (valid.length === 0) return null;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}
```

Apply `safeAvg` to: er_by_reach, saves_per_reach, sends_per_reach, reach_rate, save_to_like_ratio.

For `reach` and `likes`, filter only nulls (zeros are legitimate).

In per-post data sent to AI: if saves_per_reach is null or 0, represent it as `null` in the data structure and display as "N/A" in the prompt string, never "0.00%".

### 1.3 Add sample size warning flag

Add to the weekly data bundle:

```ts
currentPeriod: {
  // existing fields...
  sampleSizeWarning: boolean; // true if postCount < 5
};
previousPeriod: {
  // existing fields...
  sampleSizeWarning: boolean;
};
```

This gets passed to the prompt and allows the AI to calibrate its confidence.

---

## Deliverable 2: Rewrite Weekly Summary system prompt

Replace `WEEKLY_SUMMARY_SYSTEM_PROMPT` in `src/ai/analyses/weekly-summary.ts` entirely.

The new system prompt has two parts: (A) the general analysis style, and (B) the actionable items checklist the AI must evaluate for every analysis.

```ts
export const WEEKLY_SUMMARY_SYSTEM_PROMPT = `Ești un analist de conținut specializat în creatori financiari români (nișă: economie, macro, trading, investiții).

Analizezi datele contului și produci un raport SPECIFIC și ACȚIONABIL în română.

## REGULI FUNDAMENTALE

**1. SPECIFICITATE OBLIGATORIE**
Fiecare recomandare TREBUIE să menționeze un post concret ca exemplu sau dovadă.
NU scrie: "postează mai mult despre FED"
SCRIE: "Postarea ta 'Există o instituție ale cărei decizii...' (ER 9.3%) a folosit un hook enigmatic care nu numea FED direct. Replică această formulă în 2 Reels săptămâna asta."

**2. RAȚIONAMENT VIZIBIL**
Arată calculele. Exemplu: "Hook-uri tip ÎNTREBARE: ER mediu 8.4% (4 postări). Hook-uri tip AFIRMAȚIE: ER mediu 5.1% (6 postări). Delta: +65% în favoarea întrebărilor."

**3. VALORILE KPI SUNT DEJA ÎN PROCENTE**
9.28 înseamnă 9.28%, NU 928%. Nu înmulți cu 100.
N/A sau valori lipsă = date indisponibile, NU performanță zero. Nu comenta valorile N/A.

**4. EȘANTION MIC**
Dacă o perioadă are sub 5 postări, menționează explicit "date limitate — pattern-urile pot fi instabile."

**5. COMPARAȚII POST-TO-POST**
Când două postări sunt pe aceeași temă dar performează diferit, explică DE CE.

---

## CHECKLIST OBLIGATORIU — evaluează fiecare item și include în analiză orice problemă detectată

Parcurge sistematic toate postările din date și verifică:

### HOOK QUALITY (pentru Reels)
- [ ] Hook prea lent: avg_watch_time / durata < 25% → semnal că primele 3 secunde nu rețin
  Mesaj: "Reel-ul [X] pierde audiența înainte de secunda 3. Testează să pui concluzia ÎNAINTE de explicație."
- [ ] Tip hook sub-performant: dacă hook-urile tip ÎNTREBARE au ER cu >30% mai bun decât AFIRMAȚIE, dar postările recente sunt afirmații
  Mesaj: "Ultimele N postări deschid cu afirmații, deși la tine întrebările performează cu X% mai bine. Revino la formula câștigătoare."
- [ ] Completion rate sub 35% la Reels sub 60s → conținut probabil prea lung sau hook nu livrează promisiunea

### CAPTION & SEO
- [ ] Keyword tematic absent din primele 125 caractere
  Verifică: tema detectată (FED, CRYPTO, MACRO etc.) apare în primele 125 caractere ale caption-ului?
  Mesaj: "Postarea despre [temă] nu menționează '[keyword]' în preview-ul vizibil. Algoritmul nu înțelege imediat subiectul."
- [ ] Caption prea scurt (sub 50 cuvinte) → insuficient pentru SEO semantic al algoritmului
- [ ] Fără CTA pentru save sau send pe postări cu saves_per_reach sub 0.5%
  Mesaj: "Carouselul educațional [X] nu are CTA de salvare. Postările cu CTA explicit obțin 40-60% mai multe saves."

### HASHTAG-URI
- [ ] Zero hashtag-uri → lipsesc etichetele de categorizare pentru algoritm
- [ ] Peste 20 hashtag-uri → risc de penalizare pentru spam
- [ ] Toate hashtag-urile sub 8 caractere → probabil toate broad (#finance, #economie), lipsesc niche tags

### ENGAGEMENT SIGNALS
- [ ] Save rate mediu sub 0.5% → conținut consumat, nu reținut
  Cauze tipice: lipsă structură de referință, fără liste/checklists, fără CTA
- [ ] Send rate ridicat (>1%) + save rate scăzut (<0.5%) → dezechilibru "hot take vs. ghid"
  Mesaj: "Audiența trimite conținutul tău (send 1.08% — excelent) dar nu îl salvează (0.35% — sub medie). Conținutul e perceput ca 'știre de distribuit', nu 'referință de păstrat'. Adaugă structuri de tip ghid."
- [ ] Comments/reach sub 0.1% → lipsesc întrebări care invită la conversație

### STRATEGIE DE POSTARE
- [ ] Tema cu ER >8% are sub 2 postări în perioada analizată → oportunitate neexploatată
- [ ] Mix Reels/Carousel dezechilibrat față de 60/40 optimal
  Benchmark: Reels = discovery (reach nou), Carousels = conversie (saves, follows)
- [ ] Postări concentrate în zile/ore cu performanță istorică slabă

### SPECIFIC CREATOR FINANCIAR
- [ ] Save-to-like ratio sub 0.1 la postări educaționale → conținut educational perceput ca entertainment, nu referință
- [ ] Tema 'other' peste 40% din postări → lipsă claritate tematică, algoritmul nu construiește "niche authority"
- [ ] Hook abstract fără implicație pentru portofoliu pe teme macro/educație
  Mesaj: "Hook-ul abstract 'Banii nu stau pe loc' nu creează urgență pentru un investor. Încearcă: 'Când banii nu circulă, activele tale pierd valoare. Iată ce faci concret.'"

---

## STRUCTURA RĂSPUNSULUI (follow schema exactly)

**headline:** O singură propoziție-diagnostic care rezumă săptămâna. NU generică ("Săptămână bună"). SPECIFICĂ: "Send rate excelent, dar saves cronice scăzute semnalează conținut de 'distribuit', nu de 'reținut'."

**period_comparison:** Compară cifrele concrete ale celor două perioade. Dacă eșantion mic, menționează.

**top_performers:** Maxim 3 postări, cu explicație SPECIFICĂ de ce au funcționat (hookType, temă, timing, structură).

**key_findings:** 3-5 findings, fiecare cu:
- title: scurt și specific ("Hook tip ÎNTREBARE outperformează cu 65%")
- detail: raționamentul complet cu cifre
- tone: positive/negative/neutral
- metric: valoarea relevantă

**recommendations:** EXACT 3, fiecare cu:
- action: concret, include FORMAT + TEMĂ + FRECVENȚĂ ("Fă 2 Reels de 30-45s despre FED săptămâna asta, deschizând cu o întrebare enigmatică despre ce înseamnă pentru portofoliu")
- rationale: datele care justifică
- priority: high/medium/low

**narrative_markdown:** 250-400 cuvinte. Include:
1. Paragraful 1: ce s-a schimbat față de perioada precedentă (cu cifre)
2. Paragraful 2: analiza hook-urilor și pattern-ul câștigător detectat
3. Paragraful 3: diagnosticul principal din checklist (ce trebuie schimbat)
4. Paragraful 4: cele 3 recomandări cu justificare specifică

Returnează DOAR JSON valid. Fără markdown code fences. Fără comentarii.`;
```

### 2.2 New user prompt builder

Replace `buildWeeklySummaryPrompt` to include per-post hook data AND pre-computed hook statistics that help the AI validate its own reasoning:

```ts
export function buildWeeklySummaryPrompt(data: WeeklyDataBundle): string {

  // Pre-compute hook type statistics for AI to reason about
  const hookStats = computeHookTypeStats(data.currentPeriod.posts);
  const dayStats = computeDayStats(data.currentPeriod.posts);

  const formatPost = (p: PostForAnalysis, idx: number) =>
    `  ${idx + 1}. [ID:${p.postId}] ${p.mediaType.toUpperCase()}
     Hook (primele 12 cuvinte): "${p.hook}"
     Tip hook: ${p.hookType} | Lungime caption: ${p.captionLength} (${p.captionWordCount} cuvinte)
     Are întrebare în caption: ${p.hasQuestion ? 'DA' : 'NU'} | Are CTA save/send: ${p.hasSaveCta ? 'DA' : 'NU'}
     Hashtag-uri: ${p.hashtagCount} | Temă: ${p.theme ?? 'other'}${p.themeSecondary ? ` + ${p.themeSecondary}` : ''}
     Publicat: ${p.dayOfWeek} ora ${p.hourOfDay}:00
     ER: ${fmt(p.erByReach)} | Save Rate: ${fmt(p.savesPerReach)} | Send Rate: ${fmt(p.sendsPerReach)} | Reach: ${p.reach ?? 'N/A'}
     Save-to-Like: ${p.saveToLikeRatio != null ? p.saveToLikeRatio.toFixed(3) : 'N/A'}
     Caption preview: "${(p.caption ?? '').slice(0, 150)}"`;

  const sortedByEr = [...data.currentPeriod.posts]
    .filter(p => p.erByReach != null && p.erByReach > 0)
    .sort((a, b) => (b.erByReach ?? 0) - (a.erByReach ?? 0));

  const top3 = sortedByEr.slice(0, 3);
  const bottom3 = sortedByEr.slice(-3).filter(p => !top3.includes(p)).reverse();

  return `Analizează datele contului @${data.handle} (${data.accountName}).

=== PERIOADA CURENTĂ: ${data.currentPeriod.from} → ${data.currentPeriod.to} ===
Postări analizate: ${data.currentPeriod.postCount}${data.currentPeriod.sampleSizeWarning ? ' ⚠️ EȘANTION MIC — sub 5 postări, date limitate' : ''}
ER mediu: ${fmt(data.currentPeriod.avgErByReach)}
Save Rate mediu: ${fmt(data.currentPeriod.avgSavesPerReach)}
Send Rate mediu: ${fmt(data.currentPeriod.avgSendsPerReach)}
Reach mediu: ${data.currentPeriod.avgReach != null ? Math.round(data.currentPeriod.avgReach) : 'N/A'}
Followeri: ${data.currentPeriod.followerStart ?? 'N/A'} → ${data.currentPeriod.followerEnd ?? 'N/A'}

=== PERIOADA PRECEDENTĂ: ${data.previousPeriod.from} → ${data.previousPeriod.to} ===
Postări: ${data.previousPeriod.postCount}${data.previousPeriod.sampleSizeWarning ? ' ⚠️ EȘANTION MIC' : ''}
ER mediu: ${fmt(data.previousPeriod.avgErByReach)}
Save Rate mediu: ${fmt(data.previousPeriod.avgSavesPerReach)}
Send Rate mediu: ${fmt(data.previousPeriod.avgSendsPerReach)}
Reach mediu: ${data.previousPeriod.avgReach != null ? Math.round(data.previousPeriod.avgReach) : 'N/A'}

=== STATISTICI PRE-CALCULATE (verifică cu propriul raționament) ===

Performanță pe TIP DE HOOK:
${hookStats}

Performanță pe ZI A SĂPTĂMÂNII:
${dayStats}

Distribuție teme cu KPIs:
${data.themeBreakdown.map(t =>
  `  ${t.theme}: ${t.postCount} postări | ER mediu: ${fmt(t.avgEr)} | Save Rate: ${fmt(t.avgSaves)} | Send Rate: ${fmt(t.avgSends)}`
).join('\n')}

=== TOP 3 POSTĂRI (ER cel mai ridicat) ===
${top3.map(formatPost).join('\n\n')}

=== BOTTOM 3 POSTĂRI (ER cel mai scăzut) ===
${bottom3.length > 0 ? bottom3.map(formatPost).join('\n\n') : '  (insuficiente date pentru comparație)'}

=== CHECKLIST DE VERIFICAT ===
Parcurge sistematic fiecare item din checklist-ul din system prompt și raportează orice problemă detectată în postările de mai sus.
Ancorează fiecare problemă în cel puțin un post concret (folosind ID-ul).`;
}

// --- Helpers ---

function computeHookTypeStats(posts: PostForAnalysis[]): string {
  const stats: Record<string, { ers: number[]; count: number }> = {};
  for (const p of posts) {
    if (!stats[p.hookType]) stats[p.hookType] = { ers: [], count: 0 };
    stats[p.hookType].count++;
    if (p.erByReach != null && p.erByReach > 0) {
      stats[p.hookType].ers.push(p.erByReach);
    }
  }
  return Object.entries(stats)
    .sort(([, a], [, b]) => {
      const avgA = a.ers.length ? a.ers.reduce((x, y) => x + y, 0) / a.ers.length : 0;
      const avgB = b.ers.length ? b.ers.reduce((x, y) => x + y, 0) / b.ers.length : 0;
      return avgB - avgA;
    })
    .map(([type, { ers, count }]) => {
      const avg = ers.length
        ? ers.reduce((x, y) => x + y, 0) / ers.length
        : null;
      return `  ${type.padEnd(12)} ${count} postări | ER mediu: ${avg != null ? avg.toFixed(2) + '%' : 'N/A'}`;
    })
    .join('\n');
}

function computeDayStats(posts: PostForAnalysis[]): string {
  const stats: Record<string, { ers: number[]; count: number }> = {};
  for (const p of posts) {
    if (!stats[p.dayOfWeek]) stats[p.dayOfWeek] = { ers: [], count: 0 };
    stats[p.dayOfWeek].count++;
    if (p.erByReach != null && p.erByReach > 0) {
      stats[p.dayOfWeek].ers.push(p.erByReach);
    }
  }
  const order = ['Luni', 'Marți', 'Miercuri', 'Joi', 'Vineri', 'Sâmbătă', 'Duminică'];
  return order
    .filter(d => stats[d])
    .map(d => {
      const { ers, count } = stats[d];
      const avg = ers.length
        ? ers.reduce((x, y) => x + y, 0) / ers.length
        : null;
      return `  ${d.padEnd(10)} ${count} postări | ER mediu: ${avg != null ? avg.toFixed(2) + '%' : 'N/A'}`;
    })
    .join('\n');
}

function fmt(v: number | null): string {
  if (v == null) return 'N/A';
  return `${v.toFixed(2)}%`;
}
```

### 2.3 Add missing fields to PostForAnalysis computation

In `data-builders.ts`, when building `PostForAnalysis` objects, add these computed fields if not already present:

```ts
// Caption word count
captionWordCount: (post.caption ?? '').split(/\s+/).filter(Boolean).length,

// Has CTA for save/send (Romanian + English patterns)
hasSaveCta: /salvează|save this|trimite|share this|bookmark|păstrează pentru|salvati/i
  .test(post.caption ?? ''),

// Save-to-like ratio (needs likes from the snapshot)
saveToLikeRatio: (snapshot.likes && snapshot.likes > 0 && snapshot.saves != null)
  ? snapshot.saves / snapshot.likes
  : null,

// Theme breakdown needs avgSends too (add sends_per_reach to theme stats)
```

Also add `avgSends` to the `themeBreakdown` entries:
```ts
themeBreakdown: Array<{
  theme: string;
  postCount: number;
  avgEr: number | null;
  avgSaves: number | null;
  avgSends: number | null;  // ADD THIS
}>
```

---

## Deliverable 3: Rewrite Content Patterns system prompt

Replace the system prompt in `src/ai/analyses/content-patterns.ts`:

```ts
export const CONTENT_PATTERNS_SYSTEM_PROMPT = `Ești un analist care identifică PATTERN-URI SPECIFICE în conținutul unui creator financiar român.

## REGULI

**Pattern-urile trebuie să fie falsificabile:**
NU: "conținutul educațional funcționează bine" (aceasta e o observație, nu un pattern)
DA: "Postările care deschid cu o ÎNTREBARE au ER mediu 8.4% vs 5.1% pentru afirmații, bazat pe 10 postări"

**Compară perechi de postări:**
Găsește cel puțin 2 perechi de postări pe aceeași temă dar cu performanțe diferite.
Explică concret CE diferă între ele (hookType, lungime, CTA, timing, structură).

**Checklist de patterns de căutat:**

### HOOK PATTERNS
- Care tip de hook (întrebare/afirmație/citat/cifră/comandă) performează cel mai bine?
- Există corelație între primele cuvinte din caption și ER?
- Hook-urile care numesc explicit un risc ("greșeală", "pericol", "capcană") vs cele care promit un beneficiu ("cum să", "iată", "descoperă") — care performează mai bine?

### FORMAT PATTERNS
- Reels vs Carousel: care aduce mai mult reach? Care aduce mai multe saves?
- Există o lungime optimă a caption-ului pentru audiența ta?
- Postările cu hashtag-uri niche vs broad: diferență de reach?

### TIMING PATTERNS
- Există o zi a săptămânii cu performanță consistentă mai bună?
- Există o fereastră orară preferată de audiența ta?

### THEMATIC PATTERNS
- Care temă aduce cel mai mult reach (discovery)?
- Care temă aduce cele mai multe saves (valoare percepută)?
- Există teme care generează sends dar nu saves sau invers?

### SPECIFIC FINANCIAL CREATOR
- Postările care menționează un instrument specific (FED, BTC, S&P) vs cele conceptuale (inflație, diversificare): care au ER mai bun?
- Save-to-like ratio pe temă: care teme sunt percepute ca "referință" vs "știre"?
- Postările cu implicație directă pentru portofoliu ("ce înseamnă pentru banii tăi") vs postările explicative pure: diferență de engagement?

## FORMAT RĂSPUNS

**patterns:** Fiecare pattern include:
- pattern: ce am observat, cu cifre
- evidence: postările specifice care dovedesc (ID-uri)
- impact: high/medium/low

**theme_performance:** Tabel cu fiecare temă, ER mediu, save rate, verdict în română

**format_insights:** Comparații Reels vs Carousel, scurt vs lung etc.

**recommendations:** 3 recomandări concrete bazate pe pattern-urile găsite

**narrative_markdown:** 250-350 cuvinte cu raționament complet

Toate valorile KPI sunt deja în procente (9.28 = 9.28%, nu 928%).
Returnează DOAR JSON valid conform schemei.`;
```

---

## Deliverable 4: Rewrite Content Ideation system prompt

Replace the system prompt in `src/ai/analyses/content-ideation.ts`:

```ts
export const CONTENT_IDEATION_SYSTEM_PROMPT = `Ești un strategist de conținut financiar care propune idei de postări DIRECT ACȚIONABILE pentru un creator român.

## REGULI FUNDAMENTALE

**Regula #1: Fiecare idee e inspirată dintr-un post real care a funcționat**
Nu propui idei în gol. Te uiți la ce a performat bine (ER ridicat, save rate bun, send rate bun) și extragi formula, nu subiectul.
Exemplu: "Postarea 'Nu pune toate ouăle...' a funcționat pentru că: (1) hook bazat pe o greșeală comună, (2) metaforă universală, (3) implicație directă pentru portofoliu. Propun să replici această formulă pe tema FED: 'Nu aștepta după FED să-ți spună ce să faci. Iată cum te pregătești înainte.'"

**Regula #2: Hook complet gata de folosit**
Pentru fiecare idee, scrie primele 2-3 propoziții COMPLETE, în română, gata de copiat.
NU: "sugerezi un hook despre inflație"
DA: scrie hook-ul exact: "Inflația nu apare din senin. Există 3 semne că urmează o creștere — și niciunul nu apare la știri."

**Regula #3: Structura completă**
- Pentru Reel: scena 1 (hook, 0-3s) + scena 2 (conflict/problemă, 3-10s) + scena 3 (rezolvare, 10-30s) + scena 4 (CTA, ultimele 3s)
- Pentru Carousel: slide 1 (cover/hook) + slide 2-N (conținut) + slide final (recap + CTA save)

**Regula #4: Justificare bazată pe date**
Explică DE CE ideea ar funcționa pe baza pattern-urilor din datele tale:
"Tema FED are ER mediu 9.3% la tine. Hook-urile tip ÎNTREBARE au 65% ER mai bun. Această idee combină ambele."

**Regula #5: Mix de formate**
Propune cel puțin: 2 Reels + 1 Carousel + 1 wildcard (format neobișnuit pentru tine)

**Regula #6: Include diagnostic și CTA strategy**
Pentru fiecare idee:
- Ce KPI țintești să îmbunătățești (save rate? send rate? reach?)
- Ce CTA specifici sugerezi la final
- Dacă save rate e problema generală: propune cel puțin 2 idei de tip "conținut de referință" (checklist, ghid, lista)

## FORMAT RĂSPUNS — ideas array

Fiecare idee conține:
- title: titlu intern pentru tine
- hook: primele 2-3 propoziții complete, gata de folosit, în română
- format: "Reel 30-45s" sau "Carousel 8-10 slide-uri" etc.
- theme: tema principală
- structure: structura completă (scenele pentru Reel, slide-urile pentru Carousel)
- rationale: de ce ar funcționa, bazat pe datele tale
- target_kpi: ce KPI vrea să îmbunătățească și de ce
- cta_suggestion: CTA specific pentru finalul postării

Returnează DOAR JSON valid conform schemei.`;
```

---

## Verification checklist

1. `pnpm build` succeeds, zero TypeScript errors
2. `pnpm lint` passes
3. **Bug KPI fix verified:** generate a new Weekly Summary. In the output, ER values must be in range 0-100%, not 0-2000%.
4. **Specific sanity check:** if `er_by_reach` in DB = 9.28, the analysis must show "9.28%", not "928.00%". Query before testing: `SELECT er_by_reach FROM post_metrics_snapshots ORDER BY captured_at DESC LIMIT 3;` — values should be in range 3-15.
5. **N/A instead of 0:** if a post has null saves, the analysis shows "N/A" not "0.00%" or "anomalie a datelor".
6. **Hook analysis present:** the narrative mentions specific hook types with ER data ("hook-urile tip ÎNTREBARE au ER X% vs Y% pentru AFIRMAȚIE").
7. **Post-to-post comparison:** at least one key finding compares two specific posts explaining WHY one outperformed (references post IDs or caption excerpts).
8. **Checklist items detected:** if the account has save rate < 0.5%, the analysis must mention the CTA problem. If there are posts without keywords in first 125 chars, must mention it. If hook type analysis shows a winner, must be in recommendations.
9. **Recommendations are specific:** each recommendation mentions a format + theme + frequency + concrete action (not "postează mai mult").
10. **Content Patterns: falsifiable patterns:** produces statements like "hook tip X are ER Y% vs Z% pentru tip W, bazat pe N postări" — not vague observations.
11. **Content Ideation: hooks written out:** each idea has a full hook in Romanian, 2-3 sentences, ready to copy. Not a description of a hook.
12. **Romanian quality:** correct diacritics, professional but direct tone.
13. **No regression:** dashboard KPI cards still show correct values (not affected by this change).
14. **Cost reasonable:** generating all 3 analyses uses ~3-4 Gemini calls. Verify in Google AI Studio.

## Notes for Claude Code

- The bug is almost certainly in `fmtPct()` or in how averages are computed. Look for `* 100` applied to values from `er_by_reach`, `saves_per_reach`, `sends_per_reach` columns. These columns already store percentages.
- Do NOT change the schemas in `schemas.ts` — the JSON structure is fine, only the prompt text and data formatting change.
- The `hasSaveCta` field: Romanian save CTAs include "salvează", "salvati", "păstrează", "bookmark". Also check for English "save this" since some creators mix languages.
- The `hookStats` and `dayStats` pre-computations are KEY — they give the AI validated numbers to reason from rather than asking it to compute from raw data (which it does poorly).
- Keep the `fmtPct` function consistent across all 4 files. If there's a shared utility file, put it there. If not, duplicate it consistently.
- The `safeAvg` function must be applied everywhere, not just in one place. Search for every `.reduce` or average calculation over KPI values.

## What Andrei will do after this prompt

1. `pnpm dev`, verify build clean
2. Delete the old (wrong) weekly summary from DB to avoid confusion:
```sql
   DELETE FROM ai_analyses WHERE created_at < NOW() - INTERVAL '1 hour';
   -- Or just keep it — it's labeled with its generation date
```
3. Generate a new Weekly Summary from `/dashboard/analyses`
4. Verify immediately: ER values in range 5-15%, not 500-1500%
5. Read key findings: do they mention specific hook types with percentages? Do they compare specific posts?
6. Read recommendations: are they tied to specific posts + format + frequency?
7. Generate Content Patterns — does it produce falsifiable patterns with post IDs?
8. Generate Content Ideation — are hooks written out in full Romanian, ready to copy?
9. Report back: paste the headline + one recommendation from the new analysis