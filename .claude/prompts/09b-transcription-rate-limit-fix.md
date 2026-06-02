# AI LICHIDITATE — Prompt 09b: Transcription Worker Rate Limit Fix

## Context

Transcription worker procesează video-uri via Gemini API dar eșuează
din cauza rate limiting (429 errors). Problema: worker-ul marchează
job-urile ca `failed` la 429 în loc să le reprogrameze, și nu există
un control al bugetului zilnic de requests.

Rate limits Gemini 2.5 Flash free tier:
- 10 RPM (requests per minute)
- 250 RPD (requests per day)

Soluție: daily budget control + retry logic pentru 429 + cron zilnic.

## SCOPE BOUNDARY

Modifică DOAR:
1. `supabase/migrations/0009_transcription_retry_fields.sql`
2. `src/lib/transcription/worker.ts`
3. `vercel.json` — schimbă cron schedule
4. `src/app/api/cron/transcribe/route.ts` — minor update

## DO NOT TOUCH

- `src/lib/transcription/gemini-transcribe.ts`
- Sync flow
- Toate celelalte fișiere

---

## Deliverable 1: DB migration — adaugă retry fields

Create `supabase/migrations/0009_transcription_retry_fields.sql`:

```sql
-- Adaugă câmpuri pentru retry logic și daily budget tracking
ALTER TABLE public.transcription_jobs
  ADD COLUMN IF NOT EXISTS retry_after timestamptz,
  -- când poate fi reîncercat după un rate limit
  ADD COLUMN IF NOT EXISTS last_error_code text;
  -- '429', '500', etc.

-- Index pentru worker query (pending + retry_after expirat)
CREATE INDEX IF NOT EXISTS transcription_jobs_worker_idx
  ON public.transcription_jobs(status, retry_after, created_at)
  WHERE status IN ('pending', 'failed');
```

---

## Deliverable 2: Rescrie worker cu rate limit handling

Rescrie complet `src/lib/transcription/worker.ts`:

```ts
import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { transcribeVideo } from './gemini-transcribe';

// ── Config ────────────────────────────────────────────────────────────

const DAILY_BUDGET = 20;
// Câte transcrieri facem pe zi maxim.
// Conservativ față de limita de 250 RPD pentru că:
// 1. Analizele AI și chat-ul folosesc același API key
// 2. Un video poate necesita 2-3 retry-uri
// 3. Vrem să lăsăm headroom pentru features interactive
// Ajustează în sus dacă ai API key dedicat pentru transcriere.

const BATCH_SIZE = 30;
// Câte procesăm per run de cron. Cu cron zilnic și DAILY_BUDGET=20,
// poți face mai multe rulări pe zi dacă vrei prin trigger manual.

const RETRY_DELAY_MINUTES = 60;
// Cât așteptăm după un 429 înainte de retry.
// Gemini resetează quota pe minute, nu pe ore — dar 60min e safe.

const MAX_ATTEMPTS = 5;
// Maxim 5 încercări per job înainte de a-l marca failed definitiv.
// Cu RETRY_DELAY=60min, un job poate fi încercat pe 5 zile consecutive.

// ── Types ─────────────────────────────────────────────────────────────

export interface WorkerResult {
  processed: number;
  completed: number;
  skipped: number;
  rateLimited: number;    // 429s primite
  failed: number;
  budgetUsed: number;     // câte transcrieri s-au făcut azi total
  budgetRemaining: number;
  errors: string[];
}

// ── Daily budget check ────────────────────────────────────────────────

async function getDailyTranscriptionsCount(supabase: any): Promise<number> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const { count } = await supabase
    .from('transcription_jobs')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'completed')
    .gte('completed_at', todayStart.toISOString());

  return count ?? 0;
}

// ── Is 429 error ─────────────────────────────────────────────────────

function isRateLimitError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('429') ||
    message.toLowerCase().includes('rate limit') ||
    message.toLowerCase().includes('quota exceeded') ||
    message.toLowerCase().includes('resource_exhausted');
}

// ── Main worker ───────────────────────────────────────────────────────

export async function runTranscriptionWorker(): Promise<WorkerResult> {
  const supabase = await createSupabaseServerClient();
  const now = new Date();

  const result: WorkerResult = {
    processed: 0,
    completed: 0,
    skipped: 0,
    rateLimited: 0,
    failed: 0,
    budgetUsed: 0,
    budgetRemaining: 0,
    errors: [],
  };

  // 1. Check daily budget
  const todayCount = await getDailyTranscriptionsCount(supabase);
  const budgetRemaining = Math.max(0, DAILY_BUDGET - todayCount);
  result.budgetUsed = todayCount;
  result.budgetRemaining = budgetRemaining;

  if (budgetRemaining === 0) {
    console.log(`[transcription worker] daily budget exhausted (${todayCount}/${DAILY_BUDGET}). Skipping.`);
    return result;
  }

  const toProcess = Math.min(BATCH_SIZE, budgetRemaining);
  console.log(`[transcription worker] budget ${todayCount}/${DAILY_BUDGET}, processing up to ${toProcess} jobs`);

  // 2. Fetch eligible jobs
  // Eligible = pending + retry_after e null sau a expirat
  const { data: jobs, error: fetchError } = await supabase
    .from('transcription_jobs')
    .select('id, post_id, account_id, status, attempts, video_url, media_type')
    .or(`status.eq.pending,and(status.eq.failed,attempts.lt.${MAX_ATTEMPTS})`)
    .or(`retry_after.is.null,retry_after.lte.${now.toISOString()}`)
    .order('created_at', { ascending: true })
    .limit(toProcess);

  if (fetchError || !jobs || jobs.length === 0) {
    console.log('[transcription worker] no eligible jobs');
    return result;
  }

  console.log(`[transcription worker] found ${jobs.length} eligible jobs`);

  // 3. Process each job
  for (const job of jobs) {
    result.processed++;

    // Mark as processing
    await supabase
      .from('transcription_jobs')
      .update({
        status: 'processing',
        started_at: now.toISOString(),
        attempts: job.attempts + 1,
        retry_after: null,
        last_error_code: null,
      })
      .eq('id', job.id);

    try {
      // Check if already transcribed (skip)
      const { data: post } = await supabase
        .from('posts')
        .select('media_url, transcript')
        .eq('id', job.post_id)
        .single();

      if (post?.transcript) {
        await supabase
          .from('transcription_jobs')
          .update({ status: 'skipped', completed_at: now.toISOString() })
          .eq('id', job.id);
        result.skipped++;
        result.budgetRemaining++;  // didn't use budget
        continue;
      }

      const videoUrl = job.video_url || post?.media_url;
      if (!videoUrl) {
        throw new Error('No video URL — expired');
      }

      // Transcribe
      const transcription = await transcribeVideo(videoUrl);

      // Save to post
      await supabase
        .from('posts')
        .update({
          transcript: transcription.transcript,
          transcript_segments: transcription.segments,
          visual_description: transcription.visualDescription,
          transcript_language: transcription.language,
          transcript_model: transcription.model,
          transcript_at: now.toISOString(),
        })
        .eq('id', job.post_id);

      // Mark completed
      await supabase
        .from('transcription_jobs')
        .update({
          status: 'completed',
          completed_at: now.toISOString(),
          last_error_code: null,
        })
        .eq('id', job.id);

      result.completed++;
      console.log(`[transcription worker] ✓ completed job ${job.id}`);

    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const isRateLimit = isRateLimitError(err);

      result.errors.push(`${job.id}: ${message.slice(0, 100)}`);

      if (isRateLimit) {
        // 429: reschedule pentru mai târziu, NU marchăm failed
        result.rateLimited++;

        const retryAfter = new Date(now.getTime() + RETRY_DELAY_MINUTES * 60 * 1000);
        await supabase
          .from('transcription_jobs')
          .update({
            status: 'pending',            // back to pending, not failed
            last_error_code: '429',
            retry_after: retryAfter.toISOString(),
            error_message: `Rate limited at ${now.toISOString()}. Retry after ${retryAfter.toISOString()}`,
          })
          .eq('id', job.id);

        console.log(`[transcription worker] ⏳ rate limited job ${job.id}, retry after ${retryAfter.toISOString()}`);

        // Stop processing more jobs — suntem rate limited
        // Nu are sens să încercăm alte job-uri acum
        break;

      } else {
        // Alt tip de eroare (URL expirat, network, etc.)
        result.failed++;
        const newAttempts = job.attempts + 1;
        const isFinal = newAttempts >= MAX_ATTEMPTS;

        await supabase
          .from('transcription_jobs')
          .update({
            status: isFinal ? 'failed' : 'pending',
            last_error_code: message.includes('expired') ? 'URL_EXPIRED' : 'ERROR',
            error_message: message,
            retry_after: isFinal ? null :
              // Retry non-rate-limit errors mai repede
              new Date(now.getTime() + 5 * 60 * 1000).toISOString(),
            completed_at: isFinal ? now.toISOString() : null,
          })
          .eq('id', job.id);

        console.error(`[transcription worker] ✗ failed job ${job.id} (attempt ${newAttempts}/${MAX_ATTEMPTS}):`, message.slice(0, 100));
      }
    }
  }

  const summary = `budget=${result.budgetUsed + result.completed}/${DAILY_BUDGET}, ` +
    `completed=${result.completed}, skipped=${result.skipped}, ` +
    `rateLimited=${result.rateLimited}, failed=${result.failed}`;
  console.log(`[transcription worker] done: ${summary}`);

  return result;
}
```

---

## Deliverable 3: Update cron schedule

Actualizează `vercel.json`:

```json
{
  "crons": [
    { "path": "/api/cron/weekly-summary", "schedule": "0 16 * * 3" },
    { "path": "/api/cron/transcribe", "schedule": "0 7 * * *" },
    { "path": "/api/cron/agent", "schedule": "0 6 * * 1,3,5" }
  ]
}
```

`0 7 * * *` = zilnic la 07:00 UTC (10:00 Romania EEST).

Motivul schimbării de la `0 * * * *` (orar) la `0 7 * * *` (zilnic):
- Cu daily budget de 20 transcrieri și BATCH_SIZE=3, un singur run zilnic procesează 3 jobs
- Dacă vrei mai multe pe zi, trigger-uiești manual din dashboard
- Evităm runs inutile când nu sunt jobs pending

---

## Deliverable 4: Update cron route — log budget

Actualizează `src/app/api/cron/transcribe/route.ts` să returneze budget info:

```ts
// Schimbă doar return statement:
return NextResponse.json({
  success: true,
  result,
  budget: {
    used: result.budgetUsed,
    remaining: result.budgetRemaining,
    daily: 20,
  },
  durationMs: duration,
});
```

---

## Verification checklist

1. `pnpm build` succeeds, zero TypeScript errors
2. **Migration aplicată:**
```sql
   SELECT column_name FROM information_schema.columns
   WHERE table_name = 'transcription_jobs'
     AND column_name IN ('retry_after', 'last_error_code');
```
3. **Budget check funcționează:** dacă ai 20 completed azi, worker-ul returnează
   `{ budgetRemaining: 0 }` fără să proceseze nimic.
4. **429 handling:** simulează un 429 (schimbă temporar API key cu unul invalid,
   sau mock în test). Job-ul trebuie să rămână `pending` cu `retry_after` setat,
   nu `failed`.
5. **Skip funcționează:** un post cu transcript existent → job marcat `skipped`,
   nu retranskris.
6. **Cron zilnic:** `vercel.json` are `0 7 * * *`.
7. **Sync neatins:** fă un re-sync al contului Meta. Funcționează normal,
   inserează jobs în coadă, nu afectează sync flow.
8. **Status check manual:**
```sql
   SELECT status, COUNT(*) as count,
     MIN(retry_after) as earliest_retry
   FROM transcription_jobs
   GROUP BY status;
```
   Joburile rate-limited apar ca `pending` cu `retry_after` în viitor.

---

## Notes pentru Claude Code

- **`break` după rate limit** e intenționat — dacă primim un 429, oprим
  procesarea joburilor rămase din batch. Nu are sens să încercăm mai mult
  când suntem deja throttled. Worker-ul va fi rechemat mâine.
- **`budgetRemaining++` la skip** — skip-urile nu consumă API calls, deci
  nu contorizăm în budget. Dar `getDailyTranscriptionsCount` numără
  doar `completed`, deci e automat corect.
- **Query cu dublu `.or()`** pentru Supabase — verifică că sintaxa
  `.or('status.eq.pending,...').or('retry_after.is.null,...')` funcționează
  cu versiunea ta de Supabase client. Alternativ, folosește raw SQL:
```ts
  .filter('status', 'in', '("pending","failed")')
  .filter('attempts', 'lt', MAX_ATTEMPTS)
  .or(`retry_after.is.null,retry_after.lte.${now.toISOString()}`)
```
- const DAILY_BUDGET = 150;   // era 20
    const BATCH_SIZE = 30;      // era 3
    const REQUEST_DELAY_MS = 7500;
  mărește la 50 sau 100 — dar asigură-te că AI key-ul nu e shared cu alte
  features care consumă din aceleași 250 RPD.
- Dacă vrei trigger manual din dashboard (buton "Procesează acum"),
  poți face un Server Action care apelează direct `runTranscriptionWorker()` —
  nu e în scope-ul acestui prompt dar e ușor de adăugat.