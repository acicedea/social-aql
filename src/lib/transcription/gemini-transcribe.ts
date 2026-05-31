import 'server-only';
import { env } from '@/lib/env';
import type { TranscriptionResult } from './types';

const GEMINI_MODEL = 'gemini-2.5-flash';
const MAX_VIDEO_SIZE_BYTES = 20 * 1024 * 1024;

const TRANSCRIPTION_PROMPT = `Analizează acest video și returnează un JSON cu exact aceste câmpuri:

1. "transcript": textul complet al audio-ului, exact cum se aude, în limba originală (română sau engleză)

2. "segments": array de segmente cu timestamps, format:
   [{"start": "0:00", "end": "0:08", "text": "textul acestui segment"}]
   - Împarte pe propoziții logice, nu cuvânt cu cuvânt
   - Timestamps în format M:SS

3. "visual_description": o descriere detaliată a ce se vede în video:
   - Fundalul și decorul
   - Text grafic sau titluri afișate pe ecran (EXACT cum scrie)
   - Grafice, tabele, imagini dacă există
   - Mișcarea sau tăieturile (cuts) principale
   - Aspectul general (fața vorbitorului, studio, outdoor etc.)

4. "language": limba principală din video ("ro" sau "en")

5. "duration_seconds": durata totală estimată în secunde (număr)

Vocabular financiar specific de recunoscut corect:
FED, BCE, DXY, PIB, GDP, S&P 500, NASDAQ, FOMC, tapering, QE, spread,
inflație, dobândă, lichiditate, piețe emergente, bullish, bearish,
rezistență, suport, breakout, yield curve, T-bills

Returnează DOAR JSON valid. Fără text adițional, fără markdown, fără code fences.`;

export async function transcribeVideo(
  videoUrl: string,
): Promise<TranscriptionResult> {
  if (!env.GOOGLE_GENERATIVE_AI_API_KEY) {
    throw new Error('GOOGLE_GENERATIVE_AI_API_KEY not configured');
  }

  let videoBytes: Buffer;
  try {
    const response = await fetch(videoUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      throw new Error(`Video download failed: HTTP ${response.status}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    videoBytes = Buffer.from(arrayBuffer);
  } catch (err) {
    throw new Error(
      `Failed to download video: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  console.log(`[transcribe] video size: ${(videoBytes.length / 1024 / 1024).toFixed(2)}MB`);

  let geminiResponse: Response;
  if (videoBytes.length > MAX_VIDEO_SIZE_BYTES) {
    geminiResponse = await transcribeViaFileApi(videoBytes);
  } else {
    geminiResponse = await transcribeInline(videoBytes);
  }

  if (!geminiResponse.ok) {
    const errText = await geminiResponse.text();
    throw new Error(`Gemini transcription failed: ${geminiResponse.status} — ${errText.slice(0, 300)}`);
  }

  const json = await geminiResponse.json() as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
    }>;
  };

  const text = json.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  if (!text) {
    throw new Error('Gemini returned empty transcription response');
  }

  let parsed: {
    transcript?: string;
    segments?: Array<{ start: string; end: string; text: string }>;
    visual_description?: string;
    language?: string;
    duration_seconds?: number;
  };

  try {
    const clean = text.replace(/```json\n?|```\n?/g, '').trim();
    parsed = JSON.parse(clean);
  } catch {
    throw new Error(`Failed to parse Gemini JSON response: ${text.slice(0, 200)}`);
  }

  return {
    transcript: parsed.transcript ?? '',
    segments: parsed.segments ?? [],
    visualDescription: parsed.visual_description ?? '',
    language: parsed.language ?? 'ro',
    model: GEMINI_MODEL,
    durationSeconds: parsed.duration_seconds ?? null,
  };
}

async function transcribeInline(videoBytes: Buffer): Promise<Response> {
  const base64Video = videoBytes.toString('base64');
  return fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${env.GOOGLE_GENERATIVE_AI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: TRANSCRIPTION_PROMPT },
            { inline_data: { mime_type: 'video/mp4', data: base64Video } },
          ],
        }],
        generationConfig: { temperature: 0.0, maxOutputTokens: 4096 },
      }),
    }
  );
}

async function transcribeViaFileApi(videoBytes: Buffer): Promise<Response> {
  console.log('[transcribe] video > 20MB, using File API');

  const uploadResponse = await fetch(
    `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${env.GOOGLE_GENERATIVE_AI_API_KEY}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'video/mp4',
        'X-Goog-Upload-Protocol': 'raw',
      },
      body: new Uint8Array(videoBytes),
    }
  );

  if (!uploadResponse.ok) {
    const err = await uploadResponse.text();
    throw new Error(`File API upload failed: ${err.slice(0, 200)}`);
  }

  const uploadJson = await uploadResponse.json() as {
    file?: { uri?: string };
  };
  const fileUri = uploadJson.file?.uri;
  if (!fileUri) {
    throw new Error('File API did not return a file URI');
  }

  console.log(`[transcribe] File API upload success: ${fileUri}`);

  return fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${env.GOOGLE_GENERATIVE_AI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: TRANSCRIPTION_PROMPT },
            { file_data: { mime_type: 'video/mp4', file_uri: fileUri } },
          ],
        }],
        generationConfig: { temperature: 0.0, maxOutputTokens: 4096 },
      }),
    }
  );
}
