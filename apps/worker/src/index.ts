/**
 * Follac AI — Worker entry point.
 *
 * Consumes three queues:
 *  - meeting-processing: transcription + analysis (heavy, concurrency 2)
 *  - reports:            render + send email reports
 *  - webhook-delivery:   signed deliveries to customer endpoints
 */
import "dotenv/config";
import { Worker } from "bullmq";
import {
  QUEUES,
  closeDb,
  type MeetingProcessingJob,
  type ReportJob,
  type WebhookDeliveryJob,
} from "@follac/db";
import { getConnection } from "./lib/queues.js";
import { processMeeting } from "./processors/process-meeting.js";
import { sendReport } from "./processors/send-report.js";
import { deliverWebhook } from "./processors/deliver-webhook.js";

const connection = getConnection();

const workers = [
  new Worker<MeetingProcessingJob>(
    QUEUES.meetingProcessing,
    async (job) => processMeeting(job.data),
    { connection, concurrency: 2 },
  ),
  new Worker<ReportJob>(QUEUES.reports, async (job) => sendReport(job.data), {
    connection,
    concurrency: 5,
  }),
  new Worker<WebhookDeliveryJob>(
    QUEUES.webhookDelivery,
    async (job) => deliverWebhook(job.data),
    { connection, concurrency: 10 },
  ),
];

for (const worker of workers) {
  worker.on("completed", (job) => {
    console.log(`[worker] ${worker.name}:${job.id} completed`);
  });
  worker.on("failed", (job, err) => {
    console.error(`[worker] ${worker.name}:${job?.id} failed:`, err.message);
  });
}

console.log(
  `[Follac Worker] Consuming queues: ${workers.map((worker) => worker.name).join(", ")}`,
);

async function shutdown(): Promise<void> {
  console.log("[Follac Worker] Shutting down…");
  await Promise.all(workers.map((worker) => worker.close()));
  await connection.quit();
  await closeDb();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
