import type { SupabaseClient } from "@supabase/supabase-js";
import { HttpError } from "./server-auth.ts";
import { processBrainDumpTranscript } from "./agent/brain-dump.ts";

export async function enqueueJob(
  db: SupabaseClient,
  userId: string,
  input: {
    job_type: "bank_intake" | "brain_dump" | "transcription";
    idempotency_key: string;
    recording_id?: string | null;
  },
) {
  const { data: existing } = await db
    .from("background_jobs")
    .select("id,status")
    .eq("user_id", userId)
    .eq("idempotency_key", input.idempotency_key)
    .maybeSingle();
  if (existing) return existing;
  const { data, error } = await db
    .from("background_jobs")
    .insert({
      user_id: userId,
      job_type: input.job_type,
      status: "queued",
      idempotency_key: input.idempotency_key,
      recording_id: input.recording_id ?? null,
    })
    .select("id,status")
    .single();
  if (error || !data) throw new HttpError(503, "הכנסת העבודה לתור נכשלה.");
  return data;
}

export async function getJob(
  db: SupabaseClient,
  userId: string,
  jobId: string,
) {
  const { data, error } = await db
    .from("background_jobs")
    .select("id,status,job_type,error_code,recording_id,updated_at")
    .eq("user_id", userId)
    .eq("id", jobId)
    .maybeSingle();
  if (error) throw new HttpError(503, "טעינת העבודה נכשלה.");
  if (!data) throw new HttpError(404, "העבודה לא נמצאה.");
  return data;
}

export async function processQueuedJobs(admin: SupabaseClient, limit = 10) {
  const { data: jobs } = await admin
    .from("background_jobs")
    .select("id,user_id,job_type,recording_id,attempts")
    .eq("status", "queued")
    .limit(limit);
  const summary = { processed: 0, failed: 0 };
  for (const job of jobs ?? []) {
    await admin
      .from("background_jobs")
      .update({
        status: "processing",
        attempts: (job.attempts ?? 0) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id);
    try {
      if (job.job_type === "brain_dump" || job.job_type === "bank_intake") {
        if (!job.recording_id) throw new Error("missing_recording");
        const { data: recording } = await admin
          .from("recordings")
          .select("transcript")
          .eq("id", job.recording_id)
          .eq("user_id", job.user_id)
          .maybeSingle();
        const transcript = recording?.transcript?.trim();
        if (!transcript) throw new Error("missing_transcript");
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) throw new Error("openai_unconfigured");
        await processBrainDumpTranscript({
          db: admin,
          userId: job.user_id,
          recordingId: job.recording_id,
          transcript,
          apiKey,
        });
      }
      await admin
        .from("background_jobs")
        .update({ status: "complete", updated_at: new Date().toISOString() })
        .eq("id", job.id);
      summary.processed += 1;
    } catch {
      await admin
        .from("background_jobs")
        .update({
          status: "failed",
          error_code: "job_failed",
          updated_at: new Date().toISOString(),
        })
        .eq("id", job.id);
      summary.failed += 1;
    }
  }
  return summary;
}
