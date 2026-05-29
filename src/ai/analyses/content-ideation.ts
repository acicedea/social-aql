import 'server-only';
import type { PatternsDataBundle } from './data-builders';

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
- structure: structura completă ca STRING (nu obiect!), ex: "Scena 1 (0-3s): hook. Scena 2 (3-10s): problemă. Scena 3 (10-30s): soluție. Scena 4: CTA."
- rationale: de ce ar funcționa, bazat pe datele tale
- target_kpi: ce KPI vrea să îmbunătățească și de ce
- cta_suggestion: CTA specific pentru finalul postării
- post_references: array [{post_id: "uuid-exact-din-date", caption: "primele 60 de caractere din caption"}] — postările care au inspirat această idee (din TOP 10 furnizate)

Returnează DOAR JSON valid conform schemei.`;

function fmt(v: number | null): string {
  return v == null ? 'N/A' : `${v.toFixed(2)}%`;
}

export function buildContentIdeationPrompt(data: PatternsDataBundle): string {
  const sanitize = (s: string) => s.replace(/"/g, "'").replace(/\n|\r/g, ' ');
  const topPosts = data.posts
    .slice(0, 10)
    .map(
      (p, i) =>
        `${i + 1}. [${p.postId}] ${p.mediaType} | temă: ${p.theme ?? 'other'} | ER ${fmt(p.erByReach)} | saves ${fmt(p.savesPerReach)}\n   Hook: "${sanitize(p.hook)}"\n   Tip: ${p.hookType} | Lungime: ${p.captionLength}`
    )
    .join('\n');

  const themeLines = data.themeStats
    .sort((a, b) => (b.avgEr ?? 0) - (a.avgEr ?? 0))
    .map((t) => `${t.theme}: ${t.count} postări, ER mediu ${fmt(t.avgEr)}, saves ${fmt(t.avgSaves)}`)
    .join('\n');

  const formatLines = data.formatStats
    .sort((a, b) => (b.avgEr ?? 0) - (a.avgEr ?? 0))
    .map((f) => `${f.mediaType}: ${f.count} postări, ER mediu ${fmt(f.avgEr)}`)
    .join('\n');

  return `Propune idei de conținut pentru @${data.handle} (${data.accountName}).

Perioadă analizată: ultimele ${data.rangeDays} zile | Total postări: ${data.totalPosts}

=== TOP 10 POSTĂRI DUPĂ PERFORMANȚĂ ===
${topPosts}

=== PERFORMANȚĂ PE TEME (sortate după ER) ===
${themeLines}

=== PERFORMANȚĂ PE FORMAT ===
${formatLines}

Pe baza acestor date, propune 4-5 idei concrete de postări. Fiecare idee trebuie să aibă hook-ul complet scris în română, gata de folosit.`;
}
