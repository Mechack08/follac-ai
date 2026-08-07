import { Button, Heading, Hr, Section, Text } from "@react-email/components";
import { EmailLayout, SectionTitle, colors } from "./layout.js";
import type { MeetingReportData } from "./types.js";

const bullet = { fontSize: "14px", color: colors.text, margin: "0 0 6px", lineHeight: "1.5" };

function ReportBody({ data, full }: { data: MeetingReportData; full: boolean }) {
  return (
    <>
      <Heading as="h1" style={{ fontSize: "22px", color: colors.text, margin: "0 0 4px" }}>
        {data.meetingTitle}
      </Heading>
      <Text style={{ fontSize: "14px", color: colors.muted, margin: "0 0 16px" }}>
        {data.meetingDate} · {data.durationLabel}
      </Text>

      <SectionTitle>Summary</SectionTitle>
      <Text style={{ fontSize: "14px", color: colors.text, lineHeight: "1.6", margin: 0 }}>
        {data.summary}
      </Text>

      {data.keyPoints.length > 0 && (
        <>
          <SectionTitle>Key points</SectionTitle>
          {data.keyPoints.map((point, i) => (
            <Text key={i} style={bullet}>
              • {point}
            </Text>
          ))}
        </>
      )}

      {data.decisions.length > 0 && (
        <>
          <SectionTitle>Decisions</SectionTitle>
          {data.decisions.map((decision, i) => (
            <Text key={i} style={bullet}>
              ✓ {decision}
            </Text>
          ))}
        </>
      )}

      {data.actionItems.length > 0 && (
        <>
          <SectionTitle>Action items</SectionTitle>
          {data.actionItems.map((item, i) => (
            <Text key={i} style={bullet}>
              → {item.description}
              {item.owner ? ` — ${item.owner}` : ""}
              {item.dueDate ? ` (due ${item.dueDate})` : ""}
            </Text>
          ))}
        </>
      )}

      {full && data.speakerStats.length > 0 && (
        <>
          <SectionTitle>Who said what</SectionTitle>
          {data.speakerStats.map((stat, i) => (
            <Section key={i} style={{ marginBottom: "12px" }}>
              <Text style={{ fontSize: "14px", fontWeight: 600, color: colors.text, margin: "0 0 4px" }}>
                {stat.speaker}{" "}
                <span style={{ color: colors.muted, fontWeight: 400 }}>
                  ({stat.talkTimePercent}% of talk time)
                </span>
              </Text>
              {stat.keyPoints.map((point, j) => (
                <Text key={j} style={{ ...bullet, marginLeft: "12px" }}>
                  • {point}
                </Text>
              ))}
            </Section>
          ))}
        </>
      )}

      {full && data.transcript.length > 0 && (
        <>
          <Hr style={{ borderColor: colors.border, margin: "20px 0" }} />
          <SectionTitle>Full transcript</SectionTitle>
          {data.transcript.map((line, i) => (
            <Text key={i} style={{ fontSize: "13px", color: colors.text, margin: "0 0 8px", lineHeight: "1.5" }}>
              <span style={{ color: colors.muted }}>[{line.timestamp}]</span>{" "}
              <strong>{line.speaker}:</strong> {line.text}
            </Text>
          ))}
        </>
      )}

      <Section style={{ marginTop: "24px" }}>
        <Button
          href={data.meetingLink}
          style={{
            backgroundColor: colors.brand,
            color: "#ffffff",
            padding: "10px 20px",
            borderRadius: "8px",
            fontSize: "14px",
            fontWeight: 600,
          }}
        >
          Open in Follac
        </Button>
      </Section>
    </>
  );
}

export function MeetingReportFullEmail({ data }: { data: MeetingReportData }) {
  return (
    <EmailLayout preview={`Full report: ${data.meetingTitle}`}>
      <ReportBody data={data} full />
    </EmailLayout>
  );
}

export function MeetingReportSummaryEmail({ data }: { data: MeetingReportData }) {
  return (
    <EmailLayout preview={`Summary: ${data.meetingTitle}`}>
      <ReportBody data={data} full={false} />
    </EmailLayout>
  );
}
