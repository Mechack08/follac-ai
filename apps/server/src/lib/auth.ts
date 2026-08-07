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
  /**
   * Web (:3000) and API (:3001) are different origins. OAuth still needs the
   * state cookie on the API host after a cross-origin sign-in fetch.
   */
  account: {
    storeStateStrategy: "database",
    // Cookie may still be blocked cross-port in some browsers; DB holds the real state.
    skipStateCookieCheck: true,
    accountLinking: {
      enabled: true,
      // Allow Google to attach to an existing email/password user with the same email
      trustedProviders: ["google"],
      // Email/password signups don't verify email in local/dev; don't block Google linking
      requireLocalEmailVerified: false,
    },
  },
  advanced: {
    defaultCookieAttributes: {
      sameSite: "none",
      secure: true,
      // Chrome allows Secure cookies on http://localhost
      ...(config.nodeEnv === "production" ? { partitioned: true } : {}),
    },
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
