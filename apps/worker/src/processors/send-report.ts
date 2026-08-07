/**
 * Report job — renders the full and/or summary email (per user preferences)
 * and sends via Resend, recording each delivery in the reports table.
 */
import { asc, eq } from "drizzle-orm";
import { Resend } from "resend";
import {
  getDb,
  newId,
  actionItems,
  meetings,
  reports,
  transcriptSegments,
  usageRecords,
  user as userTable,
  userSettings,
  webhookEndpoints,
  type ReportJob,
} from "@follac/db";
import { renderMeetingReport, type MeetingReportData } from "@follac/emails";
import { enqueueWebhookDelivery } from "../lib/queues.js";
import { config } from "../config.js";

function msToClock(ms: number): string {
  const total = Math.floor(ms / 1000);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export async function sendReport(job: ReportJob): Promise<void> {
  const db = getDb();

  const [meeting] = await db.select().from(meetings).where(eq(meetings.id, job.meetingId)).limit(1);
  if (!meeting) throw new Error(`Meeting ${job.meetingId} not found`);

  const [owner] = await db.select().from(userTable).where(eq(userTable.id, meeting.userId)).limit(1);
  if (!owner) throw new Error(`User ${meeting.userId} not found`);

  const [settings] = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, meeting.userId))
    .limit(1);
  const sendSummary = settings?.sendSummaryReport ?? true;
  const sendFull = settings?.sendFullReport ?? true;
  if (!sendSummary && !sendFull) return;

  const [segments, items] = await Promise.all([
    db
      .select()
      .from(transcriptSegments)
      .where(eq(transcriptSegments.meetingId, meeting.id))
      .orderBy(asc(transcriptSegments.startMs)),
    db.select().from(actionItems).where(eq(actionItems.meetingId, meeting.id)),
  ]);

  const durationMinutes = Math.round((meeting.durationSeconds ?? 0) / 60);
  const data: MeetingReportData = {
    meetingTitle: meeting.title,
    meetingDate: (meeting.startsAt ?? meeting.createdAt).toLocaleString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }),
    durationLabel: `${durationMinutes} min`,
    summary: meeting.summary ?? "",
    keyPoints: meeting.keyPoints ?? [],
    decisions: meeting.decisions ?? [],
    actionItems: items.map((item) => ({
      description: item.description,
      owner: item.owner,
      dueDate: item.dueDate ? item.dueDate.toLocaleDateString() : null,
    })),
    speakerStats: meeting.speakerStats ?? [],
    transcript: segments.map((segment) => ({
      speaker: segment.speakerName ?? segment.speakerLabel,
      timestamp: msToClock(segment.startMs),
      text: segment.text,
    })),
    meetingLink: `${config.webUrl}/dashboard/meetings/${meeting.id}`,
  };

  const resend = config.email.resendApiKey ? new Resend(config.email.resendApiKey) : null;
  const toSend: Array<{ type: "summary" | "full"; subject: string }> = [];
  if (sendSummary) toSend.push({ type: "summary", subject: `Summary: ${meeting.title}` });
  if (sendFull) toSend.push({ type: "full", subject: `Full report: ${meeting.title}` });

  for (const { type, subject } of toSend) {
    const reportId = newId("rpt");
    try {
      const html = await renderMeetingReport(data, type);
      let providerMessageId: string | null = null;
      if (resend) {
        const { data: sent, error } = await resend.emails.send({
          from: config.email.from,
          to: owner.email,
          subject,
          html,
        });
        if (error) throw new Error(error.message);
        providerMessageId = sent?.id ?? null;
      } else {
        console.warn(`[worker] RESEND_API_KEY not set — skipping "${subject}"`);
      }
      await db.insert(reports).values({
        id: reportId,
        meetingId: meeting.id,
        userId: meeting.userId,
        type,
        subject,
        sentTo: owner.email,
        status: resend ? "sent" : "pending",
        providerMessageId,
        sentAt: resend ? new Date() : null,
      });
      await db.insert(usageRecords).values({
        id: newId("usg"),
        userId: meeting.userId,
        kind: "report_sent",
        quantity: 1,
        meetingId: meeting.id,
      });
    } catch (err) {
      await db.insert(reports).values({
        id: reportId,
        meetingId: meeting.id,
        userId: meeting.userId,
        type,
        subject,
        sentTo: owner.email,
        status: "failed",
        error: String(err),
      });
      throw err;
    }
  }

  // Notify customer webhook subscribers that reports are ready
  const endpoints = await db
    .select()
    .from(webhookEndpoints)
    .where(eq(webhookEndpoints.userId, meeting.userId));
  for (const endpoint of endpoints) {
    if (!endpoint.active || !endpoint.events.includes("report.ready")) continue;
    await enqueueWebhookDelivery({
      endpointId: endpoint.id,
      event: "report.ready",
      payload: { meeting_id: meeting.id, title: meeting.title },
    });
  }
}
