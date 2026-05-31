# AI LICHIDITATE — Prompt 09: Video Transcription + Visual Analysis

## Context

Sync-ul curent importă metadata și metrici pentru postări dar nu poate analiza conținutul video-urilor (Reels). Fără transcript, AI-ul analizează doar caption-ul — care e adesea diferit de ce se spune în video.

Această funcționalitate adaugă:
1. **Job queue asincronă** (Supabase) pentru procesarea video în background
2. **Gemini multimodal** pentru transcript text + timestamps + analiză vizuală
3. **Enrichment automat al analizelor AI** cu datele din transcript

## Cum funcționează

```
SYNC (neschimbat, rapid):
  Meta API → posts + metrics → DB ✓
  + inserează transcription_jobs pentru Reels/Videos noi

TRANSCRIPTION CRON (la fiecare 5 minute):
  pending jobs → download video → Gemini → transcript_data → DB

ANALYSES (îmbogățite automat):
  data builder → citește transcript dacă există → include în prompt
```

## SCOPE BOUNDARY

Acest prompt face CINCI lucruri:
1. DB migration: `transcription_jobs` table + coloane pe `posts`
2. Transcription worker (`src/lib/transcription/`)
3. Cron route la `/api/cron/transcribe`
4. Enrichment în data builder pentru analize
5. UI: progress indicator pe post detail + transcripts vizibile

Nu se schimbă sync logic-ul existent, nu se adaugă features noi.

## Carry-over (LOCKED)

- Sync flow existent — neatins, adăugăm doar inserarea de jobs
- Toate paginile existente
- Analyses runner — doar data builder se îmbunătățește
- Design system, tokens

## Stack additions

- Nicio dependență nouă npm

## Files allowed to change

DB:
- New: `supabase/migrations/0007_transcription_jobs.sql`

Transcription logic:
- New: `src/lib/transcription/types.ts`
- New: `src/lib/transcription/gemini-transcribe.ts`
- New: `src/lib/transcription/worker.ts`
- `src/lib/sync/sync-account.ts` — adaugă inserarea de jobs după sync posts

Cron:
- `vercel.json` — adaugă cron la fiecare 5 minute
- New: `src/app/api/cron/transcribe/route.ts`

Analyses enrichment:
- `src/ai/analyses/data-builders.ts` — adaugă transcript în per-post data

UI:
- `src/app/dashboard/posts/[id]/page.tsx` — adaugă secțiunea Transcript
- New: `src/components/posts/TranscriptSection.tsx`

## DO NOT TOUCH

- Meta provider
- Sync flow core (doar adăugăm jobs, nu modificăm logica)
- Analyses runner și prompts (data builder primește date mai bogate, prompts rămân)
- KPI engine
- Auth, chat, roluri

---

## Deliverable 1: DB Migration

Create `supabase/migrations/0007_transcription_jobs.sql`:

```sql
-- =====================================================================
-- 0007: Transcription job queue + transcript columns on posts
-- =====================================================================

-- Job queue pentru procesare asincronă
create table public.transcription_jobs (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'completed', 'failed', 'skipped')),
  attempts integer not null default 0,
  max_attempts integer not null default 3,
  error_message text,
  video_url text,               -- URL-ul video la momentul inserării (expiră, de asta îl stocăm)
  media_type text not null,     -- 'reel' | 'video'
  duration_seconds numeric,     -- durata estimată
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (post_id)              -- un singur job per post
);

create index transcription_jobs_status_idx
  on public.transcription_jobs(status, created_at asc)
  where status in ('pending', 'failed');  -- partial index, rapid

create index transcription_jobs_account_idx
  on public.transcription_jobs(account_id);

-- Coloane pe posts pentru stocarea transcript-ului
alter table public.posts
  add column if not exists transcript text,
  add column if not exists transcript_segments jsonb,
  -- [{ start: "0:00", end: "0:08", text: "Există o instituție..." }]
  add column if not exists visual_description text,
  -- ce se vede în video: elemente grafice, text on-screen, scenă
  add column if not exists transcript_language text,
  add column if not exists transcript_model text,
  add column if not exists transcript_at timestamptz;

-- Actualizează view-ul posts_with_latest_metrics să includă transcript
create or replace view public.posts_with_latest_metrics as
select
  p.id,
  p.account_id,
  p.external_post_id,
  p.published_at,
  p.media_type,
  p.caption,
  p.media_url,
  p.thumbnail_url,
  p.permalink,
  p.hashtags,
  p.mentions,
  p.theme,
  p.theme_secondary,
  p.theme_confidence,
  p.followers_at_publish,
  -- TRANSCRIPT (nou)
  p.transcript,
  p.transcript_segments,
  p.visual_description,
  p.transcript_at,
  p.transcript_model,
  -- METRICS (din lateral join existent)
  pms.captured_at as metrics_captured_at,
  pms.impressions,
  pms.reach,
  pms.likes,
  pms.comments,
  pms.shares,
  pms.saves,
  pms.video_views,
  pms.watch_time_seconds,
  pms.er_by_reach,
  pms.saves_per_reach,
  pms.sends_per_reach,
  pms.likes_per_reach,
  pms.save_to_like_ratio,
  pms.reach_rate,
  pms.completion_rate,
  pms.avg_watch_time_seconds
from public.posts p
left join lateral (
  select *
  from public.post_metrics_snapshots
  where post_id = p.id
  order by captured_at desc
  limit 1
) pms on true;

-- RLS: transcription_jobs accesibil prin ownership de cont
alter table public.transcription_jobs enable row level security;

create policy "transcription_jobs_owner" on public.transcription_jobs
  for all using (
    exists (
      select 1 from public.accounts a
      where a.id = account_id and a.user_id = auth.uid()
    )
  );

-- updated_at trigger
create trigger transcription_jobs_touch before update on public.transcription_jobs
  for each row execute function public.touch_updated_at();
```

---

## Deliverable 2: Transcription types

Create `src/lib/transcription/types.ts`:

```ts
export type TranscriptionStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'skipped';

export interface TranscriptionSegment {
  start: string;    // "0:00" format
  end: string;
  text: string;
}

export interface TranscriptionResult {
  transcript: string;                    // text complet
  segments: TranscriptionSegment[];      // cu timestamps
  visualDescription: string;             // ce se vede în video
  language: string;                      // 'ro', 'en', etc.
  model: string;                         // 'gemini-2.5-flash'
  durationSeconds: number | null;
}

export interface TranscriptionJob {
  id: string;
  postId: string;
  accountId: string;
  status: TranscriptionStatus;
  attempts: number;
  maxAttempts: number;
  errorMessage: string | null;
  videoUrl: string | null;
  mediaType: string;
  createdAt: string;
}
```

---

## Deliverable 3: Gemini transcription engine

Create `src/lib/transcription/gemini-transcribe.ts`:

```ts
import 'server-only';
import { env } from '@/lib/env';
import type { TranscriptionResult } from './types';

const GEMINI_MODEL = 'gemini-2.5-flash';
const MAX_VIDEO_SIZE_BYTES = 20 * 1024 * 1024; // 20MB — above this, use File API

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

  // Step 1: Download video
  let videoBytes: Buffer;
  try {
    const response = await fetch(videoUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(30_000), // 30s timeout pentru download
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

  // Step 2: Send to Gemini
  // For videos > 20MB, use File API (upload first, then reference)
  let geminiResponse: Response;

  if (videoBytes.length > MAX_VIDEO_SIZE_BYTES) {
    // Use File API for large videos
    geminiResponse = await transcribeViaFileApi(videoBytes, videoUrl);
  } else {
    // Inline for small videos
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

  // Parse JSON response
  let parsed: {
    transcript?: string;
    segments?: Array<{ start: string; end: string; text: string }>;
    visual_description?: string;
    language?: string;
    duration_seconds?: number;
  };

  try {
    // Clean potential markdown fences
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
            {
              inline_data: {
                mime_type: 'video/mp4',
                data: base64Video,
              },
            },
          ],
        }],
        generationConfig: {
          temperature: 0.0,     // maxim determinist pentru transcriere
          maxOutputTokens: 4096,
        },
      }),
    }
  );
}

async function transcribeViaFileApi(
  videoBytes: Buffer,
  originalUrl: string,
): Promise<Response> {
  // Step 1: Upload file to Gemini File API
  console.log('[transcribe] video > 20MB, using File API');

  const uploadResponse = await fetch(
    `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${env.GOOGLE_GENERATIVE_AI_API_KEY}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'video/mp4',
        'X-Goog-Upload-Protocol': 'raw',
      },
      body: videoBytes,
    }
  );

  if (!uploadResponse.ok) {
    const err = await uploadResponse.text();
    throw new Error(`File API upload failed: ${err.slice(0, 200)}`);
  }

  const uploadJson = await uploadResponse.json() as {
    file?: { uri?: string; name?: string };
  };
  const fileUri = uploadJson.file?.uri;

  if (!fileUri) {
    throw new Error('File API did not return a file URI');
  }

  console.log(`[transcribe] File API upload success: ${fileUri}`);

  // Step 2: Generate content using file URI
  return fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${env.GOOGLE_GENERATIVE_AI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: TRANSCRIPTION_PROMPT },
            {
              file_data: {
                mime_type: 'video/mp4',
                file_uri: fileUri,
              },
            },
          ],
        }],
        generationConfig: {
          temperature: 0.0,
          maxOutputTokens: 4096,
        },
      }),
    }
  );
}
```

---

## Deliverable 4: Transcription worker

Create `src/lib/transcription/worker.ts`:

```ts
import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { transcribeVideo } from './gemini-transcribe';

const BATCH_SIZE = 3;        // procesăm maxim 3 video-uri per run (conservativ)
const MAX_VIDEO_DURATION = 180; // skip videouri > 3 minute (probabil nu e Reel)

export interface WorkerResult {
  processed: number;
  completed: number;
  failed: number;
  skipped: number;
  errors: string[];
}

export async function runTranscriptionWorker(): Promise<WorkerResult> {
  const supabase = await createSupabaseServerClient();

  const result: WorkerResult = {
    processed: 0,
    completed: 0,
    failed: 0,
    skipped: 0,
    errors: [],
  };

  // Fetch pending jobs (include failed ones that haven't exceeded max_attempts)
  const { data: jobs, error: fetchError } = await supabase
    .from('transcription_jobs')
    .select(`
      id, post_id, account_id, status, attempts, max_attempts,
      video_url, media_type
    `)
    .or('status.eq.pending,and(status.eq.failed,attempts.lt.max_attempts)')
    .order('created_at', { ascending: true })
    .limit(BATCH_SIZE);

  if (fetchError || !jobs || jobs.length === 0) {
    console.log('[transcription worker] no pending jobs');
    return result;
  }

  console.log(`[transcription worker] processing ${jobs.length} jobs`);

  for (const job of jobs) {
    result.processed++;

    // Mark as processing
    await supabase
      .from('transcription_jobs')
      .update({
        status: 'processing',
        started_at: new Date().toISOString(),
        attempts: job.attempts + 1,
      })
      .eq('id', job.id);

    try {
      // Get current video URL (may have changed since job was created)
      const { data: post } = await supabase
        .from('posts')
        .select('media_url, media_type, transcript')
        .eq('id', job.post_id)
        .single();

      // Skip if already transcribed
      if (post?.transcript) {
        await supabase
          .from('transcription_jobs')
          .update({ status: 'skipped', completed_at: new Date().toISOString() })
          .eq('id', job.id);
        result.skipped++;
        continue;
      }

      // Use stored video URL or current one
      const videoUrl = job.video_url || post?.media_url;

      if (!videoUrl) {
        throw new Error('No video URL available — URL may have expired');
      }

      // Transcribe
      const transcription = await transcribeVideo(videoUrl);

      // Save transcript to post
      await supabase
        .from('posts')
        .update({
          transcript: transcription.transcript,
          transcript_segments: transcription.segments,
          visual_description: transcription.visualDescription,
          transcript_language: transcription.language,
          transcript_model: transcription.model,
          transcript_at: new Date().toISOString(),
        })
        .eq('id', job.post_id);

      // Mark job as completed
      await supabase
        .from('transcription_jobs')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
        })
        .eq('id', job.id);

      result.completed++;
      console.log(`[transcription worker] completed job ${job.id}`);

    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[transcription worker] failed job ${job.id}:`, message);

      result.failed++;
      result.errors.push(`${job.id}: ${message}`);

      const newAttempts = job.attempts + 1;
      const isFinal = newAttempts >= job.max_attempts;

      await supabase
        .from('transcription_jobs')
        .update({
          status: isFinal ? 'failed' : 'pending', // back to pending for retry
          error_message: message,
          completed_at: isFinal ? new Date().toISOString() : null,
        })
        .eq('id', job.id);
    }
  }

  console.log(`[transcription worker] done: ${JSON.stringify(result)}`);
  return result;
}
```

---

## Deliverable 5: Wire jobs into sync

In `src/lib/sync/sync-account.ts`, după ce inserezi/upsertezi postările noi, inserează job-uri de transcriere pentru Reels și Videos:

```ts
import type { NormalizedPost } from '@/lib/normalized-types';

// ... după upsert-ul de posts, adaugă:

// Inserează transcription jobs pentru posts video noi
const videoPosts = upsertedPosts.filter(
  p => p.mediaType === 'reel' || p.mediaType === 'video'
);

if (videoPosts.length > 0) {
  const transcriptionJobs = videoPosts.map(post => ({
    post_id: post.dbId,              // id-ul din DB după upsert
    account_id: accountId,
    media_type: post.mediaType,
    video_url: post.mediaUrl,        // stocăm URL-ul acum, cât e valid
    status: 'pending',
  }));

  // onConflict: dacă jobul există deja (re-sync), nu îl duplicăm
  await supabase
    .from('transcription_jobs')
    .upsert(transcriptionJobs, {
      onConflict: 'post_id',
      ignoreDuplicates: true,        // skip dacă jobul există deja
    });

  console.log(`[sync] queued ${videoPosts.length} transcription jobs`);
}
```

**Notă importantă:** `video_url` se stochează la momentul sync-ului când URL-ul e încă valid. Worker-ul folosește în primul rând URL-ul stocat, nu cel curent din `posts.media_url`.

---

## Deliverable 6: Cron route

Actualizează `vercel.json` să adauge cron-ul de transcriere:

```json
{
  "crons": [
    {
      "path": "/api/cron/weekly-summary",
      "schedule": "0 16 * * 3"
    },
    {
      "path": "/api/cron/transcribe",
      "schedule": "*/5 * * * *"
    }
  ]
}
```

`*/5 * * * *` = la fiecare 5 minute. Pe Vercel Hobby, cron-urile funcționează cu o frecvență minimă de 1 dată pe zi — **verifică în Vercel docs dacă `*/5` e suportat pe free tier sau dacă trebuie `0 * * * *` (la fiecare oră).** Dacă nu e suportat, fallback la `0 * * * *` (la fiecare oră).

Create `src/app/api/cron/transcribe/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { runTranscriptionWorker } from '@/lib/transcription/worker';
import { env } from '@/lib/env';

export const maxDuration = 300; // 5 minute — Vercel Hobby permite 300s

export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization');
  if (!env.CRON_SECRET || authHeader !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  console.log('[cron/transcribe] starting worker');
  const startTime = Date.now();

  try {
    const result = await runTranscriptionWorker();
    const duration = Date.now() - startTime;

    console.log(`[cron/transcribe] done in ${duration}ms:`, result);
    return NextResponse.json({ success: true, result, durationMs: duration });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[cron/transcribe] worker error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

---

## Deliverable 7: Enrich data builders cu transcript

In `src/ai/analyses/data-builders.ts`, extinde `PostForAnalysis` cu câmpurile de transcript:

```ts
export interface PostForAnalysis {
  // ... câmpuri existente ...

  // Transcript (nou — null dacă nu e disponibil)
  hasTranscript: boolean;
  transcriptHook: string | null;      // primele 2 propoziții din transcript
  transcriptStructure: string | null; // rezumat al structurii narrative (generat)
  transcriptKeywords: string[];       // cuvinte financiare cheie detectate
  visualDescription: string | null;   // ce se vede în video
}
```

Când construiești obiectul `PostForAnalysis`, adaugă:

```ts
const transcript = post.transcript ?? null;
const segments = (post.transcript_segments ?? []) as TranscriptionSegment[];

// Extrage hook-ul verbal (primele 2 propoziții)
const transcriptHook = transcript
  ? transcript.split(/[.!?]/).slice(0, 2).join('. ').trim() + '.'
  : null;

// Extrage structura din segmente (rezumat timestamps)
const transcriptStructure = segments.length > 0
  ? segments.map(s => `${s.start}-${s.end}: "${s.text.slice(0, 60)}"`).join(' | ')
  : null;

// Detectează cuvinte cheie financiare
const financialKeywords = [
  'FED', 'BCE', 'inflație', 'dobândă', 'PIB', 'S&P', 'NASDAQ',
  'bitcoin', 'crypto', 'aur', 'dolar', 'lichiditate',
];
const transcriptLower = (transcript ?? '').toLowerCase();
const transcriptKeywords = financialKeywords.filter(k =>
  transcriptLower.includes(k.toLowerCase())
);
```

Actualizează și `formatPost` în `buildWeeklySummaryPrompt` să includă datele de transcript:

```ts
const formatPost = (p: PostForAnalysis, idx: number) =>
  `  ${idx + 1}. [ID:${p.postId}] ${p.mediaType.toUpperCase()}
     Hook caption: "${p.hook}"
     ${p.hasTranscript ? `Hook verbal (din video): "${p.transcriptHook}"` : 'Transcript: indisponibil'}
     ${p.transcriptStructure ? `Structură video: ${p.transcriptStructure}` : ''}
     ${p.visualDescription ? `Descriere vizuală: ${p.visualDescription.slice(0, 150)}` : ''}
     ${p.transcriptKeywords.length > 0 ? `Cuvinte cheie video: ${p.transcriptKeywords.join(', ')}` : ''}
     ...restul câmpurilor existente...`;
```

---

## Deliverable 8: Transcript section în post detail

In `src/app/dashboard/posts/[id]/page.tsx`, adaugă secțiunea de transcript după PostKpiGrid.

Create `src/components/posts/TranscriptSection.tsx`:

```tsx
import type { TranscriptionSegment } from '@/lib/transcription/types';
import { Eyebrow, H3, Body, Mono } from '@/components/design-system';
import { Card } from '@/components/design-system';

interface Props {
  transcript: string | null;
  segments: TranscriptionSegment[] | null;
  visualDescription: string | null;
  transcriptAt: string | null;
  model: string | null;
  jobStatus: 'pending' | 'processing' | 'completed' | 'failed' | 'skipped' | null;
}

export function TranscriptSection({
  transcript,
  segments,
  visualDescription,
  transcriptAt,
  model,
  jobStatus,
}: Props) {
  // Nu avem transcript și nu există job → nu e un Reel (e imagine/carousel)
  if (!transcript && !jobStatus) return null;

  // Job în așteptare / procesare
  if (!transcript && (jobStatus === 'pending' || jobStatus === 'processing')) {
    return (
      <section style={{ marginTop: 40 }}>
        <Eyebrow tone="muted">TRANSCRIPT · VIDEO</Eyebrow>
        <H3>Transcriere în curs</H3>
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 8 }}>
            <Mono tone="muted" style={{ fontSize: 12 }}>
              ⏳ {jobStatus === 'processing' ? 'SE PROCESEAZĂ...' : 'ÎN COADĂ'}
            </Mono>
            <Body tone="secondary" style={{ fontSize: 13 }}>
              Transcrierea video-ului este în curs. Va fi disponibilă în câteva minute.
            </Body>
          </div>
        </Card>
      </section>
    );
  }

  // Job eșuat
  if (!transcript && jobStatus === 'failed') {
    return (
      <section style={{ marginTop: 40 }}>
        <Eyebrow tone="muted">TRANSCRIPT · VIDEO</Eyebrow>
        <H3>Transcriere indisponibilă</H3>
        <Card variant="negative">
          <Body tone="secondary" style={{ fontSize: 13 }}>
            Transcrierea a eșuat (URL video posibil expirat). 
            Reels-urile trebuie transcrise în primele 24h după sync.
          </Body>
        </Card>
      </section>
    );
  }

  // Transcript disponibil
  if (!transcript) return null;

  return (
    <section style={{ marginTop: 40 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 16 }}>
        <div>
          <Eyebrow tone="muted">TRANSCRIPT · VIDEO</Eyebrow>
          <H3>Conținut Audio-Vizual</H3>
        </div>
        {transcriptAt && (
          <Mono tone="muted" style={{ fontSize: 10 }}>
            {model?.toUpperCase()} · {new Date(transcriptAt).toLocaleDateString('ro-RO')}
          </Mono>
        )}
      </div>

      {/* Transcript full text */}
      <Card style={{ marginBottom: 12 }}>
        <Eyebrow tone="lime" style={{ marginBottom: 8 }}>TRANSCRIPT AUDIO</Eyebrow>
        <Body style={{ lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
          {transcript}
        </Body>
      </Card>

      {/* Segments cu timestamps */}
      {segments && segments.length > 0 && (
        <Card style={{ marginBottom: 12 }}>
          <Eyebrow tone="muted" style={{ marginBottom: 8 }}>
            STRUCTURĂ · {segments.length} SEGMENTE
          </Eyebrow>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {segments.map((seg, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  gap: 16,
                  borderLeft: '3px solid var(--color-border-default)',
                  paddingLeft: 12,
                }}
              >
                <Mono
                  tone="muted"
                  style={{ fontSize: 11, minWidth: 60, marginTop: 2 }}
                >
                  {seg.start}–{seg.end}
                </Mono>
                <Body style={{ fontSize: 14 }}>{seg.text}</Body>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Visual description */}
      {visualDescription && (
        <Card>
          <Eyebrow tone="muted" style={{ marginBottom: 8 }}>DESCRIERE VIZUALĂ</Eyebrow>
          <Body tone="secondary" style={{ fontSize: 13, lineHeight: 1.6 }}>
            {visualDescription}
          </Body>
        </Card>
      )}
    </section>
  );
}
```

In `src/app/dashboard/posts/[id]/page.tsx`, fetch și job status-ul alături de post:

```ts
// Adaugă în Promise.all existent:
const { data: transcriptionJob } = await supabase
  .from('transcription_jobs')
  .select('status')
  .eq('post_id', post.id)
  .single();

// Pasează la TranscriptSection:
<TranscriptSection
  transcript={post.transcript ?? null}
  segments={post.transcript_segments as TranscriptionSegment[] ?? null}
  visualDescription={post.visual_description ?? null}
  transcriptAt={post.transcript_at ?? null}
  model={post.transcript_model ?? null}
  jobStatus={transcriptionJob?.status ?? null}
/>
```

---

## Verification checklist

1. `pnpm build` succeeds, zero TypeScript errors
2. `pnpm lint` passes
3. **DB migration:** apply `0007_transcription_jobs.sql`. Tabelele `transcription_jobs` și coloanele noi pe `posts` există.
```sql
   SELECT column_name FROM information_schema.columns
   WHERE table_name = 'posts' AND column_name LIKE 'transcript%';
   -- Trebuie să returneze: transcript, transcript_segments, transcript_at, etc.
```
4. **Jobs create la sync:** fă un re-sync al contului Meta. Verifică:
```sql
   SELECT COUNT(*) FROM transcription_jobs WHERE status = 'pending';
   -- Trebuie să fie > 0 dacă ai Reels
```
5. **Worker rulează:** apelează manual cron-ul de transcriere:
```bash
   curl -H "Authorization: Bearer YOUR_CRON_SECRET" \
     http://localhost:3000/api/cron/transcribe
   # Răspuns: { success: true, result: { processed: N, completed: N } }
```
6. **Transcript salvat:** după worker, verifică:
```sql
   SELECT id, transcript IS NOT NULL as has_transcript, transcript_at
   FROM posts WHERE media_type IN ('reel', 'video');
```
7. **Post detail afișează transcript:** navighează la un Reel în `/dashboard/posts/[id]`. Secțiunea "Transcript Audio" apare cu textul.
8. **Segmente cu timestamps:** secțiunea "Structură" arată segmentele cu timestamps (0:00–0:08 etc.)
9. **Descriere vizuală:** secțiunea "Descriere Vizuală" descrie ce se vede în video.
10. **Job pending afișat:** pentru un Reel netranscris încă, post detail arată "⏳ ÎN COADĂ".
11. **Română recunoscută corect:** transcriptul unui Reel românesc e în română, nu engleză.
12. **Termeni financiari corecți:** în transcript, "FED", "PIB", "inflație" sunt scrise corect, nu "FET", "IP", "infla".
13. **Analyse îmbogățite:** generează un Content Patterns analysis. Verifică că pentru un Reel cu transcript, data trimisă la Gemini include `Hook verbal` și `Structură video`.
14. **Video > 20MB:** dacă ai vreun Reel > 20MB, verifică în logs că se folosește File API (mesajul "video > 20MB, using File API").
15. **Retry logic:** modifică manual un job la `status = 'failed', attempts = 1, max_attempts = 3`. Worker-ul trebuie să îl preia și să îl retranscrie.
16. **Skip duplicate:** dacă un Reel are deja transcript, re-sync-ul nu înlocuiește transcript-ul existent (insert cu `ignoreDuplicates: true`).

## Notes pentru Claude Code

- **URL video expirant** e cea mai importantă limitare. Stocăm URL-ul la momentul sync-ului (în `transcription_jobs.video_url`). Worker-ul încearcă URL-ul stocat primul, dacă eșuează încearcă cel curent din `posts.media_url`. Dacă ambele eșuează, jobul e marcat `failed`.
- **Vercel cron `*/5 * * * *`** poate fi nesuportat pe free tier. Verifică docs actuali. Alternativa sigură: `0 * * * *` (la fiecare oră) sau `0 */2 * * *` (la fiecare 2 ore). Documentează în FORK.md.
- **`maxDuration = 300`** în route handler e specific Next.js App Router pentru Vercel — permite funcției să ruleze până la 300s în loc de default-ul mai mic.
- **Gemini File API** pentru videouri mari: URL-urile din File API expiră după 48h — nu le stoca în DB.
- **Temperatura 0.0** pentru transcriere — important pentru acuratețe. Nu vrem creativitate la transcriere.
- **`ignoreDuplicates: true` la upsert** — critic. La fiecare re-sync, nu vrem să creăm duplicate de jobs sau să resetăm un job deja completat.
- Modelul `gemini-2.5-flash` e folosit pentru transcriere (nu `gemini-3.5-flash` care e pentru chat). Costul de transcriere e calculat ca tokens de video, nu ca text tokens — consultă Gemini pricing pentru video input.

## What Andrei will do after this prompt

1. Apply `0007_transcription_jobs.sql` în Supabase
2. `pnpm dev`, verify build
3. Trigger sync manual pe contul Meta
4. Verifică `SELECT COUNT(*) FROM transcription_jobs` — trebuie să fie > 0
5. Apelează manual cron-ul de transcriere cu curl
6. Verifică un Reel în `/dashboard/posts/[id]` — vede transcriptul?
7. Verifică acuratețea transcriptului (termeni financiari corecți?)
8. Generează un Weekly Summary sau Content Patterns — analizele menționează conținutul video?
9. Raportează:
   - Calitatea transcriptului (acuratețe pentru română financiară)
   - Dacă descrierea vizuală e utilă sau prea generică
   - Dacă Vercel Hobby suportă cron la 5 minute sau trebuie ajustat
   - Costul estimat (tokens Gemini pentru video)