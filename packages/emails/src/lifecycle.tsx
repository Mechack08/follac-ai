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
    <EmailLayout preview="Welcome to Follac. Your work assistant is ready.">
      <Heading as="h1" style={{ fontSize: "22px", color: colors.text, margin: "0 0 16px" }}>
        Welcome, {name}
      </Heading>
      <Text style={paragraph}>
        Your 7-day free trial has started. Here is the quickest way to see value:
      </Text>
      <Text style={paragraph}>
        1. Connect your Google Calendar so Follac can join upcoming meetings.
        <br />
        2. Install the Chrome extension for help in Gmail, Docs, and LinkedIn.
        <br />
        3. After your next call, open the report in your inbox or dashboard.
      </Text>
      <Button href={dashboardUrl} style={cta}>
        Open your workspace
      </Button>
    </EmailLayout>
  );
}

export function TrialEndingEmail({ name, upgradeUrl }: { name: string; upgradeUrl: string }) {
  return (
    <EmailLayout preview="Your Follac trial ends tomorrow">
      <Heading as="h1" style={{ fontSize: "22px", color: colors.text, margin: "0 0 16px" }}>
        Your trial ends tomorrow
      </Heading>
      <Text style={paragraph}>
        Hi {name}, your 7-day Follac trial ends in 24 hours. Pick a plan to keep meetings,
        reports, and in-page assist running without interruption.
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
        Hi {name}, your latest Follac payment failed. Please update your payment method to keep
        your subscription active. We will retry automatically over the next few days.
      </Text>
      <Button href={billingUrl} style={cta}>
        Update payment method
      </Button>
    </EmailLayout>
  );
}
