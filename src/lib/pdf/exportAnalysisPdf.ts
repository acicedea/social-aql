import jsPDF from 'jspdf';
import type {
  AnalysisType,
  WeeklySummaryOutput,
  ContentPatternsOutput,
  ContentIdeationOutput,
  KeyFinding,
} from '@/ai/analyses/types';

// ——— Color palette (mirrors fork-config.ts theme) ———
type RGB = [number, number, number];

const C = {
  bg:            [0, 0, 0] as RGB,
  bgCard:        [20, 20, 20] as RGB,
  bgCardPos:     [14, 26, 6] as RGB,
  bgCardNeg:     [26, 9, 8] as RGB,
  textPrimary:   [242, 239, 228] as RGB,
  textSecondary: [138, 138, 138] as RGB,
  textMuted:     [90, 90, 90] as RGB,
  lime:          [199, 248, 76] as RGB,
  coral:         [255, 90, 78] as RGB,
  border:        [38, 38, 38] as RGB,
  borderPos:     [58, 92, 15] as RGB,
  borderNeg:     [92, 31, 26] as RGB,
  eggFainter:    [35, 35, 35] as RGB,
  eggFaint:      [60, 60, 60] as RGB,
};

const KEYWORDS = ['umbra', 'fulger', 'nimbus', 'axiom', 'ecou', 'cobalt', 'vertex'];

const MARGIN = 20;
const PW = 210;
const PH = 297;
const CW = PW - MARGIN * 2;       // 170mm full content width
const CW_SAFE = CW - 5;           // 165mm — used for body text to avoid overflow

const TYPE_LABELS: Record<AnalysisType, string> = {
  weekly_summary:   'SUMAR SAPTAMANAL',
  content_patterns: 'TIPARE CONTINUT',
  content_ideation: 'IDEI CONTINUT',
};

// ——— Sanitize: strip Romanian diacritics + non-Latin1 chars for built-in PDF fonts ———
function san(str: string | undefined | null): string {
  if (!str) return '';
  return str
    // Romanian diacritics — Unicode variants
    .replace(/[ăÃ]/g, 'a').replace(/Ă/g, 'A')
    .replace(/â/g, 'a').replace(/Â/g, 'A')
    .replace(/î/g, 'i').replace(/Î/g, 'I')
    .replace(/[șş]/g, 's').replace(/[ȘŞ]/g, 'S')
    .replace(/[țţ]/g, 't').replace(/[ȚŢ]/g, 'T')
    // Common unicode symbols
    .replace(/[→➜➡]/g, '->').replace(/←/g, '<-').replace(/↗/g, '/')
    .replace(/↓/g, 'v').replace(/[↑]/g, '^')
    .replace(/[""]/g, '"').replace(/['']/g, "'")
    .replace(/„/g, '"').replace(/[—–]/g, '-')
    .replace(/…/g, '...').replace(/×/g, 'x')
    // Strip anything still outside Latin-1
    .replace(/[^\x00-\xFF]/g, '');
}

// ——— Layout state ———
interface S {
  doc: jsPDF;
  y: number;
  page: number;
  kw: string;
}

// ——— Low-level helpers ———
function fillBg(doc: jsPDF) {
  doc.setFillColor(C.bg[0], C.bg[1], C.bg[2]);
  doc.rect(0, 0, PW, PH, 'F');
}

function newPage(s: S) {
  s.doc.addPage();
  s.page++;
  s.y = MARGIN;
  fillBg(s.doc);
}

function guard(s: S, needed: number) {
  if (s.y + needed > PH - MARGIN) newPage(s);
}

function gap(s: S, n: number) { s.y += n; }

function setFill(doc: jsPDF, c: RGB) { doc.setFillColor(c[0], c[1], c[2]); }
function setStroke(doc: jsPDF, c: RGB) { doc.setDrawColor(c[0], c[1], c[2]); }
function setTxt(doc: jsPDF, c: RGB) { doc.setTextColor(c[0], c[1], c[2]); }

// charSpace helper — always reset to 0 after use to prevent bleed
function withTracking(doc: jsPDF, spacing: number, fn: () => void) {
  doc.setCharSpace(spacing);
  fn();
  doc.setCharSpace(0);
}

// ——— Text renderers ———

function eyebrow(s: S, label: string) {
  guard(s, 8);
  s.doc.setFont('helvetica', 'bold');
  s.doc.setFontSize(6.5);
  setTxt(s.doc, C.textMuted);
  withTracking(s.doc, 0.15, () => {
    s.doc.text(san(label).toUpperCase(), MARGIN, s.y);
  });
  s.y += 7;
}

function bigHeadline(s: S, txt: string) {
  guard(s, 20);
  s.doc.setFont('helvetica', 'bold');
  s.doc.setFontSize(22);
  setTxt(s.doc, C.textPrimary);
  const lines = s.doc.splitTextToSize(san(txt).toUpperCase(), CW_SAFE) as string[];
  s.doc.text(lines, MARGIN, s.y);
  s.y += lines.length * 9 + 4;
}

// ——— Easter egg helpers (used by bodyTextWithEggs below) ———
const PAROLA_FORMS = ['parola', 'prla', 'pa', 'prl', 'par', 'prol'];
const ESTE_FORMS  = ['este', 'e', 'est'];

function obfKw(kw: string): string {
  const opts = [kw, kw.slice(0, 3), kw.slice(0, -1), kw.slice(1)].filter(s => s.length >= 3);
  return opts[Math.floor(Math.random() * opts.length)];
}

// "parola este [keyword]" — full keyword always so the clue is unambiguous
function eggPhrase(kw: string): string {
  const p = PAROLA_FORMS[Math.floor(Math.random() * PAROLA_FORMS.length)];
  const e = ESTE_FORMS[Math.floor(Math.random() * ESTE_FORMS.length)];
  return `${p} ${e} ${kw}`;
}

// ——— Body text renderers ———

function bodyText(s: S, txt: string) {
  s.doc.setFont('helvetica', 'normal');
  s.doc.setFontSize(8.5);
  setTxt(s.doc, C.textPrimary);
  const lines = s.doc.splitTextToSize(san(txt), CW_SAFE) as string[];
  for (const line of lines) {
    guard(s, 5.5);
    s.doc.text(line, MARGIN, s.y);
    s.y += 5;
  }
  s.y += 2;
}

// Render body text with hidden egg words injected mid-sentence on random lines.
// eggs: array of strings to inject; each placed on a different eligible line.
function bodyTextWithEggs(s: S, txt: string, eggs: string[]) {
  s.doc.setFont('helvetica', 'normal');
  s.doc.setFontSize(8.5);
  const lines = s.doc.splitTextToSize(san(txt), CW_SAFE) as string[];

  // Assign each egg to a distinct random line (skip first 2 and last 2)
  const lo = 2;
  const hi = lines.length - 2;
  const eggMap = new Map<number, string>();
  if (hi > lo) {
    const pool = Array.from({ length: hi - lo }, (_, i) => i + lo);
    // shuffle pool
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    eggs.forEach((egg, i) => { if (pool[i] !== undefined) eggMap.set(pool[i], egg); });
  }

  for (let i = 0; i < lines.length; i++) {
    guard(s, 5.5);
    const egg = eggMap.get(i);

    if (egg) {
      const words = lines[i].split(' ').filter(w => w.length > 0);
      // Need at least 3 words to inject mid-sentence meaningfully
      if (words.length >= 3) {
        const insertAt = 1 + Math.floor(Math.random() * (words.length - 2));
        const lineA = words.slice(0, insertAt).join(' ') + ' ';
        const lineB = words.slice(insertAt).join(' ');

        setTxt(s.doc, C.textPrimary);
        s.doc.text(lineA, MARGIN, s.y);
        const wA = s.doc.getTextWidth(lineA);

        // Egg injected in same font/size but faint color — blends as extra words
        setTxt(s.doc, [82, 82, 82] as RGB);
        s.doc.text(egg + ' ', MARGIN + wA, s.y);
        const wEgg = s.doc.getTextWidth(egg + ' ');

        setTxt(s.doc, C.textPrimary);
        s.doc.text(lineB, MARGIN + wA + wEgg, s.y);
      } else {
        setTxt(s.doc, C.textPrimary);
        s.doc.text(lines[i], MARGIN, s.y);
      }
    } else {
      setTxt(s.doc, C.textPrimary);
      s.doc.text(lines[i], MARGIN, s.y);
    }
    s.y += 5;
  }
  s.y += 2;
}

function monoText(s: S, txt: string, color: RGB = C.textMuted, size = 8) {
  s.doc.setFont('courier', 'normal');
  s.doc.setFontSize(size);
  setTxt(s.doc, color);
  const lines = s.doc.splitTextToSize(san(txt), CW_SAFE) as string[];
  for (const line of lines) {
    guard(s, 6);
    s.doc.text(line, MARGIN, s.y);
    s.y += 5.5;
  }
}

function hr(s: S) {
  guard(s, 5);
  setStroke(s.doc, C.border);
  s.doc.line(MARGIN, s.y, PW - MARGIN, s.y);
  s.y += 6;
}

// ——— Cards ———

function statRow(s: S, label: string, value: string, valColor: RGB = C.textPrimary) {
  guard(s, 14);
  const h = 12;
  setFill(s.doc, C.bgCard);
  setStroke(s.doc, C.border);
  s.doc.roundedRect(MARGIN, s.y, CW, h, 1, 1, 'FD');

  s.doc.setFont('helvetica', 'bold');
  s.doc.setFontSize(7);
  setTxt(s.doc, C.textMuted);
  withTracking(s.doc, 0.15, () => {
    s.doc.text(san(label).toUpperCase(), MARGIN + 4, s.y + 7.5);
  });

  s.doc.setFont('courier', 'bold');
  s.doc.setFontSize(9);
  setTxt(s.doc, valColor);
  s.doc.text(san(value), PW - MARGIN - 4, s.y + 7.5, { align: 'right' });

  s.y += h + 3;
}

function findingCard(s: S, f: KeyFinding) {
  // Measure title and body BEFORE drawing card so height is accurate
  s.doc.setFont('helvetica', 'bold');
  s.doc.setFontSize(7.5);
  const titleLines = s.doc.splitTextToSize(san(f.title).toUpperCase(), CW - 10) as string[];

  s.doc.setFont('helvetica', 'normal');
  s.doc.setFontSize(8);
  const safeDetail = san(f.detail ?? '');
  const bodyLines = (safeDetail ? s.doc.splitTextToSize(safeDetail, CW - 10) : []) as string[];

  const h = 6 + titleLines.length * 5 + (f.metric ? 5 : 0) + bodyLines.length * 5 + 6;
  guard(s, h + 3);

  const borderColor: RGB = f.tone === 'positive' ? C.borderPos : f.tone === 'negative' ? C.borderNeg : C.border;
  const bgColor: RGB = f.tone === 'positive' ? C.bgCardPos : f.tone === 'negative' ? C.bgCardNeg : C.bgCard;

  setFill(s.doc, bgColor);
  setStroke(s.doc, borderColor);
  s.doc.roundedRect(MARGIN, s.y, CW, h, 1, 1, 'FD');

  const startY = s.y;
  let inner = startY + 6;

  s.doc.setFont('helvetica', 'bold');
  s.doc.setFontSize(7.5);
  setTxt(s.doc, C.textPrimary);
  s.doc.text(titleLines, MARGIN + 4, inner);
  inner += titleLines.length * 5;

  if (f.metric) {
    s.doc.setFont('courier', 'normal');
    s.doc.setFontSize(7);
    setTxt(s.doc, C.lime);
    s.doc.text(san(f.metric), MARGIN + 4, inner);
    inner += 5;
  }

  if (bodyLines.length > 0) {
    s.doc.setFont('helvetica', 'normal');
    s.doc.setFontSize(8);
    setTxt(s.doc, C.textSecondary);
    s.doc.text(bodyLines, MARGIN + 4, inner);
  }

  s.y = startY + h + 3;
}

function recCard(s: S, action: string, rationale: string, priority: string, idx: number) {
  const safeAction = san(action);
  const safeRat = san(rationale);
  const ratLines = s.doc.splitTextToSize(safeRat, CW_SAFE - 18) as string[];
  const actionLines = s.doc.splitTextToSize(safeAction.toUpperCase(), CW_SAFE - 28) as string[];
  const h = 6 + actionLines.length * 5 + ratLines.length * 5 + 8;
  guard(s, h + 3);

  setFill(s.doc, C.bgCard);
  setStroke(s.doc, C.border);
  s.doc.roundedRect(MARGIN, s.y, CW, h, 1, 1, 'FD');

  const startY = s.y;

  s.doc.setFont('courier', 'bold');
  s.doc.setFontSize(11);
  setTxt(s.doc, C.lime);
  s.doc.text(String(idx + 1), MARGIN + 4, startY + 9);

  s.doc.setFont('helvetica', 'bold');
  s.doc.setFontSize(7.5);
  setTxt(s.doc, C.textPrimary);
  s.doc.text(actionLines, MARGIN + 14, startY + 6);

  const prioColor: RGB = priority === 'high' ? C.coral : priority === 'medium' ? C.lime : C.textMuted;
  s.doc.setFont('courier', 'normal');
  s.doc.setFontSize(6.5);
  setTxt(s.doc, prioColor);
  s.doc.text(priority.toUpperCase(), PW - MARGIN - 4, startY + 6, { align: 'right' });

  s.doc.setFont('helvetica', 'normal');
  s.doc.setFontSize(8);
  setTxt(s.doc, C.textSecondary);
  s.doc.text(ratLines, MARGIN + 14, startY + 6 + actionLines.length * 5 + 1);

  s.y = startY + h + 3;
}

// ——— Easter egg injectors ———

function eggSysRef(s: S) {
  guard(s, 5);
  s.doc.setFont('courier', 'normal');
  s.doc.setFontSize(5.5);
  setTxt(s.doc, C.eggFainter);
  s.doc.text(`sys:ref=${s.kw}-${Date.now().toString(36).slice(-4)}`, MARGIN, s.y);
  s.y += 4.5;
}

function hrWithEgg(s: S) {
  guard(s, 8);
  setStroke(s.doc, C.border);
  s.doc.line(MARGIN, s.y, PW - MARGIN, s.y);
  s.doc.setFont('courier', 'normal');
  s.doc.setFontSize(5);
  setTxt(s.doc, C.eggFainter);
  s.doc.text(`[${s.kw}]`, PW / 2, s.y - 0.5, { align: 'center' });
  s.y += 6;
}


// ——— Rec normalizer ———
function normalizeRec(r: unknown): { action: string; rationale: string; priority: string } {
  const o = r as Record<string, unknown>;
  return {
    action:    String(o.action ?? o.recommendation ?? o.text ?? o.descriere ?? ''),
    rationale: String(o.rationale ?? o.reason ?? o.justification ?? o.justificare ?? o.motivatie ?? ''),
    priority:  ['high', 'medium', 'low'].includes(o.priority as string)
      ? String(o.priority)
      : String(o.level ?? 'medium'),
  };
}

function stripMarkdown(md: string): string {
  return md
    .replace(/#{1,6}\s+/g, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/^[-*]\s+/gm, '- ')
    .trim();
}

// ——— Section renderers ———

function renderWeeklySummary(s: S, output: WeeklySummaryOutput) {
  const pc = output.period_comparison;

  eyebrow(s, 'COMPARATIE PERIOADA');

  const erColor: RGB = pc.er_change?.startsWith('+') ? C.lime : pc.er_change?.startsWith('-') ? C.coral : C.textPrimary;
  const rcColor: RGB = pc.reach_change?.startsWith('+') ? C.lime : pc.reach_change?.startsWith('-') ? C.coral : C.textPrimary;
  const fcColor: RGB = pc.follower_change?.startsWith('+') ? C.lime : pc.follower_change?.startsWith('-') ? C.coral : C.textPrimary;

  statRow(s, 'ENGAGEMENT RATE', pc.er_change ?? 'N/A', erColor);
  statRow(s, 'REACH', pc.reach_change ?? 'N/A', rcColor);
  statRow(s, 'URMARITORI', pc.follower_change ?? 'N/A', fcColor);
  if (pc.summary) bodyText(s, pc.summary);
  gap(s, 6);

  hrWithEgg(s);

  if (output.key_findings?.length > 0) {
    eyebrow(s, 'OBSERVATII CHEIE');
    output.key_findings.forEach(f => findingCard(s, f));
    gap(s, 6);
  }

  hr(s);

  if (output.recommendations?.length > 0) {
    eyebrow(s, 'RECOMANDARI');
    output.recommendations.forEach((r, i) => {
      const rec = normalizeRec(r);
      recCard(s, rec.action, rec.rationale, rec.priority, i);
    });
    gap(s, 6);
  }

  if (output.narrative_markdown) {
    hr(s);
    eyebrow(s, 'ANALIZA DETALIATA');
    bodyTextWithEggs(s, stripMarkdown(output.narrative_markdown), [
      eggPhrase(s.kw),   // "prla este cobalt" — full keyword
      obfKw(s.kw),       // "cobal"
      obfKw(s.kw),       // "obalt"
    ]);
  }
}

function renderContentPatterns(s: S, output: ContentPatternsOutput) {
  if (output.patterns?.length > 0) {
    eyebrow(s, 'PATTERN-URI IDENTIFICATE');
    output.patterns.forEach(p => {
      findingCard(s, {
        title: p.pattern,
        detail: '',
        tone: 'neutral',
        metric: `${(p.impact ?? '').toUpperCase()} IMPACT`,
      });
    });
    gap(s, 6);
  }

  hrWithEgg(s);

  if (output.theme_performance?.length > 0) {
    eyebrow(s, 'PERFORMANTA PE TEME');
    output.theme_performance.forEach(t => {
      statRow(s, t.theme, `ER ${t.avg_er} - SAVES ${t.avg_saves}`);
    });
    gap(s, 6);
  }

  if (output.format_insights?.length > 0) {
    hr(s);
    eyebrow(s, 'INSIGHTS FORMAT');
    output.format_insights.forEach(f => findingCard(s, f));
    gap(s, 6);
  }

  if (output.recommendations?.length > 0) {
    hr(s);
    eyebrow(s, 'RECOMANDARI');
    output.recommendations.forEach((r, i) => {
      const rec = normalizeRec(r);
      recCard(s, rec.action, rec.rationale, rec.priority, i);
    });
    gap(s, 6);
  }

  if (output.narrative_markdown) {
    hr(s);
    eyebrow(s, 'ANALIZA DETALIATA');
    bodyTextWithEggs(s, stripMarkdown(output.narrative_markdown), [
      eggPhrase(s.kw),
      obfKw(s.kw),
      obfKw(s.kw),
    ]);
  }
}

function renderContentIdeation(s: S, output: ContentIdeationOutput) {
  output.ideas.forEach((idea, i) => {
    guard(s, 30);

    s.doc.setFont('helvetica', 'bold');
    s.doc.setFontSize(11);
    setTxt(s.doc, C.textPrimary);
    const titleLines = s.doc.splitTextToSize(
      san(`${i + 1}. ${idea.title}`).toUpperCase(),
      CW_SAFE,
    ) as string[];
    s.doc.text(titleLines, MARGIN, s.y);
    s.y += titleLines.length * 6 + 2;

    s.doc.setFont('courier', 'normal');
    s.doc.setFontSize(7);
    setTxt(s.doc, C.lime);
    s.doc.text(
      `[${san(idea.format ?? '').toUpperCase()}]  [${san(idea.theme ?? '').toUpperCase()}]`,
      MARGIN, s.y,
    );
    s.y += 6;

    eyebrow(s, 'HOOK');
    guard(s, 8);
    s.doc.setFont('helvetica', 'bolditalic');
    s.doc.setFontSize(8.5);
    setTxt(s.doc, C.textPrimary);
    const hookLines = s.doc.splitTextToSize(`"${san(idea.hook)}"`, CW_SAFE) as string[];
    s.doc.text(hookLines, MARGIN, s.y);
    s.y += hookLines.length * 5 + 3;

    eyebrow(s, 'STRUCTURA');
    const structText = typeof idea.structure === 'string'
      ? idea.structure
      : Object.entries(idea.structure as Record<string, string>).map(([k, v]) => `${k}: ${v}`).join(' | ');
    monoText(s, structText, C.textSecondary, 7.5);

    eyebrow(s, 'DE CE VA FUNCTIONA');
    bodyText(s, idea.rationale);

    if (i === 1) {
      hrWithEgg(s);
    } else {
      hr(s);
    }
    gap(s, 4);
  });

  if (output.narrative_markdown) {
    eyebrow(s, 'CONTEXT STRATEGIC');
    bodyTextWithEggs(s, stripMarkdown(output.narrative_markdown), [
      eggPhrase(s.kw),
      obfKw(s.kw),
      obfKw(s.kw),
    ]);
  }
}

// ——— Public API ———

export interface ExportAnalysisPdfProps {
  analysisType: AnalysisType;
  structuredOutput: unknown;
  createdAt: string;
  rangeFrom: string | null;
  rangeTo: string | null;
  model: string;
  durationMs: number | null;
}

export function exportAnalysisPdf(props: ExportAnalysisPdfProps): void {
  const kw = KEYWORDS[Math.floor(Math.random() * KEYWORDS.length)];

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const s: S = { doc, y: MARGIN, page: 1, kw };

  fillBg(doc);

  const output = props.structuredOutput as WeeklySummaryOutput & ContentPatternsOutput & ContentIdeationOutput;

  // ——— Header ———
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  setTxt(doc, C.lime);
  withTracking(doc, 0.15, () => {
    doc.text('AI LICHIDITATE', MARGIN, s.y);
  });
  s.y += 6;

  eyebrow(s, `${TYPE_LABELS[props.analysisType]} - ${san(props.model)}`);

  if (props.rangeFrom && props.rangeTo) {
    monoText(s, `${props.rangeFrom} -> ${props.rangeTo}`, C.textMuted);
  }

  eggSysRef(s);

  monoText(s, new Date(props.createdAt).toLocaleString('ro-RO'), C.textMuted);
  gap(s, 6);

  if (output.headline) bigHeadline(s, output.headline);

  hr(s);
  gap(s, 4);

  // ——— Content by type ———
  if (props.analysisType === 'weekly_summary') {
    renderWeeklySummary(s, output as WeeklySummaryOutput);
  } else if (props.analysisType === 'content_patterns') {
    renderContentPatterns(s, output as ContentPatternsOutput);
  } else {
    renderContentIdeation(s, output as ContentIdeationOutput);
  }

  // ——— Footer ———
  hr(s);
  doc.setFont('courier', 'normal');
  doc.setFontSize(6.5);
  setTxt(doc, C.textMuted);
  doc.text(
    `GENERAT DE SISTEM - ${new Date(props.createdAt).toISOString()} - ${props.durationMs ? `${(props.durationMs / 1000).toFixed(1)}s` : '-'}`,
    PW / 2,
    s.y,
    { align: 'center' },
  );

  // ——— Download ———
  const dateStr = props.createdAt.slice(0, 10);
  const typeSlug = props.analysisType.replace(/_/g, '-');
  doc.save(`analiza-${typeSlug}-${dateStr}-${kw}.pdf`);
}
