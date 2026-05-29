# AI LICHIDITATE — Prompt 05a: Post Diagnostic Checklist

## Context

Every post in `/dashboard/posts/[id]` currently shows KPI metrics and a theme tag. This prompt adds a **Diagnostic Checklist** section — a deterministic, TypeScript-only audit of each post against the actionable items framework. No AI calls. No async. Pure logic running on already-fetched post data.

The checklist answers: "What specifically could be improved about this post?" It's the per-post version of the dashboard's Diagnostic Flags section — but more granular, post-specific, and immediately actionable.

## SCOPE BOUNDARY

This prompt does THREE things only:
1. Implement the diagnostic engine (`src/lib/diagnostics/post-diagnostics.ts`)
2. Add the Diagnostic Checklist section to `/dashboard/posts/[id]`
3. Make diagnostic flag links in the dashboard Overview tab point to the posts page filtered by affected post IDs

No changes to AI analyses, no new DB migrations, no new API calls, no changes to sync.

## Carry-over (LOCKED)

- All design tokens, fonts, no-shadow rule
- All existing post detail page sections (KPI grid, metrics timeline, caption, hashtags)
- All other pages unchanged
- KPI calculation engine
- Dashboard diagnostic flags (Overview tab) — already working, just adding links

## Files allowed to change

- New: `src/lib/diagnostics/post-diagnostics.ts`
- New: `src/lib/diagnostics/types.ts`
- New: `src/components/posts/PostDiagnosticChecklist.tsx`
- New: `src/components/posts/DiagnosticChecklistItem.tsx`
- `src/app/dashboard/posts/[id]/page.tsx` — add checklist section
- `src/components/dashboard/DiagnosticItem.tsx` — add link to filtered posts page
- `src/app/dashboard/posts/page.tsx` — support `?ids=` filter param for affected posts

## DO NOT TOUCH

- KPI engine
- Sync logic
- AI analyses
- Theme detection
- Auth
- All other pages
- Dashboard tabs (already working)

---

## Deliverable 1: Diagnostic types

Create `src/lib/diagnostics/types.ts`:

```ts
export type DiagnosticSeverity = 'critical' | 'warning' | 'info' | 'ok';

export type DiagnosticCategory =
  | 'hook'
  | 'caption_seo'
  | 'hashtags'
  | 'engagement'
  | 'strategy'
  | 'financial_creator';

export interface DiagnosticCheck {
  id: string;
  category: DiagnosticCategory;
  severity: DiagnosticSeverity;
  title: string;           // short Romanian label, e.g. "Hook tip sub-optimal"
  detail: string;          // specific detail with numbers and context
  action: string | null;   // concrete fix suggestion, e.g. "Adaugă CTA: 'Salvează pentru mai târziu'"
  benchmark: string | null;// e.g. "Save Rate >1% = bun"
  passed: boolean;         // true = no problem detected (shown as ✓)
}

export interface PostDiagnosticResult {
  postId: string;
  totalChecks: number;
  criticalCount: number;
  warningCount: number;
  infoCount: number;
  okCount: number;
  score: number;           // 0-100, computed from passed checks weighted by severity
  checks: DiagnosticCheck[];
}
```

---

## Deliverable 2: Diagnostic engine

Create `src/lib/diagnostics/post-diagnostics.ts`:

This is pure TypeScript — no async, no DB calls, no AI. Takes a post + its latest metrics snapshot and returns a `PostDiagnosticResult`.

```ts
import type { DiagnosticCheck, PostDiagnosticResult } from './types';

export interface PostDiagnosticInput {
  // Post fields
  id: string;
  caption: string | null;
  mediaType: string;
  theme: string | null;
  themeSecondary: string | null;
  themeConfidence: string | null;
  hashtags: string[];
  publishedAt: string;

  // Computed fields (from data builder or post detail query)
  hook: string | null;                    // first 12 words
  hookType: string | null;                // 'question'|'statement'|'quote'|'number'|'command'|'other'
  captionWordCount: number;
  hasSaveCta: boolean;
  hashtagCount: number;
  captionLength: 'short' | 'medium' | 'long';

  // Latest snapshot metrics
  erByReach: number | null;
  savesPerReach: number | null;
  sendsPerReach: number | null;
  reach: number | null;
  likes: number | null;
  saves: number | null;
  shares: number | null;
  comments: number | null;
  videoViews: number | null;
  watchTimeSeconds: number | null;
  saveToLikeRatio: number | null;
  completionRate: number | null;
  reachRate: number | null;

  // Account context (for benchmarking against account averages)
  accountAvgErByReach: number | null;
  accountAvgSavesPerReach: number | null;
  accountAvgSendsPerReach: number | null;
  accountBestHookType: string | null;     // the hook type with highest avg ER for this account
}

export function runPostDiagnostics(input: PostDiagnosticInput): PostDiagnosticResult {
  const checks: DiagnosticCheck[] = [
    ...runHookChecks(input),
    ...runCaptionSeoChecks(input),
    ...runHashtagChecks(input),
    ...runEngagementChecks(input),
    ...runStrategyChecks(input),
    ...runFinancialCreatorChecks(input),
  ];

  const criticalCount = checks.filter(c => !c.passed && c.severity === 'critical').length;
  const warningCount = checks.filter(c => !c.passed && c.severity === 'warning').length;
  const infoCount = checks.filter(c => !c.passed && c.severity === 'info').length;
  const okCount = checks.filter(c => c.passed).length;

  // Score: start at 100, deduct per failed check
  // Critical = -20, Warning = -8, Info = -3
  const score = Math.max(0, Math.min(100,
    100
    - (criticalCount * 20)
    - (warningCount * 8)
    - (infoCount * 3)
  ));

  return {
    postId: input.id,
    totalChecks: checks.length,
    criticalCount,
    warningCount,
    infoCount,
    okCount,
    score,
    checks,
  };
}

// ====== HOOK CHECKS ======

function runHookChecks(input: PostDiagnosticInput): DiagnosticCheck[] {
  const checks: DiagnosticCheck[] = [];
  const isVideo = input.mediaType === 'reel' || input.mediaType === 'video';

  // Check 1: Hook type vs account best
  if (input.hookType && input.accountBestHookType && input.hookType !== input.accountBestHookType) {
    checks.push({
      id: 'hook_type_suboptimal',
      category: 'hook',
      severity: 'warning',
      title: 'Tip hook sub-optimal',
      detail: `Acest post folosește hook tip "${input.hookType}". Pe contul tău, hook-urile tip "${input.accountBestHookType}" au ER mediu mai bun.`,
      action: `Reformulează deschiderea ca ${input.accountBestHookType === 'question' ? 'o întrebare' : input.accountBestHookType === 'command' ? 'un imperativ' : 'un citat sau cifră'}.`,
      benchmark: `Hook tip "${input.accountBestHookType}" = cel mai bun ER mediu pe contul tău`,
      passed: false,
    });
  } else if (input.hookType && input.accountBestHookType && input.hookType === input.accountBestHookType) {
    checks.push({
      id: 'hook_type_suboptimal',
      category: 'hook',
      severity: 'info',
      title: 'Tip hook',
      detail: `Hook tip "${input.hookType}" — corespunde cu tipul care performează cel mai bine pe contul tău.`,
      action: null,
      benchmark: null,
      passed: true,
    });
  }

  // Check 2: Watch time / completion rate for Reels
  if (isVideo) {
    if (input.completionRate != null && input.completionRate < 35) {
      checks.push({
        id: 'completion_rate_low',
        category: 'hook',
        severity: 'critical',
        title: 'Completion rate scăzut',
        detail: `Completion rate ${input.completionRate.toFixed(1)}% — sub pragul de 35%. Publicul abandoneaza Reel-ul devreme.`,
        action: 'Testează să pui concluzia ÎNAINTE de explicație. Primele 3 secunde trebuie să creeze tensiune imediat.',
        benchmark: '>35% = acceptabil, >50% = bun, >65% = excelent',
        passed: false,
      });
    } else if (input.completionRate != null && input.completionRate >= 50) {
      checks.push({
        id: 'completion_rate_low',
        category: 'hook',
        severity: 'info',
        title: 'Completion rate',
        detail: `Completion rate ${input.completionRate.toFixed(1)}% — bun. Publicul vizionează până la final.`,
        action: null,
        benchmark: '>50% = bun',
        passed: true,
      });
    } else if (input.completionRate == null && input.watchTimeSeconds == null) {
      checks.push({
        id: 'completion_rate_low',
        category: 'hook',
        severity: 'info',
        title: 'Watch time nedisponibil',
        detail: 'Datele de watch time nu sunt disponibile pentru acest Reel via API. Verifică manual în Instagram Insights.',
        action: null,
        benchmark: null,
        passed: true, // not failed, just unavailable
      });
    }
  }

  return checks;
}

// ====== CAPTION SEO CHECKS ======

function runCaptionSeoChecks(input: PostDiagnosticInput): DiagnosticCheck[] {
  const checks: DiagnosticCheck[] = [];

  // Check 3: Caption length
  if (input.captionWordCount < 30) {
    checks.push({
      id: 'caption_too_short',
      category: 'caption_seo',
      severity: 'warning',
      title: 'Caption prea scurt',
      detail: `${input.captionWordCount} cuvinte — sub minimul de 50 recomandat pentru SEO semantic. Algoritmul nu are suficient context.`,
      action: 'Adaugă 2-3 propoziții explicative după hook. Descrie contextul, impactul, și relevanța pentru audiența ta.',
      benchmark: '50-150 cuvinte = optimal pentru SEO + engagement',
      passed: false,
    });
  } else if (input.captionWordCount >= 50 && input.captionWordCount <= 200) {
    checks.push({
      id: 'caption_too_short',
      category: 'caption_seo',
      severity: 'info',
      title: 'Lungime caption',
      detail: `${input.captionWordCount} cuvinte — în range-ul optimal.`,
      action: null,
      benchmark: '50-200 cuvinte = optimal',
      passed: true,
    });
  }

  // Check 4: Keyword in first 125 chars
  const preview = (input.caption ?? '').slice(0, 125).toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const themeKeywordInPreview = input.theme && input.theme !== 'other'
    ? themeAppearsInText(input.theme, preview)
    : true; // can't check 'other' theme
  if (!themeKeywordInPreview && input.theme && input.theme !== 'other') {
    checks.push({
      id: 'keyword_in_preview',
      category: 'caption_seo',
      severity: 'info',
      title: 'Keyword absent din preview',
      detail: `Tema "${input.theme}" nu apare în primele 125 caractere (zona vizibilă fără "Mai mult"). Algoritmul prioritizează primele cuvinte.`,
      action: `Mută un keyword relevant (${getThemeKeyword(input.theme)}) în prima propoziție.`,
      benchmark: 'Keyword principal în primele 125 caractere',
      passed: false,
    });
  } else {
    checks.push({
      id: 'keyword_in_preview',
      category: 'caption_seo',
      severity: 'info',
      title: 'Keyword în preview',
      detail: 'Tema principală apare în zona vizibilă a caption-ului.',
      action: null,
      benchmark: null,
      passed: true,
    });
  }

  // Check 5: CTA for save (only for carousels and educational content)
  const isEducational = input.theme === 'education' || input.theme === 'investing_principles';
  const isCarousel = input.mediaType === 'carousel';
  if ((isCarousel || isEducational) && !input.hasSaveCta) {
    checks.push({
      id: 'no_save_cta',
      category: 'caption_seo',
      severity: input.savesPerReach != null && input.savesPerReach < 0.5 ? 'warning' : 'info',
      title: 'Fără CTA de salvare',
      detail: `${isCarousel ? 'Carousel' : 'Postare educațională'} fără apel la salvare. Postările cu CTA explicit obțin 40-60% mai multe saves.`,
      action: 'Adaugă pe ultimul slide sau la finalul caption-ului: "Salvează pentru mai târziu 🔖" sau "Trimite cuiva care investește."',
      benchmark: 'Carouselurile și conținutul educațional beneficiază cel mai mult de CTA save',
      passed: false,
    });
  } else if (input.hasSaveCta) {
    checks.push({
      id: 'no_save_cta',
      category: 'caption_seo',
      severity: 'info',
      title: 'CTA de salvare prezent',
      detail: 'Caption-ul include un apel la salvare sau distribuire.',
      action: null,
      benchmark: null,
      passed: true,
    });
  }

  return checks;
}

// ====== HASHTAG CHECKS ======

function runHashtagChecks(input: PostDiagnosticInput): DiagnosticCheck[] {
  const checks: DiagnosticCheck[] = [];

  // Check 6: Zero hashtags
  if (input.hashtagCount === 0) {
    checks.push({
      id: 'no_hashtags',
      category: 'hashtags',
      severity: 'warning',
      title: 'Fără hashtag-uri',
      detail: 'Niciun hashtag. Algoritmul folosește hashtag-urile ca etichete de categorizare pentru distribuție.',
      action: 'Adaugă 3-5 hashtag-uri: 1-2 broad (#finante, #economie) + 2-3 niche (#educatiefinanciara, #investitorromani, #' + (input.theme ?? 'macro') + ').',
      benchmark: '3-5 hashtag-uri relevante = optimal',
      passed: false,
    });
  } else if (input.hashtagCount > 20) {
    checks.push({
      id: 'too_many_hashtags',
      category: 'hashtags',
      severity: 'info',
      title: 'Prea multe hashtag-uri',
      detail: `${input.hashtagCount} hashtag-uri — poate părea spam. Calitatea bate cantitatea.`,
      action: 'Reduce la 5-10 hashtag-uri extrem de relevante. Elimină hashtag-urile generice cu milioane de postări.',
      benchmark: '5-10 = recomandat în 2026',
      passed: false,
    });
  } else if (input.hashtagCount >= 3 && input.hashtagCount <= 10) {
    checks.push({
      id: 'no_hashtags',
      category: 'hashtags',
      severity: 'info',
      title: 'Hashtag-uri',
      detail: `${input.hashtagCount} hashtag-uri — în range-ul optimal.`,
      action: null,
      benchmark: '3-10 = optimal',
      passed: true,
    });
  } else {
    // 1-2 hashtags
    checks.push({
      id: 'few_hashtags',
      category: 'hashtags',
      severity: 'info',
      title: 'Puține hashtag-uri',
      detail: `${input.hashtagCount} hashtag-uri — poți adăuga 2-3 în plus pentru mai multă acoperire.`,
      action: 'Adaugă hashtag-uri de nișă specifice temei postării.',
      benchmark: '3-10 = optimal',
      passed: false,
    });
  }

  return checks;
}

// ====== ENGAGEMENT CHECKS ======

function runEngagementChecks(input: PostDiagnosticInput): DiagnosticCheck[] {
  const checks: DiagnosticCheck[] = [];

  // Check 7: ER vs account average
  if (input.erByReach != null && input.accountAvgErByReach != null) {
    const delta = ((input.erByReach - input.accountAvgErByReach) / input.accountAvgErByReach) * 100;
    if (delta < -30) {
      checks.push({
        id: 'er_below_average',
        category: 'engagement',
        severity: 'warning',
        title: 'ER sub media contului',
        detail: `ER ${input.erByReach.toFixed(2)}% vs media contului ${input.accountAvgErByReach.toFixed(2)}% (${delta.toFixed(0)}% sub medie).`,
        action: 'Analizează ce e diferit față de postările tale cu ER ridicat: hook, temă, format, timing.',
        benchmark: `Media contului tău: ${input.accountAvgErByReach.toFixed(2)}%`,
        passed: false,
      });
    } else if (delta > 30) {
      checks.push({
        id: 'er_below_average',
        category: 'engagement',
        severity: 'info',
        title: 'ER peste media contului',
        detail: `ER ${input.erByReach.toFixed(2)}% — cu ${delta.toFixed(0)}% peste media contului. Postare de top.`,
        action: null,
        benchmark: null,
        passed: true,
      });
    }
  }

  // Check 8: Save rate
  if (input.savesPerReach != null && input.savesPerReach < 0.3) {
    checks.push({
      id: 'save_rate_low',
      category: 'engagement',
      severity: input.mediaType === 'carousel' ? 'warning' : 'info',
      title: 'Save rate scăzut',
      detail: `Save rate ${input.savesPerReach.toFixed(2)}% — sub benchmark minim (0.5%). Conținutul e consumat, nu reținut.`,
      action: input.mediaType === 'carousel'
        ? 'Pentru carousel: adaugă un slide final cu recap + CTA save. Structurează conținutul ca "ghid de referință".'
        : 'Adaugă o listă sau structură clară pe care oamenii vor să o salveze. Evită conținut pur narativ.',
      benchmark: '0.5% = minim, 1% = bun, 3%+ = excelent',
      passed: false,
    });
  } else if (input.savesPerReach != null && input.savesPerReach >= 1) {
    checks.push({
      id: 'save_rate_low',
      category: 'engagement',
      severity: 'info',
      title: 'Save rate',
      detail: `Save rate ${input.savesPerReach.toFixed(2)}% — bun. Audiența salvează conținutul pentru referință.`,
      action: null,
      benchmark: null,
      passed: true,
    });
  }

  // Check 9: Save-to-Like ratio for educational content
  const isEducational = input.theme === 'education' || input.theme === 'investing_principles';
  if (isEducational && input.saveToLikeRatio != null && input.saveToLikeRatio < 0.1) {
    checks.push({
      id: 'edu_save_to_like',
      category: 'financial_creator',
      severity: 'warning',
      title: 'Conținut educațional perceput ca entertainment',
      detail: `Save-to-like ratio ${input.saveToLikeRatio.toFixed(3)} pe conținut educațional (benchmark: >0.2). Oamenii apreciază dar nu salvează.`,
      action: 'Adaugă elemente de "referință": liste numerotate, formule, pași clari. Conținutul educațional trebuie să fie util să revii la el.',
      benchmark: '>0.2 = conținut de referință, <0.1 = conținut de entertainment',
      passed: false,
    });
  }

  return checks;
}

// ====== STRATEGY CHECKS ======

function runStrategyChecks(input: PostDiagnosticInput): DiagnosticCheck[] {
  const checks: DiagnosticCheck[] = [];

  // Check 10: Theme confidence
  if (input.theme === 'other' || input.themeConfidence === 'low') {
    checks.push({
      id: 'theme_unclear',
      category: 'strategy',
      severity: 'info',
      title: 'Temă neclară',
      detail: input.theme === 'other'
        ? 'Postarea nu a putut fi clasificată tematic. Caption-ul poate fi prea abstract sau pe un subiect nou.'
        : `Tema "${input.theme}" detectată cu confidence scăzut. Caption-ul poate fi ambiguu tematic.`,
      action: 'Adaugă cuvinte cheie specifice temei în caption. Algoritmul construiește "niche authority" prin claritate tematică repetată.',
      benchmark: 'High confidence = algoritmul înțelege și distribuie corect',
      passed: input.theme !== 'other' && input.themeConfidence !== 'low',
    });
  }

  return checks;
}

// ====== FINANCIAL CREATOR CHECKS ======

function runFinancialCreatorChecks(input: PostDiagnosticInput): DiagnosticCheck[] {
  const checks: DiagnosticCheck[] = [];

  // Check 11: Hook abstraction for financial content
  const isMacroOrEdu = ['macro', 'education', 'investing_principles', 'economy_eu'].includes(input.theme ?? '');
  const hookIsAbstract = input.hookType === 'statement' &&
    input.hook != null &&
    !/(portofoliu|bani tăi|banii tăi|investiție|pierdere|câștig|dobândă|\d+%|\d+ lei|\$\d+)/i.test(input.hook);

  if (isMacroOrEdu && hookIsAbstract && input.erByReach != null &&
      input.accountAvgErByReach != null &&
      input.erByReach < input.accountAvgErByReach) {
    checks.push({
      id: 'hook_too_abstract',
      category: 'financial_creator',
      severity: 'info',
      title: 'Hook abstract fără implicație personală',
      detail: `Hook: "${input.hook}". Pe conținut ${input.theme}, hook-urile cu implicație directă pentru portofoliu sau banii personali performează mai bine.`,
      action: 'Adaugă implicația personală în hook: "Când X se întâmplă, banii tăi Y. Iată ce faci concret."',
      benchmark: 'Hook financiar acționabil > hook filozofic pentru retail investors',
      passed: false,
    });
  }

  return checks;
}

// ====== HELPERS ======

function themeAppearsInText(theme: string, text: string): boolean {
  const themeKeywords: Record<string, string[]> = {
    fed: ['fed', 'powell', 'fomc', 'rezerva federala', 'federal reserve'],
    crypto: ['bitcoin', 'btc', 'ethereum', 'crypto', 'cripto'],
    stocks_us: ['sp500', 's&p', 'nasdaq', 'nvidia', 'apple', 'wall street'],
    gold: ['aur', 'xau', 'gold', 'argint'],
    forex: ['dxy', 'dolar', 'dollar', 'usd', 'forex', 'valuta'],
    real_estate: ['imobiliar', 'real estate', 'locuinte', 'ipoteca'],
    economy_eu: ['bce', 'ecb', 'lagarde', 'europa', 'eurozona'],
    macro: ['inflatie', 'inflation', 'pib', 'gdp', 'recesiune', 'recession'],
    education: ['compound', 'dobanda', 'dobânda', 'educatie', 'minune'],
    investing_principles: ['diversifica', 'ouale', 'portofoliu', 'risc', 'alocare', 'dca'],
    trading_strategy: ['trading', 'algoritm', 'weekly', 'piata saptamanii'],
    emerging_markets: ['emergente', 'brics', 'china', 'india'],
  };
  const keywords = themeKeywords[theme] ?? [];
  return keywords.some(kw => text.includes(kw.normalize('NFD').replace(/[\u0300-\u036f]/g, '')));
}

function getThemeKeyword(theme: string): string {
  const primaryKeywords: Record<string, string> = {
    fed: 'FED / Federal Reserve',
    crypto: 'Bitcoin / crypto',
    stocks_us: 'S&P 500 / Wall Street',
    gold: 'aur / XAU',
    forex: 'dolar / DXY',
    real_estate: 'imobiliare',
    economy_eu: 'BCE / Europa',
    macro: 'inflație / PIB',
    education: 'concept financiar',
    investing_principles: 'diversificare / portofoliu',
    trading_strategy: 'strategie / piață',
    emerging_markets: 'piețe emergente',
  };
  return primaryKeywords[theme] ?? theme;
}
```

---

## Deliverable 3: DiagnosticChecklistItem component

Create `src/components/posts/DiagnosticChecklistItem.tsx`:

```tsx
'use client';

import type { DiagnosticCheck } from '@/lib/diagnostics/types';
import { Eyebrow, Body, Mono } from '@/components/design-system';

interface Props {
  check: DiagnosticCheck;
}

export function DiagnosticChecklistItem({ check }: Props) {
  const severityColor = check.passed
    ? 'var(--color-accent-lime-dim)'
    : check.severity === 'critical' ? 'var(--color-accent-coral)'
    : check.severity === 'warning' ? 'var(--color-accent-coral-dim)'
    : 'var(--color-border-default)';

  const icon = check.passed ? '✓' : check.severity === 'critical' ? '✗' : '⚠';
  const iconColor = check.passed
    ? 'var(--color-accent-lime)'
    : check.severity === 'critical' ? 'var(--color-accent-coral)'
    : check.severity === 'warning' ? 'var(--color-accent-coral)'
    : 'var(--color-text-muted)';

  return (
    <div style={{
      display: 'flex',
      gap: 12,
      padding: '12px 16px',
      borderLeft: `4px solid ${severityColor}`,
      background: 'var(--color-bg-card)',
      marginBottom: 4,
    }}>
      {/* Icon */}
      <Mono style={{ color: iconColor, fontSize: 14, minWidth: 16, marginTop: 2 }}>
        {icon}
      </Mono>

      {/* Content */}
      <div style={{ flex: 1 }}>
        {/* Category + Title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <Eyebrow tone="muted" style={{ fontSize: 10 }}>
            {check.category.replace('_', ' ').toUpperCase()}
          </Eyebrow>
          <Mono style={{
            fontWeight: 700,
            fontSize: 13,
            color: check.passed ? 'var(--color-text-secondary)' : 'var(--color-text-primary)',
          }}>
            {check.title}
          </Mono>
        </div>

        {/* Detail */}
        <Body tone="secondary" style={{ fontSize: 13, marginBottom: check.action ? 6 : 0 }}>
          {check.detail}
        </Body>

        {/* Action (only if failed) */}
        {!check.passed && check.action && (
          <Body style={{ fontSize: 12, color: 'var(--color-accent-lime)', marginBottom: 4 }}>
            → {check.action}
          </Body>
        )}

        {/* Benchmark */}
        {check.benchmark && (
          <Mono tone="muted" style={{ fontSize: 11 }}>
            BENCHMARK: {check.benchmark}
          </Mono>
        )}
      </div>
    </div>
  );
}
```

---

## Deliverable 4: PostDiagnosticChecklist component

Create `src/components/posts/PostDiagnosticChecklist.tsx`:

```tsx
import type { PostDiagnosticResult } from '@/lib/diagnostics/types';
import { DiagnosticChecklistItem } from './DiagnosticChecklistItem';
import { Eyebrow, H3, Mono, Body } from '@/components/design-system';

interface Props {
  result: PostDiagnosticResult;
}

export function PostDiagnosticChecklist({ result }: Props) {
  const failed = result.checks.filter(c => !c.passed);
  const passed = result.checks.filter(c => c.passed);

  // Score color
  const scoreColor = result.score >= 80
    ? 'var(--color-accent-lime)'
    : result.score >= 60
    ? 'var(--color-text-primary)'
    : 'var(--color-accent-coral)';

  const scoreLabel = result.score >= 80 ? 'BINE' : result.score >= 60 ? 'MEDIU' : 'NECESITĂ ATENȚIE';

  return (
    <section style={{ marginTop: 40 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 16 }}>
        <div>
          <Eyebrow tone="muted">DIAGNOSTIC · POSTARE</Eyebrow>
          <H3>Audit Postare</H3>
        </div>
        {/* Score */}
        <div style={{ textAlign: 'right' }}>
          <Mono style={{ fontSize: 32, fontWeight: 700, color: scoreColor }}>
            {result.score}
          </Mono>
          <Mono tone="muted" style={{ fontSize: 11 }}>
            SCOR · {scoreLabel}
          </Mono>
        </div>
      </div>

      {/* Summary badges */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
        {result.criticalCount > 0 && (
          <Mono style={{ color: 'var(--color-accent-coral)', fontSize: 12 }}>
            ✗ {result.criticalCount} CRITICE
          </Mono>
        )}
        {result.warningCount > 0 && (
          <Mono style={{ color: 'var(--color-accent-coral)', fontSize: 12, opacity: 0.7 }}>
            ⚠ {result.warningCount} ATENȚIONĂRI
          </Mono>
        )}
        {result.infoCount > 0 && (
          <Mono tone="muted" style={{ fontSize: 12 }}>
            ℹ {result.infoCount} INFO
          </Mono>
        )}
        {result.okCount > 0 && (
          <Mono style={{ color: 'var(--color-accent-lime-dim)', fontSize: 12 }}>
            ✓ {result.okCount} OK
          </Mono>
        )}
      </div>

      {/* Failed checks first */}
      {failed.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          {failed
            .sort((a, b) => {
              const order = { critical: 0, warning: 1, info: 2, ok: 3 };
              return order[a.severity] - order[b.severity];
            })
            .map(check => (
              <DiagnosticChecklistItem key={check.id} check={check} />
            ))}
        </div>
      )}

      {/* Passed checks (collapsed by default) */}
      {passed.length > 0 && (
        <details style={{ marginTop: 8 }}>
          <summary style={{ cursor: 'pointer', marginBottom: 8 }}>
            <Mono tone="muted" style={{ fontSize: 12, display: 'inline' }}>
              ✓ {passed.length} VERIFICĂRI TRECUTE (click pentru detalii)
            </Mono>
          </summary>
          {passed.map(check => (
            <DiagnosticChecklistItem key={check.id} check={check} />
          ))}
        </details>
      )}

      {failed.length === 0 && (
        <Body tone="secondary" style={{ textAlign: 'center', padding: '24px 0' }}>
          Toate verificările au trecut. Postare bine optimizată.
        </Body>
      )}
    </section>
  );
}
```

---

## Deliverable 5: Wire into Post Detail page

In `src/app/dashboard/posts/[id]/page.tsx`, add the diagnostic checklist after the existing PostKpiGrid section.

The page needs to:

1. Fetch the post + latest snapshot (already done)
2. Fetch account average KPIs (new query — needed for benchmarking)
3. Fetch account best hook type (new query)
4. Build the `PostDiagnosticInput` object
5. Run `runPostDiagnostics(input)`
6. Pass the result to `<PostDiagnosticChecklist>`

New queries needed in the page:

```ts
// Account averages for benchmarking (last 30 days)
const { data: accountAverages } = await supabase
  .from('post_metrics_snapshots')
  .select('er_by_reach, saves_per_reach, sends_per_reach')
  .in('post_id',
    supabase
      .from('posts')
      .select('id')
      .eq('account_id', post.account_id)
  )
  .not('er_by_reach', 'is', null)
  .gt('er_by_reach', 0);

const avgEr = safeAvg(accountAverages?.map(r => r.er_by_reach) ?? []);
const avgSaves = safeAvg(accountAverages?.map(r => r.saves_per_reach) ?? []);

// Best hook type (most common hook type among top 20% by ER)
// Simple approach: compute from posts with hook_type field
// This requires hook_type stored on posts — if not stored, compute from caption
```

Note: `hookType`, `hasSaveCta`, `captionWordCount` are computed fields. If they're not stored in the DB (they were computed in memory in the data builder for analyses), compute them again here using the same helper functions. Extract those helpers into a shared utility file: `src/lib/content-analysis/caption-utils.ts` so both data-builders and the post detail page can import them.

```ts
// src/lib/content-analysis/caption-utils.ts
export function extractHook(caption: string | null): string
export function classifyHookType(caption: string | null): HookType
export function classifyCaptionLength(caption: string | null): 'short' | 'medium' | 'long'
export function countCaptionWords(caption: string | null): number
export function detectSaveCta(caption: string | null): boolean
export function computeSaveToLikeRatio(saves: number | null, likes: number | null): number | null
```

These functions are already implemented in data-builders.ts — move them to caption-utils.ts and import from there.

---

## Deliverable 6: Filtered posts link from Dashboard

In `src/app/dashboard/posts/page.tsx`, add support for `?ids=` URL param:

```ts
// If ?ids=uuid1,uuid2,uuid3 is in the URL, filter to only those posts
const idFilter = params.ids?.split(',').filter(Boolean) ?? [];
if (idFilter.length > 0) {
  postsQuery = postsQuery.in('id', idFilter);
  // Show a banner: "Afișând N postări afectate de problema X"
}
```

In `src/components/dashboard/DiagnosticItem.tsx` (existing), make the "→ N postări afectate" link point to:
```
/dashboard/posts?ids=uuid1,uuid2,uuid3
```

This closes the loop: see a diagnostic flag on dashboard → click → see exactly the posts with that problem.

---

## Verification checklist

1. `pnpm build` succeeds, zero TypeScript errors
2. `pnpm lint` passes
3. **Diagnostic engine is pure:** `runPostDiagnostics` has no async calls, no imports from `@supabase/*`, no AI. Verify by reading the import chain.
4. **Post detail shows checklist:** navigate to any post via `/dashboard/posts/[id]`. A "Diagnostic · Postare" section appears below the KPI grid.
5. **Score displayed:** score 0-100 shown in top-right of the section, colored lime (≥80) / white (≥60) / coral (<60).
6. **Passed checks collapsed:** by default only failed checks are visible. Passed checks are in a `<details>` element.
7. **Left-border colors:** critical = coral, warning = coral-dim, info = muted, ok = lime-dim. Matches design system.
8. **Action text in lime:** the "→ action" suggestion appears in lime color.
9. **Check: no hashtags detected:** for a post with 0 hashtags, the "Fără hashtag-uri" check shows as warning.
10. **Check: caption too short:** for a post with < 30 words in caption, "Caption prea scurt" shows.
11. **Check: save CTA:** for a carousel without "salvează" in caption, "Fără CTA de salvare" shows.
12. **Check: ER vs account average:** for a post with ER significantly below account average, "ER sub media contului" shows with correct delta.
13. **Dashboard link works:** clicking "→ 7 postări afectate" on a diagnostic flag in Overview tab navigates to `/dashboard/posts?ids=...` showing only those posts.
14. **Caption utils extracted:** `src/lib/content-analysis/caption-utils.ts` exists and is imported by both `data-builders.ts` and the post detail page.
15. **No regression** on dashboard, posts list, analyses pages.
16. **Romanian diacritice** correct throughout.

## Notes for Claude Code

- `runPostDiagnostics` must be importable in both server and client contexts (it's pure TS, no imports that restrict it). Put it in `src/lib/diagnostics/` which has no `'server-only'` constraint.
- The `accountBestHookType` computation: if you don't have hook_type stored per post in DB yet, compute it on the fly from caption using `classifyHookType()`. For account-level best hook type, you'd need to process all posts' captions — if that's too heavy for a page load, simplify: pass `null` for `accountBestHookType` and skip that check. It can be added later when we store hookType in DB.
- The `<details>` element for passed checks must be styled flat — no shadows, matching design system. Use `style={{ listStyle: 'none' }}` on the summary to remove the default triangle if desired, or keep it (it's a minor detail).
- The `?ids=` URL param: encode the UUIDs directly. They're safe for URLs. No need to encode/encrypt.
- Keep `DiagnosticChecklistItem` as a server component if possible (no interactivity needed). The parent `PostDiagnosticChecklist` is also fine as server component — no useState needed.
- The score formula (100 - 20*critical - 8*warning - 3*info) is intentionally simple. Don't over-engineer it.

## What Andrei will do after this prompt

1. `pnpm dev`, verify build clean
2. Navigate to any post via `/dashboard/posts` → click → open post detail
3. Scroll to "Audit Postare" section
4. Verify checks appear: some failed (coral), some passed (collapsed)
5. Click "→ N postări afectate" on a dashboard diagnostic flag → verify filtered posts page
6. Test on a few specific posts:
   - A post with 0 hashtags → should show "Fără hashtag-uri" warning
   - A carousel without "salvează" in caption → should show "Fără CTA de salvare"
   - A post with very short caption → should show "Caption prea scurt"
7. Report: screenshot of checklist on one post + any bugs