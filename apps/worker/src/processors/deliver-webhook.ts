/**
 * Outbound webhook delivery — HMAC-SHA256 signed POST to the customer's
 * endpoint. BullMQ retries with backoff on non-2xx responses.
 */
import { createHmac } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb, webhookEndpoints, type WebhookDeliveryJob } from "@follac/db";

export async function deliverWebhook(job: WebhookDeliveryJob): Promise<void> {
  const db = getDb();
  const [endpoint] = await db
    .select()
    .from(webhookEndpoints)
    .where(eq(webhookEndpoints.id, job.endpointId))
    .limit(1);
  if (!endpoint || !endpoint.active) return;

  const body = JSON.stringify({
    event: job.event,
    created_at: new Date().toISOString(),
    data: job.payload,
  });
  const signature = createHmac("sha256", endpoint.secret).update(body).digest("hex");

  const response = await fetch(endpoint.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-follac-event": job.event,
      "x-follac-signature": `sha256=${signature}`,
    },
    body,
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(`Webhook delivery to ${endpoint.url} failed with ${response.status}`);
  }
}
