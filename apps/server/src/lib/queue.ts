/**
 * Job producers — the server enqueues work; apps/worker consumes it.
 */
import { Queue } from "bullmq";
import { Redis } from "ioredis";
import {
  QUEUES,
  type MeetingProcessingJob,
  type ReportJob,
  type WebhookDeliveryJob,
} from "@follac/db";
import { config } from "../config.js";

let connection: Redis | null = null;
const queues = new Map<string, Queue>();

function getConnection(): Redis {
  if (!connection) {
    connection = new Redis(config.redisUrl, { maxRetriesPerRequest: null });
  }
  return connection;
}

function getQueue(name: string): Queue {
  let queue = queues.get(name);
  if (!queue) {
    queue = new Queue(name, {
      connection: getConnection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 10_000 },
        removeOnComplete: { age: 7 * 24 * 3600, count: 1000 },
        removeOnFail: { age: 30 * 24 * 3600 },
      },
    });
    queues.set(name, queue);
  }
  return queue;
}

export async function enqueueMeetingProcessing(job: MeetingProcessingJob): Promise<void> {
  await getQueue(QUEUES.meetingProcessing).add("process", job, {
    jobId: `process-${job.meetingId}`,
  });
}

export async function enqueueReport(job: ReportJob): Promise<void> {
  await getQueue(QUEUES.reports).add("send", job, { jobId: `report-${job.meetingId}` });
}

export async function enqueueWebhookDelivery(job: WebhookDeliveryJob): Promise<void> {
  await getQueue(QUEUES.webhookDelivery).add("deliver", job);
}
