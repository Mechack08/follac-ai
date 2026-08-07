/**
 * Lifecycle emails sent directly from the API server (welcome, trial
 * ending, payment failed). Meeting reports are sent by the worker.
 */
import { Resend } from "resend";
import { renderPaymentFailed, renderTrialEnding, renderWelcome } from "@follac/emails";
import { config } from "../config.js";

let _resend: Resend | null = null;

function getResend(): Resend | null {
  if (!config.email.resendApiKey) return null;
  if (!_resend) _resend = new Resend(config.email.resendApiKey);
  return _resend;
}

async function send(to: string, subject: string, html: string): Promise<void> {
  const resend = getResend();
  if (!resend) {
    console.warn(`[email] RESEND_API_KEY not set. Skipping "${subject}" to ${to}`);
    return;
  }
  await resend.emails.send({ from: config.email.from, to, subject, html });
}

export async function sendWelcomeEmail(to: string, name: string): Promise<void> {
  const html = await renderWelcome(name, `${config.webUrl}/dashboard/settings`);
  await send(to, "Welcome to Follac. let's set up your first meeting", html);
}

export async function sendTrialEndingEmail(to: string, name: string): Promise<void> {
  const html = await renderTrialEnding(name, `${config.webUrl}/dashboard/billing`);
  await send(to, "Your Follac AI trial ends tomorrow", html);
}

export async function sendPaymentFailedEmail(to: string, name: string): Promise<void> {
  const html = await renderPaymentFailed(name, `${config.webUrl}/dashboard/billing`);
  await send(to, "Action needed: your Follac AI payment failed", html);
}
