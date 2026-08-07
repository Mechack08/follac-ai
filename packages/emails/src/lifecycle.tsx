import { Button, Heading, Text } from "@react-email/components";
import { EmailLayout, colors } from "./layout.js";

const paragraph = { fontSize: "14px", color: colors.text, lineHeight: "1.6", margin: "0 0 16px" };
const cta = {
  backgroundColor: colors.brand,
  color: "#ffffff",
  padding: "10px 20px",
  borderRadius: "8px",
  fontSize: "14px",
  fontWeight: 600,
};

export function WelcomeEmail({ name, dashboardUrl }: { name: string; dashboardUrl: string }) {
  return (
    <EmailLayout preview="Welcome to Follac AI — your meeting assistant is ready">
      <Heading as="h1" style={{ fontSize: "22px", color: colors.text, margin: "0 0 16px" }}>
        Welcome, {name}
      </Heading>
      <Text style={paragraph}>
        Your 7-day free trial has started. Here is how to get your first meeting report in
        under two minutes:
      </Text>
      <Text style={paragraph}>
        1. Connect your Google Calendar — Follac will spot your upcoming meetings.
        <br />
        2. Join your next call as usual. Our notetaker joins with you.
        <br />
        3. Minutes after it ends, the summary, decisions and action items land in your inbox.
      </Text>
      <Button href={dashboardUrl} style={cta}>
        Connect your calendar
      </Button>
    </EmailLayout>
  );
}

export function TrialEndingEmail({ name, upgradeUrl }: { name: string; upgradeUrl: string }) {
  return (
    <EmailLayout preview="Your Follac AI trial ends tomorrow">
      <Heading as="h1" style={{ fontSize: "22px", color: colors.text, margin: "0 0 16px" }}>
        Your trial ends tomorrow
      </Heading>
      <Text style={paragraph}>
        Hi {name}, your 7-day Follac AI trial ends in 24 hours. Pick a plan to keep your
        meeting bot, reports, and action-item tracking running without interruption.
      </Text>
      <Button href={upgradeUrl} style={cta}>
        Choose a plan
      </Button>
    </EmailLayout>
  );
}

export function PaymentFailedEmail({ name, billingUrl }: { name: string; billingUrl: string }) {
  return (
    <EmailLayout preview="Action needed: payment failed">
      <Heading as="h1" style={{ fontSize: "22px", color: colors.text, margin: "0 0 16px" }}>
        We could not process your payment
      </Heading>
      <Text style={paragraph}>
        Hi {name}, your latest Follac AI payment failed. Please update your payment method to
        keep your subscription active — we will retry automatically over the next few days.
      </Text>
      <Button href={billingUrl} style={cta}>
        Update payment method
      </Button>
    </EmailLayout>
  );
}
