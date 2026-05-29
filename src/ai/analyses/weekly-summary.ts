import 'server-only';
import type { WeeklyDataBundle, PostForAnalysis } from './data-builders';

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

**period_comparison:** Obiect cu exact aceste câmpuri:
- summary: comparație narativă (1-2 propoziții cu cifre concrete). Dacă eșantion mic, menționează.
- er_change: variația ER ca string scurt, ex: "+1.2%" sau "-0.5%" sau "stabil"
- reach_change: variația reach ca string scurt, ex: "+800" sau "-300" sau "stabil"
- follower_change: variația followerilor ca string scurt, ex: "+120" sau "-30" sau "N/A"

**top_performers:** Array cu maxim 3 obiecte, fiecare cu exact aceste câmpuri:
- post_id: UUID-ul postării (copiază exact din datele furnizate, ex: "8d87469b-7c21-4c19-afb3-b5cd1e4200e6")
- caption: primele 60 caractere din caption
- metric: metrica principală ca string scurt, ex: "ER: 14.63%" sau "Save Rate: 1.2%"
- theme: tema postării sau null

**key_findings:** 3-5 findings, fiecare cu:
- title: scurt și specific ("Hook tip ÎNTREBARE outperformează cu 65%")
- detail: raționamentul complet cu cifre (fără UUID-uri în text)
- tone: positive/negative/neutral
- metric: valoarea relevantă
- evidence: (opțional) array [{post_id: "uuid-exact", caption: "primele 60 de caractere"}] pentru postările menționate în finding

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

function fmt(v: number | null): string {
  return v == null ? 'N/A' : `${v.toFixed(2)}%`;
}

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
      const avg = ers.length ? ers.reduce((x, y) => x + y, 0) / ers.length : null;
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
    .filter((d) => stats[d])
    .map((d) => {
      const { ers, count } = stats[d];
      const avg = ers.length ? ers.reduce((x, y) => x + y, 0) / ers.length : null;
      return `  ${d.padEnd(10)} ${count} postări | ER mediu: ${avg != null ? avg.toFixed(2) + '%' : 'N/A'}`;
    })
    .join('\n');
}

export function buildWeeklySummaryPrompt(data: WeeklyDataBundle): string {
  const hookStats = computeHookTypeStats(data.currentPeriod.posts);
  const dayStats = computeDayStats(data.currentPeriod.posts);

  const sanitize = (s: string) => s.replace(/"/g, "'").replace(/\n|\r/g, ' ');
  const formatPost = (p: PostForAnalysis, idx: number) =>
    `  ${idx + 1}. [ID:${p.postId}] ${p.mediaType.toUpperCase()}
     Hook (primele 12 cuvinte): "${sanitize(p.hook)}"
     Tip hook: ${p.hookType} | Lungime caption: ${p.captionLength} (${p.captionWordCount} cuvinte)
     Are întrebare în caption: ${p.hasQuestion ? 'DA' : 'NU'} | Are CTA save/send: ${p.hasSaveCta ? 'DA' : 'NU'}
     Hashtag-uri: ${p.hashtagCount} | Temă: ${p.theme ?? 'other'}${p.themeSecondary ? ` + ${p.themeSecondary}` : ''}
     Publicat: ${p.dayOfWeek} ora ${p.hourOfDay}:00
     ER: ${fmt(p.erByReach)} | Save Rate: ${fmt(p.savesPerReach)} | Send Rate: ${fmt(p.sendsPerReach)} | Reach: ${p.reach ?? 'N/A'}
     Save-to-Like: ${p.saveToLikeRatio != null ? p.saveToLikeRatio.toFixed(3) : 'N/A'}
     Caption preview: "${sanitize((p.caption ?? '').slice(0, 150))}"`;

  const sortedByEr = [...data.currentPeriod.posts]
    .filter((p) => p.erByReach != null && p.erByReach > 0)
    .sort((a, b) => (b.erByReach ?? 0) - (a.erByReach ?? 0));

  const top3 = sortedByEr.slice(0, 3);
  const bottom3 = sortedByEr.slice(-3).filter((p) => !top3.includes(p)).reverse();

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
${data.themeBreakdown.map((t) =>
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
