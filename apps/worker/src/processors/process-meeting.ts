/**
 * The main pipeline job: recording URL → diarized transcript → insights.
 *
 * Steps:
 *  1. Transcribe the recording with speaker diarization (Deepgram)
 *  2. Persist transcript + segments
 *  3. Analyze with the meeting-intelligence agents (summary, decisions,
 *     action items, speaker names + stats)
 *  4. Persist insights + action items, record usage, mark completed
 *  5. Enqueue email reports and outbound customer webhooks
 */
import { eq } from "drizzle-orm";
import {
  getDb,
  newId,
  actionItems,
  meetings,
  transcriptSegments,
  transcripts,
  usageRecords,
  webhookEndpoints,
  type MeetingProcessingJob,
} from "@follac/db";
import { analyzeTranscript } from "@follac/meeting-intelligence";
import { transcribeRecording } from "../lib/transcribe.js";
import { enqueueReport, enqueueWebhookDelivery } from "../lib/queues.js";
import { config } from "../config.js";

export async function processMeeting(job: MeetingProcessingJob): Promise<void> {
  const db = getDb();
  const [meeting] = await db
    .select()
    .from(meetings)
    .where(eq(meetings.id, job.meetingId))
    .limit(1);
  if (!meeting) throw new Error(`Meeting ${job.meetingId} not found`);

  try {
    // 1. Transcribe
    const transcription = await transcribeRecording(job.recordingUrl);
    if (transcription.segments.length === 0) {
      throw new Error("Transcription produced no speech segments");
    }

    // 2. Persist transcript
    const transcriptId = newId("trs");
    await db.insert(transcripts).values({
      id: transcriptId,
      meetingId: meeting.id,
      provider: "deepgram",
      language: transcription.language,
      raw: transcription.raw,
    });

    // 3. Analyze
    const insights = await analyzeTranscript({
      title: meeting.title,
      segments: transcription.segments,
      participantNames: job.participantNames,
      openaiApiKey: config.openai.apiKey,
      model: config.openai.model,
    });

    // Persist segments with resolved speaker names
    await db.insert(transcriptSegments).values(
      transcription.segments.map((segment) => ({
        id: newId("seg"),
        transcriptId,
        meetingId: meeting.id,
        speakerLabel: segment.speakerLabel,
        speakerName: insights.speakerNames[segment.speakerLabel] ?? null,
        startMs: segment.startMs,
        endMs: segment.endMs,
        text: segment.text,
      })),
    );

    // 4. Persist insights + action items
    await db
      .update(meetings)
      .set({
        status: "completed",
        durationSeconds: transcription.durationSeconds,
        summary: insights.summary,
        keyPoints: insights.keyPoints,
        decisions: insights.decisions,
        speakerStats: insights.speakerStats,
        updatedAt: new Date(),
      })
      .where(eq(meetings.id, meeting.id));

    if (insights.actionItems.length > 0) {
      await db.insert(actionItems).values(
        insights.actionItems.map((item) => ({
          id: newId("act"),
          meetingId: meeting.id,
          userId: meeting.userId,
          description: item.description,
          owner: item.owner,
          dueDate: item.dueDate ? new Date(item.dueDate) : null,
        })),
      );
    }

    // Record metered usage (entitlements read this)
    await db.insert(usageRecords).values({
      id: newId("usg"),
      userId: meeting.userId,
      kind: "meeting_seconds",
      quantity: transcription.durationSeconds,
      meetingId: meeting.id,
    });

    // 5. Reports + customer webhooks
    await enqueueReport({ meetingId: meeting.id });
    await fanOutWebhooks(meeting.userId, "meeting.completed", {
      meeting_id: meeting.id,
      title: meeting.title,
      duration_seconds: transcription.durationSeconds,
      summary: insights.summary,
      action_items: insights.actionItems,
    });

    console.log(`[worker] Meeting ${meeting.id} processed (${transcription.durationSeconds}s)`);
  } catch (err) {
    await db
      .update(meetings)
      .set({ status: "failed", error: String(err), updatedAt: new Date() })
      .where(eq(meetings.id, meeting.id));
    await fanOutWebhooks(meeting.userId, "meeting.failed", {
      meeting_id: meeting.id,
      title: meeting.title,
      error: String(err),
    });
    throw err;
  }
}

async function fanOutWebhooks(
  userId: string,
  event: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const db = getDb();
  const endpoints = await db
    .select()
    .from(webhookEndpoints)
    .where(eq(webhookEndpoints.userId, userId));
  for (const endpoint of endpoints) {
    if (!endpoint.active || !endpoint.events.includes(event)) continue;
    await enqueueWebhookDelivery({ endpointId: endpoint.id, event, payload });
  }
}
