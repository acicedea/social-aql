import type { TranscriptionSegment } from './types';
import type {
  TranscriptMetrics,
  HookType,
  CtaType,
  CtaPosition,
  RhythmQuality,
} from './transcript-metrics-types';
import forkConfig from '../../../fork-config';

const CTA_PATTERNS_SAVE = /salvează|salvati|save this|bookmark|păstrează/i;
const CTA_PATTERNS_FOLLOW = /urmărește|urmareste|follow|abonează|aboneaza|subscribe/i;
const CTA_PATTERNS_SHARE = /distribuie|share|trimite|trimite-le|dă mai departe/i;
const CTA_PATTERNS_QUESTION = /ce crezi|lasă un comentariu|spune-mi|tu cum|ai întrebări/i;

// ── Main function ────────────────────────────────────────────────────

export function computeTranscriptMetrics(
  transcript: string,
  segments: TranscriptionSegment[],
  visualDescription: string | null,
): TranscriptMetrics {
  const duration = computeDuration(segments);
  const wordCount = countWords(transcript);
  const wpm = duration > 0 ? Math.round((wordCount / duration) * 60) : 0;

  const hookData = analyzeHook(segments);
  const ctaData = analyzeCta(transcript, segments);
  const rhythmData = analyzeRhythm(segments);
  const contentData = analyzeContent(transcript);
  const visualData = analyzeVisualAlignment(visualDescription, ctaData.hasCta);

  const hookScore = computeHookScore(hookData);
  const ctaScore = computeCtaScore(ctaData);
  const rhythmScore = computeRhythmScore(rhythmData);
  const contentScore = Math.min(100,
    contentData.financialKeywordDensity * 2000 +
    contentData.conceptsIntroduced * 10
  );

  // Weighted overall: hook 35%, cta 25%, rhythm 20%, content 20%
  const overallScore = Math.round(
    hookScore * 0.35 +
    ctaScore * 0.25 +
    rhythmScore * 0.20 +
    contentScore * 0.20
  );

  return {
    wordCount,
    durationSeconds: duration,
    wordsPerMinute: wpm,
    wordsPerMinuteBenchmark: classifyWpm(wpm),

    hookText: hookData.hookText,
    hookWordCount: hookData.hookWordCount,
    hookType: hookData.hookType,
    hookScore,
    hookScoreReason: getHookScoreReason(hookData.hookType, hookScore),

    hasCta: ctaData.hasCta,
    ctaType: ctaData.ctaType,
    ctaText: ctaData.ctaText,
    ctaPosition: ctaData.ctaPosition,
    ctaScore,

    segmentCount: segments.length,
    avgSegmentDurationSeconds: rhythmData.avgDuration,
    rhythmQuality: rhythmData.quality,
    rhythmScore,
    longestSegmentSeconds: rhythmData.longestDuration,
    longestSegmentText: rhythmData.longestText,

    financialKeywords: contentData.financialKeywords,
    financialKeywordDensity: contentData.financialKeywordDensity,
    conceptsIntroduced: contentData.conceptsIntroduced,

    hasOnScreenText: visualData.hasOnScreenText,
    hasCallToAction: visualData.hasVisualCta,
    visualCtaMatchesAudioCta: visualData.ctaMatch,

    overallScore,
    scoreBreakdown: {
      hook: hookScore,
      cta: ctaScore,
      rhythm: rhythmScore,
      content: Math.round(contentScore),
    },
  };
}

// ── Helpers ──────────────────────────────────────────────────────────

function parseTimeToSeconds(time: string): number {
  const parts = time.split(':').map(Number);
  if (parts.length === 2) return (parts[0] ?? 0) * 60 + (parts[1] ?? 0);
  if (parts.length === 3) return (parts[0] ?? 0) * 3600 + (parts[1] ?? 0) * 60 + (parts[2] ?? 0);
  return 0;
}

function computeDuration(segments: TranscriptionSegment[]): number {
  if (segments.length === 0) return 0;
  return parseTimeToSeconds(segments[segments.length - 1].end);
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function classifyWpm(wpm: number): TranscriptMetrics['wordsPerMinuteBenchmark'] {
  if (wpm < 100) return 'too_slow';
  if (wpm <= 155) return 'natural';
  if (wpm <= 190) return 'fast';
  return 'too_fast';
}

function analyzeHook(segments: TranscriptionSegment[]) {
  const hookSegments = segments.filter(
    s => parseTimeToSeconds(s.end) <= 8
  );
  const hookText = hookSegments.map(s => s.text).join(' ').trim();
  const hookWordCount = countWords(hookText);
  const hookType = classifyHookType(hookText);

  return { hookText, hookWordCount, hookType };
}

function classifyHookType(text: string): HookType {
  if (!text) return 'platitude';
  const lower = text.toLowerCase();

  if (text.trim().endsWith('?') || lower.includes('de ce') || lower.includes('cum ')) {
    return 'question';
  }
  if (/^\d|\d%|\d miliard|\d trilion/i.test(text)) {
    return 'number';
  }
  if (/nu,|nu este|greșit|opusul|contrar|paradox/i.test(lower)) {
    return 'contradiction';
  }
  if (/problemă|risc|pericol|pierd|eșec|scade|cade|criza/i.test(lower)) {
    return 'problem';
  }

  const platitudePatterns = [
    /par interesante/i,
    /toată lumea știe/i,
    /este important/i,
    /trebuie să știi/i,
    /astăzi vorbim despre/i,
    /în episodul de azi/i,
    /^bună ziua/i,
  ];
  if (platitudePatterns.some(p => p.test(text))) {
    return 'platitude';
  }

  return 'statement';
}

function analyzeCta(transcript: string, _segments: TranscriptionSegment[]) {
  let ctaType: CtaType = 'none';
  let ctaText: string | null = null;
  let ctaPosition: CtaPosition = 'absent';

  const lines = transcript.split(/[.!?\n]/).map(l => l.trim()).filter(Boolean);
  let ctaLineIndex = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    if (CTA_PATTERNS_SAVE.test(line)) { ctaType = 'save'; ctaText = line; ctaLineIndex = i; break; }
    if (CTA_PATTERNS_SHARE.test(line)) { ctaType = 'share'; ctaText = line; ctaLineIndex = i; break; }
    if (CTA_PATTERNS_FOLLOW.test(line)) { ctaType = 'follow'; ctaText = line; ctaLineIndex = i; break; }
    if (CTA_PATTERNS_QUESTION.test(line)) { ctaType = 'question'; ctaText = line; ctaLineIndex = i; break; }
  }

  const hasCta = ctaType !== 'none';

  if (hasCta && ctaLineIndex >= 0) {
    const position = ctaLineIndex / lines.length;
    if (position < 0.25) ctaPosition = 'early';
    else if (position < 0.75) ctaPosition = 'middle';
    else ctaPosition = 'end';
  }

  return { hasCta, ctaType, ctaText, ctaPosition };
}

function analyzeRhythm(segments: TranscriptionSegment[]) {
  if (segments.length === 0) {
    return { avgDuration: 0, quality: 'monotone' as RhythmQuality, longestDuration: 0, longestText: '' };
  }

  const durations = segments.map(s =>
    parseTimeToSeconds(s.end) - parseTimeToSeconds(s.start)
  );
  const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
  const maxDuration = Math.max(...durations);
  const longestIdx = durations.indexOf(maxDuration);
  const longestText = segments[longestIdx]?.text ?? '';

  const variance = durations.reduce((sum, d) => sum + Math.pow(d - avgDuration, 2), 0) / durations.length;
  const stdDev = Math.sqrt(variance);

  let quality: RhythmQuality;
  if (avgDuration >= 4 && avgDuration <= 9 && stdDev < 4) quality = 'excellent';
  else if (avgDuration >= 3 && avgDuration <= 12 && stdDev < 6) quality = 'good';
  else if (maxDuration > 15) quality = 'monotone';
  else quality = 'uneven';

  return { avgDuration, quality, longestDuration: maxDuration, longestText };
}

function analyzeContent(transcript: string) {
  const lower = transcript.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '');

  const foundKeywords = forkConfig.contentNiche.keywords.filter(kw =>
    lower.includes(kw.normalize('NFD').replace(/[̀-ͯ]/g, ''))
  );

  const wordCount = countWords(transcript);
  const density = wordCount > 0 ? foundKeywords.length / wordCount : 0;

  const uniqueConcepts = new Set(foundKeywords.map(k => k.split(' ')[0])).size;

  return {
    financialKeywords: foundKeywords,
    financialKeywordDensity: density,
    conceptsIntroduced: uniqueConcepts,
  };
}

function analyzeVisualAlignment(visualDescription: string | null, audioHasCta: boolean) {
  if (!visualDescription) {
    return { hasOnScreenText: false, hasVisualCta: false, ctaMatch: false };
  }

  const lower = visualDescription.toLowerCase();
  const hasOnScreenText = /text|titlu|cuvinte|scrie|afișează|font/i.test(lower);
  const hasVisualCta = /urmărește|salvează|follow|subscribe|cta/i.test(lower);
  const ctaMatch = audioHasCta === hasVisualCta;

  return { hasOnScreenText, hasVisualCta, ctaMatch };
}

function computeHookScore(hook: { hookText: string; hookWordCount: number; hookType: HookType }): number {
  const typeScores: Record<HookType, number> = {
    'contradiction': 90,
    'number': 85,
    'problem': 80,
    'question': 75,
    'statement': 50,
    'platitude': 15,
  };
  let score = typeScores[hook.hookType];

  if (hook.hookWordCount < 8) score = Math.max(0, score - 20);
  if (hook.hookWordCount > 30) score = Math.max(0, score - 10);

  return Math.round(score);
}

function computeCtaScore(cta: { hasCta: boolean; ctaType: CtaType; ctaPosition: CtaPosition }): number {
  if (!cta.hasCta) return 0;

  const typeScores: Record<CtaType, number> = {
    'save': 90,
    'question': 85,
    'share': 75,
    'follow': 50,
    'none': 0,
  };
  let score = typeScores[cta.ctaType];

  if (cta.ctaPosition === 'end') score = Math.min(100, score + 10);
  if (cta.ctaPosition === 'early') score = Math.max(0, score - 20);

  return Math.round(score);
}

function computeRhythmScore(rhythm: { avgDuration: number; quality: RhythmQuality; longestDuration: number }): number {
  const qualityScores: Record<RhythmQuality, number> = {
    'excellent': 90,
    'good': 70,
    'uneven': 40,
    'monotone': 20,
  };
  let score = qualityScores[rhythm.quality];

  if (rhythm.longestDuration > 20) score = Math.max(0, score - 20);

  return Math.round(score);
}

function getHookScoreReason(type: HookType, _score: number): string {
  const reasons: Record<HookType, string> = {
    'contradiction': 'Hook de contradicție — contrazice o credință comună, creează tensiune imediată',
    'number': 'Hook cu cifră — concret și credibil, captează atenția instantaneu',
    'problem': 'Hook pe problemă — audiența se identifică și vrea soluția',
    'question': 'Hook cu întrebare — invită audiența să gândească și să rămână',
    'statement': 'Hook cu afirmație — neutru, nu creează tensiune',
    'platitude': 'Hook clișeu — nu diferențiază, audiența poate da skip imediat',
  };
  return reasons[type];
}
