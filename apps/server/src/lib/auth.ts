/**
 * better-auth instance — email/password + Google OAuth, Drizzle-backed.
 *
 * The `bearer` plugin lets the Chrome extension authenticate with
 * `Authorization: Bearer <session-token>` instead of cookies.
 *
 * On signup we bootstrap the account: default settings row + 7-day trial
 * subscription, so every new user lands fully provisioned.
 */
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { bearer } from "better-auth/plugins";
import {
  getDb,
  newId,
  schema,
  subscriptions,
  userSettings,
  TRIAL_DAYS,
} from "@follac/db";
import { config } from "../config.js";
import { sendWelcomeEmail } from "../services/email.service.js";

export const auth = betterAuth({
  baseURL: config.apiUrl,
  basePath: "/api/auth",
  secret: config.auth.secret,
  database: drizzleAdapter(getDb(), { provider: "pg", schema }),
  trustedOrigins: [config.webUrl],
  emailAndPassword: {
    enabled: true,
  },
  socialProviders: config.auth.google.clientId
    ? {
        google: {
          clientId: config.auth.google.clientId,
          clientSecret: config.auth.google.clientSecret,
        },
      }
    : {},
  user: {
    additionalFields: {
      role: { type: "string", defaultValue: "user", input: false },
      stripeCustomerId: { type: "string", required: false, input: false },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days
    updateAge: 60 * 60 * 24,
  },
  advanced: {
    defaultCookieAttributes:
      config.nodeEnv === "production"
        ? { sameSite: "none", secure: true, partitioned: true }
        : undefined,
  },
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          const db = getDb();
          const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
          await db.insert(userSettings).values({ userId: user.id }).onConflictDoNothing();
          await db
            .insert(subscriptions)
            .values({
              id: newId("sub"),
              userId: user.id,
              planId: "trial",
              status: "trialing",
              trialEndsAt,
              currentPeriodStart: new Date(),
              currentPeriodEnd: trialEndsAt,
            })
            .onConflictDoNothing();
          // Non-blocking: signup must not fail if email delivery does
          void sendWelcomeEmail(user.email, user.name).catch((err) =>
            console.error("[auth] welcome email failed:", err),
          );
        },
      },
    },
  },
  plugins: [bearer()],
});

export type AuthSession = typeof auth.$Infer.Session;
