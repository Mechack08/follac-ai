/**
 * Admin API — powers the /admin panel in the web app. Role-gated.
 *
 * GET   /api/admin/metrics          — users, subscriptions, revenue, pipeline
 * GET   /api/admin/users            — searchable user list with plan info
 * PATCH /api/admin/users/:id        — change role / override plan
 * GET   /api/admin/failures         — recently failed meetings
 * GET   /api/admin/audit-logs       — recent audit trail
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, desc, eq, gte, ilike, inArray, or, sql } from "drizzle-orm";
import {
  getDb,
  newId,
  PLAN_CATALOG,
  auditLogs,
  meetings,
  subscriptions,
  user as userTable,
} from "@follac/db";
import { requireAdmin } from "../lib/session.js";

const UpdateUserBody = z.object({
  role: z.enum(["user", "admin"]).optional(),
  planOverride: z.enum(["trial", "starter", "pro", "business"]).optional(),
});

export async function adminRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook("preHandler", requireAdmin);

  fastify.get("/metrics", async () => {
    const db = getDb();
    const monthAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000);

    const [users] = await db
      .select({
        total: sql<number>`count(*)`.mapWith(Number),
        newThisMonth: sql<number>`count(*) filter (where ${userTable.createdAt} >= ${monthAgo})`.mapWith(Number),
      })
      .from(userTable);

    const subsByPlan = await db
      .select({
        planId: subscriptions.planId,
        status: subscriptions.status,
        count: sql<number>`count(*)`.mapWith(Number),
      })
      .from(subscriptions)
      .where(inArray(subscriptions.status, ["trialing", "active", "past_due"]))
      .groupBy(subscriptions.planId, subscriptions.status);

    // MRR estimate from active paid subscriptions
    let mrrCents = 0;
    for (const row of subsByPlan) {
      if (row.status === "active" || row.status === "past_due") {
        mrrCents += (PLAN_CATALOG[row.planId as keyof typeof PLAN_CATALOG]?.priceMonthlyCents ?? 0) * row.count;
      }
    }

    const meetingsByStatus = await db
      .select({
        status: meetings.status,
        count: sql<number>`count(*)`.mapWith(Number),
      })
      .from(meetings)
      .where(gte(meetings.createdAt, monthAgo))
      .groupBy(meetings.status);

    const [durations] = await db
      .select({
        totalSeconds: sql<number>`coalesce(sum(${meetings.durationSeconds}), 0)`.mapWith(Number),
      })
      .from(meetings)
      .where(and(gte(meetings.createdAt, monthAgo), eq(meetings.status, "completed")));

    return {
      users,
      subscriptions: subsByPlan,
      mrrCents,
      meetingsLast30Days: meetingsByStatus,
      recordedHoursLast30Days: Math.round(((durations?.totalSeconds ?? 0) / 3600) * 10) / 10,
    };
  });

  fastify.get("/users", async (request) => {
    const { query } = request.query as { query?: string };
    const db = getDb();

    const baseQuery = db
      .select({
        id: userTable.id,
        name: userTable.name,
        email: userTable.email,
        role: userTable.role,
        createdAt: userTable.createdAt,
        planId: subscriptions.planId,
        subStatus: subscriptions.status,
        trialEndsAt: subscriptions.trialEndsAt,
      })
      .from(userTable)
      .leftJoin(
        subscriptions,
        and(
          eq(subscriptions.userId, userTable.id),
          inArray(subscriptions.status, ["trialing", "active", "past_due"]),
        ),
      )
      .orderBy(desc(userTable.createdAt))
      .limit(100);

    const rows = query
      ? await baseQuery.where(
          or(ilike(userTable.email, `%${query}%`), ilike(userTable.name, `%${query}%`)),
        )
      : await baseQuery;

    return { users: rows };
  });

  fastify.patch("/users/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = UpdateUserBody.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: "Invalid payload" });

    const db = getDb();
    const [target] = await db.select().from(userTable).where(eq(userTable.id, id)).limit(1);
    if (!target) return reply.status(404).send({ error: "User not found" });

    if (body.data.role) {
      await db.update(userTable).set({ role: body.data.role, updatedAt: new Date() }).where(eq(userTable.id, id));
    }

    if (body.data.planOverride) {
      // Retire existing access-granting subscriptions, then grant the override
      await db
        .update(subscriptions)
        .set({ status: "canceled", updatedAt: new Date() })
        .where(
          and(
            eq(subscriptions.userId, id),
            inArray(subscriptions.status, ["trialing", "active", "past_due"]),
          ),
        );
      const periodEnd = new Date(Date.now() + 30 * 24 * 3600 * 1000);
      await db.insert(subscriptions).values({
        id: newId("sub"),
        userId: id,
        planId: body.data.planOverride,
        status: body.data.planOverride === "trial" ? "trialing" : "active",
        trialEndsAt: body.data.planOverride === "trial" ? periodEnd : null,
        currentPeriodStart: new Date(),
        currentPeriodEnd: periodEnd,
      });
    }

    await db.insert(auditLogs).values({
      id: newId("log"),
      actorId: request.sessionUser!.id,
      action: "admin.user_updated",
      targetType: "user",
      targetId: id,
      meta: body.data,
    });

    return { status: "updated" };
  });

  fastify.get("/failures", async () => {
    const db = getDb();
    const failures = await db
      .select({
        id: meetings.id,
        title: meetings.title,
        userId: meetings.userId,
        userEmail: userTable.email,
        platform: meetings.platform,
        error: meetings.error,
        updatedAt: meetings.updatedAt,
      })
      .from(meetings)
      .innerJoin(userTable, eq(userTable.id, meetings.userId))
      .where(eq(meetings.status, "failed"))
      .orderBy(desc(meetings.updatedAt))
      .limit(50);
    return { failures };
  });

  fastify.get("/audit-logs", async () => {
    const db = getDb();
    const logs = await db
      .select()
      .from(auditLogs)
      .orderBy(desc(auditLogs.createdAt))
      .limit(100);
    return { logs };
  });
}
