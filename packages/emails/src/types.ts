/** Data contract for meeting report emails - the worker maps DB rows to this. */

export interface SpeakerStat {
  speaker: string;
  talkTimeSeconds: number;
  talkTimePercent: number;
  keyPoints: string[];
}

export interface ReportActionItem {
  description: string;
  owner: string | null;
  dueDate: string | null;
}

export interface TranscriptLine {
  speaker: string;
  timestamp: string;
  text: string;
}

export interface MeetingReportData {
  meetingTitle: string;
  meetingDate: string;
  durationLabel: string;
  summary: string;
  keyPoints: string[];
  decisions: string[];
  actionItems: ReportActionItem[];
  speakerStats: SpeakerStat[];
  /** Full transcript - only included in the full report */
  transcript: TranscriptLine[];
  /** Deep link into the dashboard */
  meetingLink: string;
}
