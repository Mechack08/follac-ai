import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import type { ReactNode } from "react";

export const colors = {
  brand: "#FF0034",
  text: "#1f2937",
  muted: "#6b7280",
  border: "#e5e7eb",
  bg: "#f9fafb",
} as const;

export function EmailLayout({
  preview,
  children,
}: {
  preview: string;
  children: ReactNode;
}) {
  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={{ backgroundColor: colors.bg, fontFamily: "'Segoe UI', Helvetica, Arial, sans-serif", margin: 0 }}>
        <Container style={{ maxWidth: "600px", margin: "0 auto", padding: "24px 16px" }}>
          <Section style={{ marginBottom: "16px" }}>
            <Text style={{ fontSize: "20px", fontWeight: 700, color: colors.brand, margin: 0 }}>
              Follac
            </Text>
          </Section>
          <Section
            style={{
              backgroundColor: "#ffffff",
              borderRadius: "12px",
              border: `1px solid ${colors.border}`,
              padding: "28px",
            }}
          >
            {children}
          </Section>
          <Hr style={{ borderColor: colors.border, margin: "24px 0 12px" }} />
          <Text style={{ fontSize: "12px", color: colors.muted, margin: 0 }}>
            Sent by Follac, your work assistant.{" "}
            <Link href="https://follac.ai" style={{ color: colors.muted }}>
              follac.ai
            </Link>
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <Text
      style={{
        fontSize: "13px",
        fontWeight: 700,
        letterSpacing: "0.05em",
        textTransform: "uppercase" as const,
        color: colors.muted,
        margin: "24px 0 8px",
      }}
    >
      {children}
    </Text>
  );
}
