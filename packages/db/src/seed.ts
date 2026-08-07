/**
 * Seed the plans table from the code catalog.
 * Run with: pnpm --filter @follac/db db:seed
 * Idempotent — upserts by plan id.
 */
import "dotenv/config";
import { getDb, closeDb } from "./client.js";
import { plans } from "./schema/app.js";
import { PLAN_CATALOG, stripePriceEnvKey, type PlanId } from "./plans.js";

async function seed(): Promise<void> {
  const db = getDb();
  for (const plan of Object.values(PLAN_CATALOG)) {
    const stripePriceId =
      plan.priceMonthlyCents > 0
        ? (process.env[stripePriceEnvKey(plan.id as PlanId)] ?? null)
        : null;
    await db
      .insert(plans)
      .values({
        id: plan.id,
        name: plan.name,
        priceMonthlyCents: plan.priceMonthlyCents,
        stripePriceId,
        meetingHoursPerMonth: plan.meetingHoursPerMonth,
        features: plan.features,
        active: true,
        sortOrder: plan.sortOrder,
      })
      .onConflictDoUpdate({
        target: plans.id,
        set: {
          name: plan.name,
          priceMonthlyCents: plan.priceMonthlyCents,
          stripePriceId,
          meetingHoursPerMonth: plan.meetingHoursPerMonth,
          features: plan.features,
          sortOrder: plan.sortOrder,
        },
      });
    console.log(`Seeded plan: ${plan.id}`);
  }
  await closeDb();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
