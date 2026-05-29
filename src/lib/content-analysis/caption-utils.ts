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
