import 'server-only';
import { getDefaultAiProvider } from '@/ai/registry';
import { AiProviderError } from '@/ai/providers/types';
import type { TranscriptMetrics } from './transcript-metrics-types';
import type { TranscriptionSegment } from './types';
import forkConfig from '../../../fork-config';

export interface PostCritique {
  overallVerdict: string;
  score: number;
  sections: PostCritiqueSection[];
  topStrengths: string[];
  topWeaknesses: string[];
  rewrittenHook: string;
  rewrittenCta: string;
  narrativeMarkdown: string;
}

export interface PostCritiqueSection {
  section: 'hook' | 'structure' | 'cta' | 'visual' | 'content';
  label: string;
  verdict: 'strong' | 'acceptable' | 'weak' | 'critical';
  finding: string;
  fix: string | null;
  exampleFix: string | null;
}

const CRITIQUE_SYSTEM_PROMPT = `Ești un critic de social media extrem de exigent, specializat în conținut financiar românesc pentru Instagram Reels.

Rolul tău: analizezi video-uri de 30-90 secunde despre economie, piețe, investiții și dai feedback DIRECT, SPECIFIC și BRUTAL DE ONEST.

## Principii fundamentale

**Nu ești politicos.** Un creator care primește feedback vag nu crește. Spui exact ce nu merge și de ce.

**Fiecare problemă are un fix concret.** Nu e suficient "hook-ul e slab" — trebuie să rescrii hook-ul exact cum ar trebui să sune.

**Citatele din transcript sunt obligatorii.** Când critici ceva, citezi textul exact din video cu timestamp.

**Benchmarks sunt cifre, nu impresii:**
- Hook eficient: contradiction/number/problem în primele 5 cuvinte, 10-25 cuvinte total
- Ritm optim: segmente de 4-8 secunde, fără pauze > 15s fără content nou
- CTA: save > share > follow ca eficiență. CTA tip "urmărește" fără motiv = cel mai slab.
- Densitate financiară: minim 3% keywords pentru conținut de nișă
- WPM: 120-160 = natural pentru română educațională, >180 = prea rapid

## Ce evaluezi în ordine

1. **HOOK (0:00 — ~0:08):** Captează atenția sau nu? Tip de hook? Ce ar funcționa mai bine?
2. **STRUCTURĂ:** Logica narativă. Există o progresie clară? Unde se pierde audiența?
3. **CTA:** Ce tip, unde e, cât de eficient. Rescrie CTA mai bun.
4. **VIZUAL vs AUDIO:** Elementele grafice suportă mesajul sau îl distrag?
5. **CONȚINUT:** Densitate informațională, unicitate, ce știe audiența deja vs. ce e nou.

## Format output

Returnezi JSON strict conform schemei. Fiecare "fix" trebuie să conțină textul exact de folosit, nu instrucțiuni vagi.

Exemple de feedback slab (NU face asta):
- "Hook-ul ar putea fi mai puternic"
- "Încearcă un CTA mai bun"

Exemple de feedback puternic (FAC asta):
- "Hook-ul 'Piețele emergente par interesante atunci când totul merge bine.' (0:00-0:04) e o platitudine clasică. Nu creezi nicio tensiune. Orice viewer financiar știe asta. FIX: 'Capitalul pleacă din piețele emergente de 3 ori mai repede decât intră. Iată mecanismul exact.' — Aceeași informație, dar cu cifră și promisiune concretă."

Limba: română cu diacritice corecte.
Returnează DOAR JSON valid. Fără markdown code fences.`;

const CRITIQUE_SCHEMA = {
  type: 'object',
  properties: {
    overall_verdict: { type: 'string' },
    score: { type: 'string' },
    sections: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          section: { type: 'string', enum: ['hook', 'structure', 'cta', 'visual', 'content'] },
          label: { type: 'string' },
          verdict: { type: 'string', enum: ['strong', 'acceptable', 'weak', 'critical'] },
          finding: { type: 'string' },
          fix: { type: 'string' },
          example_fix: { type: 'string' },
        },
        required: ['section', 'label', 'verdict', 'finding'],
      },
    },
    top_strengths: { type: 'array', items: { type: 'string' } },
    top_weaknesses: { type: 'array', items: { type: 'string' } },
    rewritten_hook: { type: 'string' },
    rewritten_cta: { type: 'string' },
    narrative_markdown: { type: 'string' },
  },
  required: [
    'overall_verdict', 'score', 'sections',
    'top_strengths', 'top_weaknesses',
    'rewritten_hook', 'rewritten_cta', 'narrative_markdown',
  ],
};

export async function generatePostCritique(input: {
  caption: string | null;
  transcript: string;
  segments: TranscriptionSegment[];
  visualDescription: string | null;
  metrics: TranscriptMetrics;
  postMetrics: {
    erByReach: number | null;
    savesPerReach: number | null;
    sendsPerReach: number | null;
    reach: number | null;
  };
  accountAvgEr: number | null;
}): Promise<PostCritique> {
  const provider = getDefaultAiProvider();

  const segmentsFormatted = input.segments
    .map(s => `${s.start}-${s.end}: "${s.text}"`)
    .join('\n');

  const userPrompt = `Analizează acest Reel de Instagram.

=== CAPTION (text din descriere) ===
${input.caption ?? '(fără caption)'}

=== TRANSCRIPT (ce se spune în video) ===
${input.transcript}

=== SEGMENTE CU TIMESTAMPS ===
${segmentsFormatted}

=== DESCRIERE VIZUALĂ ===
${input.visualDescription ?? '(nedisponibil)'}

=== METRICI CALCULATE ===
- Words per minute: ${input.metrics.wordsPerMinute} (${input.metrics.wordsPerMinuteBenchmark})
- Hook type: ${input.metrics.hookType} | Hook score: ${input.metrics.hookScore}/100
- Hook text: "${input.metrics.hookText}"
- CTA type: ${input.metrics.ctaType} | CTA position: ${input.metrics.ctaPosition} | CTA score: ${input.metrics.ctaScore}/100
- CTA text: "${input.metrics.ctaText ?? 'absent'}"
- Ritm: ${input.metrics.rhythmQuality} (avg segment ${input.metrics.avgSegmentDurationSeconds.toFixed(1)}s)
- Segment cel mai lung: ${input.metrics.longestSegmentSeconds.toFixed(1)}s — "${input.metrics.longestSegmentText.slice(0, 80)}"
- Keywords ${forkConfig.contentNiche.label}: ${input.metrics.financialKeywords.length} (${(input.metrics.financialKeywordDensity * 100).toFixed(1)}% densitate)
- Keywords detectate: ${input.metrics.financialKeywords.slice(0, 10).join(', ')}
- Overall metric score: ${input.metrics.overallScore}/100

=== PERFORMANȚĂ VIDEO ===
- Engagement Rate: ${input.postMetrics.erByReach?.toFixed(2) ?? 'N/A'}% (media cont: ${input.accountAvgEr?.toFixed(2) ?? 'N/A'}%)
- Save Rate: ${input.postMetrics.savesPerReach?.toFixed(2) ?? 'N/A'}%
- Send Rate: ${input.postMetrics.sendsPerReach?.toFixed(2) ?? 'N/A'}%
- Reach: ${input.postMetrics.reach ?? 'N/A'}

Produce critica detaliată. Fii specific, dur, acționabil.
Pentru "rewritten_hook": rescrie complet primele 2 propoziții ale video-ului.
Pentru "rewritten_cta": rescrie CTA-ul cu un motiv concret pentru save sau share.`;

  let result;
  let delay = 5000;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      result = await provider.generate({
        systemPrompt: CRITIQUE_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }],
        temperature: 0.6,
        maxTokens: 3000,
        jsonMode: true,
        responseSchema: CRITIQUE_SCHEMA,
      });
      break;
    } catch (err) {
      if (err instanceof AiProviderError && (err.rateLimited || err.retryable) && attempt < 2) {
        await new Promise(r => setTimeout(r, delay));
        delay *= 3;
        continue;
      }
      throw err;
    }
  }
  if (!result) throw new Error('Critique generation failed after retries');

  const parsed = result.parsed as {
    overall_verdict: string;
    score: string;
    sections: Array<{
      section: string;
      label: string;
      verdict: string;
      finding: string;
      fix?: string;
      example_fix?: string;
    }>;
    top_strengths: string[];
    top_weaknesses: string[];
    rewritten_hook: string;
    rewritten_cta: string;
    narrative_markdown: string;
  };

  return {
    overallVerdict: parsed.overall_verdict,
    score: parseInt(parsed.score, 10) || 0,
    sections: parsed.sections.map(s => ({
      section: s.section as PostCritiqueSection['section'],
      label: s.label,
      verdict: s.verdict as PostCritiqueSection['verdict'],
      finding: s.finding,
      fix: s.fix ?? null,
      exampleFix: s.example_fix ?? null,
    })),
    topStrengths: parsed.top_strengths ?? [],
    topWeaknesses: parsed.top_weaknesses ?? [],
    rewrittenHook: parsed.rewritten_hook,
    rewrittenCta: parsed.rewritten_cta,
    narrativeMarkdown: parsed.narrative_markdown,
  };
}
