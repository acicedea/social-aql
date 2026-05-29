# Post Diagnostic Checklist Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a deterministic, TypeScript-only diagnostic audit section to each post detail page, and wire dashboard diagnostic flag links to filter the posts list by affected post IDs.

**Architecture:** Extract caption utility functions into a shared module, implement a pure diagnostic engine, build two UI components, wire them into the post detail page, and add `?ids=` filter support to the posts list. DiagnosticItem already links to `?ids=` — only the receiving side needs updating.

**Tech Stack:** Next.js 14 App Router (server components), TypeScript, Supabase (server client), inline styles following existing design token pattern.

---

## Pre-flight observations

- `src/components/dashboard/DiagnosticItem.tsx` already generates `/dashboard/posts?ids=...` links — **no changes needed there**.
- Typography components (`Body`, `Mono`, `Eyebrow`) do **not** accept a `style` prop in their TypeScript interfaces. Components below use direct DOM elements with inline styles where overrides are needed.
- All fields needed by `PostDiagnosticInput` (`completion_rate`, `watch_time_seconds`, `video_views`, `reach_rate`, `save_to_like_ratio`, `likes`, `saves`, `shares`, `comments`) exist in the `posts_with_latest_metrics` view.
- `data-builders.ts` and `data.ts` both have `'server-only'` at the top and both duplicate `classifyHookType` and `classifyCaptionLength`. Caption utils will be a plain TS file (no server-only) imported by both.

---

## File Map

| File | Status | Responsibility |
|------|--------|---------------|
| `src/lib/content-analysis/caption-utils.ts` | CREATE | Shared pure functions: extractHook, classifyHookType, classifyCaptionLength, countCaptionWords, detectSaveCta, computeSaveToLikeRatio |
| `src/lib/diagnostics/types.ts` | CREATE | DiagnosticSeverity, DiagnosticCategory, DiagnosticCheck, PostDiagnosticResult interfaces |
| `src/lib/diagnostics/post-diagnostics.ts` | CREATE | Pure runPostDiagnostics() engine — no async, no DB, no AI |
| `src/components/posts/DiagnosticChecklistItem.tsx` | CREATE | Single check row (server component) |
| `src/components/posts/PostDiagnosticChecklist.tsx` | CREATE | Full checklist section with score header |
| `src/app/dashboard/posts/[id]/page.tsx` | MODIFY | Add account averages query + build input + run diagnostics + render checklist |
| `src/app/dashboard/posts/page.tsx` | MODIFY | Add `?ids=` filter param support |
| `src/ai/analyses/data-builders.ts` | MODIFY | Import extractHook, classifyHookType, classifyCaptionLength, countCaptionWords, detectSaveCta from caption-utils |
| `src/lib/dashboard/data.ts` | MODIFY | Import classifyHookType, classifyCaptionLength, detectSaveCta from caption-utils |

---

## Task 1: Create caption-utils.ts

**Files:**
- Create: `src/lib/content-analysis/caption-utils.ts`

- [ ] **Step 1: Create the file**

```ts
// src/lib/content-analysis/caption-utils.ts

export type HookType = 'question' | 'statement' | 'number' | 'quote' | 'command' | 'other';

export function extractHook(caption: string | null): string {
  if (!caption) return '';
  return caption.split(/\s+/).slice(0, 12).join(' ');
}

export function classifyHookType(caption: string | null): HookType {
  if (!caption) return 'other';
  const trimmed = caption.trim();
  const first50 = trimmed.slice(0, 50);
  if (/^["""„]/.test(trimmed)) return 'quote';
  if (/^\d/.test(trimmed)) return 'number';
  if (/^(nu |fă |evit|start|înce|stop)/i.test(trimmed)) return 'command';
  if (first50.includes('?') || caption.includes('?')) return 'question';
  return 'statement';
}

export function classifyCaptionLength(caption: string | null): 'short' | 'medium' | 'long' {
  const wordCount = (caption ?? '').split(/\s+/).filter(Boolean).length;
  if (wordCount < 50) return 'short';
  if (wordCount < 150) return 'medium';
  return 'long';
}

export function countCaptionWords(caption: string | null): number {
  return (caption ?? '').split(/\s+/).filter(Boolean).length;
}

export function detectSaveCta(caption: string | null): boolean {
  if (!caption) return false;
  return /salvează|save this|trimite|share this|bookmark|păstrează pentru|salvati/i.test(caption);
}

export function computeSaveToLikeRatio(saves: number | null, likes: number | null): number | null {
  if (saves == null || likes == null || likes === 0) return null;
  return saves / likes;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/project.cicedea/Documents/repos/ai-lichiditate-aql && npx tsc --noEmit --project tsconfig.json 2>&1 | head -20
```

Expected: no errors for this file.

- [ ] **Step 3: Commit**

```bash
git add src/lib/content-analysis/caption-utils.ts
git commit -m "feat: add shared caption-utils for hook classification and CTA detection"
```

---

## Task 2: Update data-builders.ts to import from caption-utils

**Files:**
- Modify: `src/ai/analyses/data-builders.ts`

- [ ] **Step 1: Replace local function declarations with imports**

Remove the `extractHook`, `classifyHookType`, `classifyCaptionLength` function declarations from `data-builders.ts` (lines 23–44) and add the import at the top (after `import 'server-only'`):

```ts
import { extractHook, classifyHookType, classifyCaptionLength, detectSaveCta, countCaptionWords } from '@/lib/content-analysis/caption-utils';
import type { HookType } from '@/lib/content-analysis/caption-utils';
```

Remove the local `type HookType = ...` declaration (line 4) and the three function declarations. Update `toPostForAnalysis` to use `countCaptionWords`:

```ts
captionWordCount: countCaptionWords(caption),
hasSaveCta: detectSaveCta(caption),
```

The `hasSaveCta` line currently is:
```ts
hasSaveCta: /salvează|save this|trimite|share this|bookmark|păstrează pentru|salvati/i.test(caption),
```
Replace with `hasSaveCta: detectSaveCta(caption),`.

- [ ] **Step 2: Verify TypeScript**

```bash
cd /Users/project.cicedea/Documents/repos/ai-lichiditate-aql && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/ai/analyses/data-builders.ts
git commit -m "refactor: import caption utils from shared module in data-builders"
```

---

## Task 3: Update data.ts to import from caption-utils

**Files:**
- Modify: `src/lib/dashboard/data.ts`

- [ ] **Step 1: Add import and remove local declarations**

Add import after `import 'server-only'`:

```ts
import { classifyHookType, classifyCaptionLength, detectSaveCta } from '@/lib/content-analysis/caption-utils';
```

Remove the local `classifyHookType` function (lines ~201–210) and `classifyCaptionLength` function (lines ~212–217).

Update `toPostWithMetrics` to use `detectSaveCta`:
```ts
hasSaveCta: detectSaveCta(caption),
```
(Replace the inline regex.)

- [ ] **Step 2: Verify TypeScript**

```bash
cd /Users/project.cicedea/Documents/repos/ai-lichiditate-aql && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/dashboard/data.ts
git commit -m "refactor: import caption utils from shared module in dashboard data.ts"
```

---

## Task 4: Create diagnostic types

**Files:**
- Create: `src/lib/diagnostics/types.ts`

- [ ] **Step 1: Create the file**

```ts
// src/lib/diagnostics/types.ts

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
  title: string;
  detail: string;
  action: string | null;
  benchmark: string | null;
  passed: boolean;
}

export interface PostDiagnosticResult {
  postId: string;
  totalChecks: number;
  criticalCount: number;
  warningCount: number;
  infoCount: number;
  okCount: number;
  score: number;
  checks: DiagnosticCheck[];
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/diagnostics/types.ts
git commit -m "feat: add diagnostic types for post-level audit"
```

---

## Task 5: Create diagnostic engine

**Files:**
- Create: `src/lib/diagnostics/post-diagnostics.ts`

- [ ] **Step 1: Create the file**

```ts
// src/lib/diagnostics/post-diagnostics.ts
import type { DiagnosticCheck, PostDiagnosticResult } from './types';

export interface PostDiagnosticInput {
  id: string;
  caption: string | null;
  mediaType: string;
  theme: string | null;
  themeSecondary: string | null;
  themeConfidence: string | null;
  hashtags: string[];
  publishedAt: string;

  hook: string | null;
  hookType: string | null;
  captionWordCount: number;
  hasSaveCta: boolean;
  hashtagCount: number;
  captionLength: 'short' | 'medium' | 'long';

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

  accountAvgErByReach: number | null;
  accountAvgSavesPerReach: number | null;
  accountAvgSendsPerReach: number | null;
  accountBestHookType: string | null;
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

  const score = Math.max(0, Math.min(100,
    100 - (criticalCount * 20) - (warningCount * 8) - (infoCount * 3)
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

function runHookChecks(input: PostDiagnosticInput): DiagnosticCheck[] {
  const checks: DiagnosticCheck[] = [];
  const isVideo = input.mediaType === 'reel' || input.mediaType === 'video';

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
        passed: true,
      });
    }
  }

  return checks;
}

function runCaptionSeoChecks(input: PostDiagnosticInput): DiagnosticCheck[] {
  const checks: DiagnosticCheck[] = [];

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

  const preview = (input.caption ?? '').slice(0, 125).toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '');
  const themeKeywordInPreview = input.theme && input.theme !== 'other'
    ? themeAppearsInText(input.theme, preview)
    : true;
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

function runHashtagChecks(input: PostDiagnosticInput): DiagnosticCheck[] {
  const checks: DiagnosticCheck[] = [];

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

function runEngagementChecks(input: PostDiagnosticInput): DiagnosticCheck[] {
  const checks: DiagnosticCheck[] = [];

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

function runStrategyChecks(input: PostDiagnosticInput): DiagnosticCheck[] {
  const checks: DiagnosticCheck[] = [];

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

function runFinancialCreatorChecks(input: PostDiagnosticInput): DiagnosticCheck[] {
  const checks: DiagnosticCheck[] = [];

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
  return keywords.some(kw => text.includes(kw.normalize('NFD').replace(/[̀-ͯ]/g, '')));
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

- [ ] **Step 2: Verify TypeScript**

```bash
cd /Users/project.cicedea/Documents/repos/ai-lichiditate-aql && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/diagnostics/types.ts src/lib/diagnostics/post-diagnostics.ts
git commit -m "feat: add post diagnostic engine (pure TS, no async, no AI)"
```

---

## Task 6: Create DiagnosticChecklistItem component

**Files:**
- Create: `src/components/posts/DiagnosticChecklistItem.tsx`

Note: The Typography components don't accept a `style` prop. Use direct DOM elements with inline styles for custom sizing/coloring.

- [ ] **Step 1: Create the file**

```tsx
// src/components/posts/DiagnosticChecklistItem.tsx
import React from 'react';
import type { DiagnosticCheck } from '@/lib/diagnostics/types';
import { colors } from '@/themes/ai-lichiditate/tokens';

interface Props {
  check: DiagnosticCheck;
}

const SEVERITY_BORDER: Record<string, string> = {
  critical: colors.accentCoral,
  warning: colors.accentAmber,
  info: colors.borderDefault,
  ok: colors.accentLimeDim ?? colors.borderDefault,
};

export function DiagnosticChecklistItem({ check }: Props) {
  const borderColor = check.passed
    ? (colors as Record<string, string>)['accentLimeDim'] ?? '#2d4a1e'
    : SEVERITY_BORDER[check.severity] ?? colors.borderDefault;

  const icon = check.passed ? '✓' : check.severity === 'critical' ? '✗' : '⚠';
  const iconColor = check.passed
    ? colors.accentLime
    : check.severity === 'critical' || check.severity === 'warning' ? colors.accentCoral
    : colors.textMuted;

  return (
    <div
      style={{
        display: 'flex',
        gap: 12,
        padding: '12px 16px',
        borderLeft: `4px solid ${borderColor}`,
        background: colors.bgCard,
        marginBottom: 4,
      }}
    >
      <span
        style={{
          fontFamily: 'var(--font-jetbrains-mono), monospace',
          color: iconColor,
          fontSize: 14,
          minWidth: 16,
          marginTop: 2,
          flexShrink: 0,
        }}
      >
        {icon}
      </span>

      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span
            style={{
              fontFamily: 'var(--font-jetbrains-mono), monospace',
              fontSize: 10,
              textTransform: 'uppercase' as const,
              letterSpacing: '0.06em',
              color: colors.textMuted,
            }}
          >
            {check.category.replace(/_/g, ' ')}
          </span>
          <span
            style={{
              fontFamily: 'var(--font-jetbrains-mono), monospace',
              fontWeight: 700,
              fontSize: 13,
              color: check.passed ? colors.textSecondary : colors.textPrimary,
            }}
          >
            {check.title}
          </span>
        </div>

        <p
          style={{
            fontFamily: 'var(--font-inter), sans-serif',
            fontSize: 13,
            color: colors.textSecondary,
            margin: 0,
            marginBottom: check.action ? 6 : 0,
          }}
        >
          {check.detail}
        </p>

        {!check.passed && check.action && (
          <p
            style={{
              fontFamily: 'var(--font-inter), sans-serif',
              fontSize: 12,
              color: colors.accentLime,
              margin: 0,
              marginBottom: 4,
            }}
          >
            → {check.action}
          </p>
        )}

        {check.benchmark && (
          <span
            style={{
              fontFamily: 'var(--font-jetbrains-mono), monospace',
              fontSize: 11,
              color: colors.textMuted,
            }}
          >
            BENCHMARK: {check.benchmark}
          </span>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd /Users/project.cicedea/Documents/repos/ai-lichiditate-aql && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors. If `colors.accentAmber` doesn't exist, check the tokens file and use the correct name.

- [ ] **Step 3: Commit**

```bash
git add src/components/posts/DiagnosticChecklistItem.tsx
git commit -m "feat: add DiagnosticChecklistItem component"
```

---

## Task 7: Create PostDiagnosticChecklist component

**Files:**
- Create: `src/components/posts/PostDiagnosticChecklist.tsx`

- [ ] **Step 1: Create the file**

```tsx
// src/components/posts/PostDiagnosticChecklist.tsx
import React from 'react';
import type { PostDiagnosticResult } from '@/lib/diagnostics/types';
import { DiagnosticChecklistItem } from './DiagnosticChecklistItem';
import { colors } from '@/themes/ai-lichiditate/tokens';

interface Props {
  result: PostDiagnosticResult;
}

export function PostDiagnosticChecklist({ result }: Props) {
  const failed = result.checks.filter(c => !c.passed);
  const passed = result.checks.filter(c => c.passed);

  const scoreColor = result.score >= 80
    ? colors.accentLime
    : result.score >= 60
    ? colors.textPrimary
    : colors.accentCoral;

  const scoreLabel = result.score >= 80 ? 'BINE' : result.score >= 60 ? 'MEDIU' : 'NECESITĂ ATENȚIE';

  const sortedFailed = [...failed].sort((a, b) => {
    const order: Record<string, number> = { critical: 0, warning: 1, info: 2, ok: 3 };
    return (order[a.severity] ?? 3) - (order[b.severity] ?? 3);
  });

  return (
    <section style={{ marginTop: 40 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 16 }}>
        <div>
          <span
            style={{
              fontFamily: 'var(--font-jetbrains-mono), monospace',
              fontSize: 11,
              fontWeight: 500,
              textTransform: 'uppercase' as const,
              letterSpacing: '0.08em',
              color: colors.textSecondary,
              display: 'block',
            }}
          >
            DIAGNOSTIC · POSTARE
          </span>
          <h3
            style={{
              fontFamily: 'var(--font-league-spartan), sans-serif',
              fontSize: 24,
              fontWeight: 700,
              lineHeight: 1.2,
              color: colors.textPrimary,
              margin: 0,
              marginTop: 4,
            }}
          >
            Audit Postare
          </h3>
        </div>
        <div style={{ textAlign: 'right' }}>
          <span
            style={{
              fontFamily: 'var(--font-jetbrains-mono), monospace',
              fontSize: 32,
              fontWeight: 700,
              color: scoreColor,
              display: 'block',
            }}
          >
            {result.score}
          </span>
          <span
            style={{
              fontFamily: 'var(--font-jetbrains-mono), monospace',
              fontSize: 11,
              color: colors.textMuted,
            }}
          >
            SCOR · {scoreLabel}
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
        {result.criticalCount > 0 && (
          <span style={{ fontFamily: 'var(--font-jetbrains-mono), monospace', color: colors.accentCoral, fontSize: 12 }}>
            ✗ {result.criticalCount} CRITICE
          </span>
        )}
        {result.warningCount > 0 && (
          <span style={{ fontFamily: 'var(--font-jetbrains-mono), monospace', color: colors.accentCoral, fontSize: 12, opacity: 0.7 }}>
            ⚠ {result.warningCount} ATENȚIONĂRI
          </span>
        )}
        {result.infoCount > 0 && (
          <span style={{ fontFamily: 'var(--font-jetbrains-mono), monospace', color: colors.textMuted, fontSize: 12 }}>
            ℹ {result.infoCount} INFO
          </span>
        )}
        {result.okCount > 0 && (
          <span style={{ fontFamily: 'var(--font-jetbrains-mono), monospace', color: colors.accentLime, fontSize: 12, opacity: 0.7 }}>
            ✓ {result.okCount} OK
          </span>
        )}
      </div>

      {sortedFailed.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          {sortedFailed.map(check => (
            <DiagnosticChecklistItem key={check.id} check={check} />
          ))}
        </div>
      )}

      {passed.length > 0 && (
        <details style={{ marginTop: 8 }}>
          <summary style={{ cursor: 'pointer', marginBottom: 8, listStyle: 'none' }}>
            <span
              style={{
                fontFamily: 'var(--font-jetbrains-mono), monospace',
                fontSize: 12,
                color: colors.textMuted,
              }}
            >
              ✓ {passed.length} VERIFICĂRI TRECUTE (click pentru detalii)
            </span>
          </summary>
          {passed.map(check => (
            <DiagnosticChecklistItem key={check.id} check={check} />
          ))}
        </details>
      )}

      {failed.length === 0 && (
        <p
          style={{
            fontFamily: 'var(--font-inter), sans-serif',
            fontSize: 14,
            color: colors.textSecondary,
            textAlign: 'center',
            padding: '24px 0',
            margin: 0,
          }}
        >
          Toate verificările au trecut. Postare bine optimizată.
        </p>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd /Users/project.cicedea/Documents/repos/ai-lichiditate-aql && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add src/components/posts/PostDiagnosticChecklist.tsx
git commit -m "feat: add PostDiagnosticChecklist section component"
```

---

## Task 8: Wire diagnostic checklist into post detail page

**Files:**
- Modify: `src/app/dashboard/posts/[id]/page.tsx`

The page already fetches `post` from `posts_with_latest_metrics` (which includes `completion_rate`, `watch_time_seconds`, `video_views`, `reach_rate`, `save_to_like_ratio`, `likes`, `saves`, `shares`, `comments`). We need to:
1. Add account averages query (uses `posts_with_latest_metrics` for the account)
2. Build `PostDiagnosticInput`
3. Run `runPostDiagnostics`
4. Render `<PostDiagnosticChecklist>`

**Helper function to add locally (inside the page file):**

```ts
function safeAvg(values: Array<number | null | undefined>): number | null {
  const valid = values.filter((v): v is number => v != null && v > 0);
  if (valid.length === 0) return null;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}
```

- [ ] **Step 1: Add imports to the page file**

At the top of `src/app/dashboard/posts/[id]/page.tsx`, add:

```ts
import { extractHook, classifyHookType, countCaptionWords, detectSaveCta } from '@/lib/content-analysis/caption-utils';
import { runPostDiagnostics } from '@/lib/diagnostics/post-diagnostics';
import { PostDiagnosticChecklist } from '@/components/posts/PostDiagnosticChecklist';
import type { PostDiagnosticInput } from '@/lib/diagnostics/post-diagnostics';
```

- [ ] **Step 2: Add safeAvg helper + account averages query + diagnostics**

After the existing `snapshots` query (after line ~54), add:

```ts
  function safeAvg(values: Array<number | null | undefined>): number | null {
    const valid = values.filter((v): v is number => v != null && v > 0);
    if (valid.length === 0) return null;
    return valid.reduce((a, b) => a + b, 0) / valid.length;
  }

  // Account averages for benchmarking
  const { data: accountPosts } = await supabase
    .from('posts_with_latest_metrics')
    .select('er_by_reach, saves_per_reach, sends_per_reach, caption')
    .eq('account_id', post.account_id)
    .not('er_by_reach', 'is', null)
    .gt('er_by_reach', 0)
    .limit(100);

  const avgEr = safeAvg((accountPosts ?? []).map(r => r.er_by_reach));
  const avgSaves = safeAvg((accountPosts ?? []).map(r => r.saves_per_reach));
  const avgSends = safeAvg((accountPosts ?? []).map(r => r.sends_per_reach));

  // Best hook type: most frequent hook type among top 30% by ER
  let accountBestHookType: string | null = null;
  if (accountPosts && accountPosts.length >= 5) {
    const sorted = [...accountPosts]
      .filter(p => p.er_by_reach != null)
      .sort((a, b) => (b.er_by_reach ?? 0) - (a.er_by_reach ?? 0));
    const topN = sorted.slice(0, Math.max(3, Math.floor(sorted.length * 0.3)));
    const hookMap = new Map<string, number>();
    for (const p of topN) {
      const ht = classifyHookType(p.caption);
      hookMap.set(ht, (hookMap.get(ht) ?? 0) + 1);
    }
    accountBestHookType = [...hookMap.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  }

  // Build diagnostic input
  const hashtags: string[] = Array.isArray(post.hashtags) ? (post.hashtags as string[]) : [];
  const diagnosticInput: PostDiagnosticInput = {
    id: post.id,
    caption: post.caption,
    mediaType: post.media_type,
    theme: post.theme,
    themeSecondary: post.theme_secondary ?? null,
    themeConfidence: post.theme_confidence ?? null,
    hashtags,
    publishedAt: post.published_at,
    hook: extractHook(post.caption),
    hookType: classifyHookType(post.caption),
    captionWordCount: countCaptionWords(post.caption),
    hasSaveCta: detectSaveCta(post.caption),
    hashtagCount: hashtags.length,
    captionLength: countCaptionWords(post.caption) < 50 ? 'short' : countCaptionWords(post.caption) < 150 ? 'medium' : 'long',
    erByReach: post.er_by_reach ?? null,
    savesPerReach: post.saves_per_reach ?? null,
    sendsPerReach: post.sends_per_reach ?? null,
    reach: post.reach ?? null,
    likes: post.likes ?? null,
    saves: post.saves ?? null,
    shares: post.shares ?? null,
    comments: post.comments ?? null,
    videoViews: post.video_views ?? null,
    watchTimeSeconds: post.watch_time_seconds ?? null,
    saveToLikeRatio: post.save_to_like_ratio ?? null,
    completionRate: post.completion_rate ?? null,
    reachRate: post.reach_rate ?? null,
    accountAvgErByReach: avgEr,
    accountAvgSavesPerReach: avgSaves,
    accountAvgSendsPerReach: avgSends,
    accountBestHookType,
  };

  const diagnosticResult = runPostDiagnostics(diagnosticInput);
```

- [ ] **Step 3: Add `<PostDiagnosticChecklist>` to the JSX**

Replace the "Section 4: AI placeholder" Card with:

```tsx
      {/* Section 4: Diagnostic Checklist */}
      <PostDiagnosticChecklist result={diagnosticResult} />
```

(Remove the old AI placeholder Card entirely.)

- [ ] **Step 4: Verify TypeScript**

```bash
cd /Users/project.cicedea/Documents/repos/ai-lichiditate-aql && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/posts/\[id\]/page.tsx
git commit -m "feat: wire PostDiagnosticChecklist into post detail page"
```

---

## Task 9: Add ?ids= filter to posts list page

**Files:**
- Modify: `src/app/dashboard/posts/page.tsx`

- [ ] **Step 1: Add `ids` to the SearchParams interface**

```ts
interface SearchParams {
  theme?: string;
  type?: string;
  days?: string;
  sort?: string;
  dir?: string;
  ids?: string;  // add this
}
```

- [ ] **Step 2: Add ids filter logic after the existing `params.type` filter**

After the block that applies `params.theme` and `params.type` filters (around line 85-86), add:

```ts
  const idFilter = params.ids?.split(',').filter(Boolean) ?? [];
  if (idFilter.length > 0) {
    query = query.in('id', idFilter);
  }
```

- [ ] **Step 3: Add banner when ?ids= filter is active**

In the JSX, after the filter row `<div>` (around line 184 in the original), add the IDs banner:

```tsx
      {/* ?ids= filter banner */}
      {idFilter.length > 0 && (
        <div
          style={{
            background: colors.bgCard,
            border: `1px solid ${colors.accentCoral}`,
            borderRadius: 6,
            padding: '10px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Mono tone="muted">
            AFIȘÂND {idFilter.length} POSTĂRI AFECTATE
          </Mono>
          <Link
            href="/dashboard/posts"
            style={{
              fontFamily: 'var(--font-jetbrains-mono), monospace',
              fontSize: 11,
              color: colors.accentLime,
              textDecoration: 'none',
            }}
          >
            × ȘTERGE FILTRUL
          </Link>
        </div>
      )}
```

Note: `idFilter` must be defined before the JSX return. Move the `const idFilter = ...` computation to before the `return` statement if needed.

- [ ] **Step 4: Move idFilter computation before JSX**

The `idFilter` variable must be declared before the `return (...)` statement. Restructure so `idFilter` is available in both the query block and the JSX. The query already runs before `return`, so the declaration before the query (after hasAnyPosts check) works fine.

- [ ] **Step 5: Verify TypeScript**

```bash
cd /Users/project.cicedea/Documents/repos/ai-lichiditate-aql && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 6: Commit**

```bash
git add src/app/dashboard/posts/page.tsx
git commit -m "feat: add ?ids= filter param to posts list for diagnostic flag links"
```

---

## Task 10: Full build check and token verification

- [ ] **Step 1: Check color tokens exist**

```bash
grep -n "accentAmber\|accentLimeDim\|accentCoral" /Users/project.cicedea/Documents/repos/ai-lichiditate-aql/src/themes/ai-lichiditate/tokens.ts | head -20
```

If `accentAmber` doesn't exist, update `DiagnosticChecklistItem.tsx` to use `colors.accentCoral` for warnings (both critical and warning use coral). If `accentLimeDim` doesn't exist, use a hardcoded hex `#2d4a1e` or remove that border variant.

- [ ] **Step 2: Run full build**

```bash
cd /Users/project.cicedea/Documents/repos/ai-lichiditate-aql && pnpm build 2>&1 | tail -40
```

Expected: `✓ Compiled successfully` with no TypeScript errors.

- [ ] **Step 3: Run lint**

```bash
cd /Users/project.cicedea/Documents/repos/ai-lichiditate-aql && pnpm lint 2>&1 | tail -20
```

Expected: no errors (warnings OK).

- [ ] **Step 4: Fix any build errors before proceeding**

Common issues to check:
- Missing color token → substitute with fallback
- `post.account_id` type mismatch → cast via `(post as any).account_id` if Supabase types are strict
- `post.likes`, `post.saves` etc. not in inferred type → check view's select statement in page.tsx (the `select('*')` should pick them up)

---

## Verification checklist (from spec)

After build passes, manually verify:

- [ ] Navigate to `/dashboard/posts/[any-id]` — "DIAGNOSTIC · POSTARE" section appears below KPI grid
- [ ] Score 0-100 shown in top-right, colored correctly (lime ≥80, white ≥60, coral <60)
- [ ] Failed checks visible by default; passed checks in `<details>` collapsed
- [ ] Left-border colors: critical=coral, warning=amber/coral, info=muted, passed=lime-dim
- [ ] Action text (→ ...) appears in lime color for failed checks
- [ ] Post with 0 hashtags shows "Fără hashtag-uri" warning
- [ ] Carousel without "salvează" in caption shows "Fără CTA de salvare"
- [ ] Post with very short caption (<30 words) shows "Caption prea scurt"
- [ ] Dashboard Overview tab: clicking "→ N postări afectate" on diagnostic flag → navigates to `/dashboard/posts?ids=...` showing only those posts + banner
- [ ] No regression on dashboard, posts list, analyses pages

---

## Color token fallbacks

Check `src/themes/ai-lichiditate/tokens.ts` before Task 6 and adjust:

| Token used in plan | Fallback if missing |
|--------------------|--------------------|
| `colors.accentAmber` | `colors.accentCoral` |
| `colors.accentLimeDim` | `'#2d4a1e'` |
| `colors.bgCard` | `colors.bgElevated` |
