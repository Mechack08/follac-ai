/**
 * Inbound webhooks:
 *   POST /api/webhooks/recall  — bot lifecycle (recording ready / failed)
 *   POST /api/webhooks/stripe  — subscription lifecycle
 *
 * Both routes verify signatures over the raw body (fastify-raw-body).
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";
import { getDb, meetings } from "@follac/db";
import { config } from "../config.js";
import { meetingBotProvider } from "../services/meeting-bot.service.js";
import { constructWebhookEvent, handleStripeEvent } from "../services/stripe.service.js";
import { enqueueMeetingProcessing } from "../lib/queue.js";

/**
 * Svix signature verification (Recall delivers webhooks through Svix).
 * secret format: "whsec_<base64>"; signature header: "v1,<base64sig> ..."
 */
function verifySvix(request: FastifyRequest, rawBody: string): boolean {
  if (!config.recall.webhookSecret) return true; // dev mode — accept unsigned

  const id = request.headers["svix-id"] as string | undefined;
  const timestamp = request.headers["svix-timestamp"] as string | undefined;
  const signatures = request.headers["svix-signature"] as string | undefined;
  if (!id || !timestamp || !signatures) return false;

  const secret = config.recall.webhookSecret.replace(/^whsec_/, "");
  const expected = createHmac("sha256", Buffer.from(secret, "base64"))
    .update(`${id}.${timestamp}.${rawBody}`)
    .digest("base64");

  return signatures.split(" ").some((versioned) => {
    const [, sig] = versioned.split(",");
    if (!sig) return false;
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  });
}

interface RecallWebhookBody {
  event?: string;
  data?: {
    bot_id?: string;
    bot?: { id?: string; metadata?: { meetingId?: string } };
    status?: { code?: string };
    data?: { code?: string };
  };
}

function extractBotId(body: RecallWebhookBody): string | null {
  return body.data?.bot_id ?? body.data?.bot?.id ?? null;
}

function extractStatusCode(body: RecallWebhookBody): string {
  return body.data?.status?.code ?? body.data?.data?.code ?? body.event ?? "";
}

export async function webhooksRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post(
    "/recall",
    { config: { rawBody: true, rateLimit: false } },
    async (request, reply) => {
      const rawBody = (request.rawBody as string | undefined) ?? JSON.stringify(request.body);
      if (!verifySvix(request, rawBody)) {
        return reply.status(401).send({ error: "Invalid webhook signature" });
      }

      const body = request.body as RecallWebhookBody;
      const botId = extractBotId(body);
      if (!botId) return { received: true };

      const statusCode = extractStatusCode(body);
      const db = getDb();
      const [meeting] = await db.select().from(meetings).where(eq(meetings.botId, botId)).limit(1);
      if (!meeting) return { received: true };

      if (/in_call_recording|recording/.test(statusCode)) {
        await db
          .update(meetings)
          .set({ status: "recording", updatedAt: new Date() })
          .where(eq(meetings.id, meeting.id));
      } else if (/done|call_ended|recording\.done/.test(statusCode)) {
        try {
          const recordingUrl = await meetingBotProvider.getRecordingUrl(botId);
          if (!recordingUrl) {
            // Recording not processed yet — Recall sends another event when it is
            return { received: true, pending: true };
          }
          await db
            .update(meetings)
            .set({ status: "processing", recordingUrl, updatedAt: new Date() })
            .where(eq(meetings.id, meeting.id));
          await enqueueMeetingProcessing({ meetingId: meeting.id, recordingUrl });
        } catch (err) {
          fastify.log.error({ err: String(err), botId }, "Failed to queue meeting processing");
          await db
            .update(meetings)
            .set({ status: "failed", error: String(err), updatedAt: new Date() })
            .where(eq(meetings.id, meeting.id));
        }
      } else if (/fatal|error/.test(statusCode)) {
        await db
          .update(meetings)
          .set({ status: "failed", error: `Bot failed: ${statusCode}`, updatedAt: new Date() })
          .where(eq(meetings.id, meeting.id));
      }

      return { received: true };
    },
  );

  fastify.post(
    "/stripe",
    { config: { rawBody: true, rateLimit: false } },
    async (request, reply) => {
      const signature = request.headers["stripe-signature"] as string | undefined;
      const rawBody = request.rawBody as string | undefined;
      if (!signature || !rawBody) {
        return reply.status(400).send({ error: "Missing Stripe signature or body" });
      }
      try {
        const event = constructWebhookEvent(rawBody, signature);
        await handleStripeEvent(event);
        return { received: true };
      } catch (err) {
        fastify.log.error({ err: String(err) }, "Stripe webhook rejected");
        return reply.status(400).send({ error: "Webhook verification failed" });
      }
    },
  );
}
