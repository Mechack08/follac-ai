import { render } from "@react-email/render";
import { MeetingReportFullEmail, MeetingReportSummaryEmail } from "./meeting-report.js";
import { PaymentFailedEmail, TrialEndingEmail, WelcomeEmail } from "./lifecycle.js";
import type { MeetingReportData } from "./types.js";

export type { MeetingReportData, ReportActionItem, SpeakerStat, TranscriptLine } from "./types.js";

export async function renderMeetingReport(
  data: MeetingReportData,
  type: "full" | "summary",
): Promise<string> {
  return render(
    type === "full" ? MeetingReportFullEmail({ data }) : MeetingReportSummaryEmail({ data }),
  );
}

export async function renderWelcome(name: string, dashboardUrl: string): Promise<string> {
  return render(WelcomeEmail({ name, dashboardUrl }));
}

export async function renderTrialEnding(name: string, upgradeUrl: string): Promise<string> {
  return render(TrialEndingEmail({ name, upgradeUrl }));
}

export async function renderPaymentFailed(name: string, billingUrl: string): Promise<string> {
  return render(PaymentFailedEmail({ name, billingUrl }));
}
