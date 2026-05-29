import 'server-only';
import type { PatternsDataBundle } from './data-builders';

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
- evidence: ARRAY de obiecte [{post_id: "uuid-exact-din-date", caption: "primele 60 de caractere din caption-ul postării"}] — postările care dovedesc pattern-ul. NU string, NU ID-uri concatenate.
- impact: high/medium/low

**theme_performance:** Tabel cu fiecare temă, ER mediu, save rate, verdict în română

**format_insights:** Comparații Reels vs Carousel, scurt vs lung etc.

**recommendations:** Array cu exact 3 obiecte, fiecare cu câmpurile:
- action: acțiunea concretă de luat (string)
- rationale: justificarea bazată pe date (string)
- priority: exact unul din: "high", "medium", "low"

**narrative_markdown:** 250-350 cuvinte cu raționament complet

Toate valorile KPI sunt deja în procente (9.28 = 9.28%, nu 928%).
Returnează DOAR JSON valid conform schemei.`;

function fmt(v: number | null): string {
  return v == null ? 'N/A' : `${v.toFixed(2)}%`;
}

export function buildContentPatternsPrompt(data: PatternsDataBundle): string {
  const sanitize = (s: string) => s.replace(/"/g, "'").replace(/\n|\r/g, ' ');
  const postLines = data.posts
    .slice(0, 40)
    .map(
      (p, i) =>
        `${i + 1}. [${p.postId}] ${p.mediaType} | temă: ${p.theme ?? 'other'}${p.themeSecondary ? `+${p.themeSecondary}` : ''} | ER ${fmt(p.erByReach)} | saves ${fmt(p.savesPerReach)} | reach ${p.reach ?? 'N/A'} | ${p.dayOfWeek} ${p.hourOfDay}:00 | tip hook: ${p.hookType} | lungime: ${p.captionLength} | ${p.hashtagCount} hashtag-uri\n   Hook: "${sanitize(p.hook)}"\n   Caption: "${sanitize(p.caption.slice(0, 80))}..."`
    )
    .join('\n');

  const themeLines = data.themeStats
    .map((t) => `${t.theme}: ${t.count} postări, ER mediu ${fmt(t.avgEr)}, saves ${fmt(t.avgSaves)}`)
    .join('\n');

  const formatLines = data.formatStats
    .map((f) => `${f.mediaType}: ${f.count} postări, ER mediu ${fmt(f.avgEr)}`)
    .join('\n');

  return `Analizează pattern-urile de conținut pentru contul @${data.handle} (${data.accountName}).

Perioadă: ultimele ${data.rangeDays} zile | Total postări în analiză: ${data.totalPosts}

=== DATE POSTĂRI (sortate după ER desc) ===
${postLines}

=== STATISTICI TEME ===
${themeLines}

=== STATISTICI FORMAT ===
${formatLines}

Identifică pattern-urile ascunse și produce analiza de conținut. Prioritizează analiza hook-urilor și perechile de contrast.`;
}
