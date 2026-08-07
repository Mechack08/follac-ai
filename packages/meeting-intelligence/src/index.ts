/**
 * Meeting intelligence — turns a diarized transcript into insights:
 * summary, key points, decisions, action items with owners, speaker
 * name resolution, and per-speaker key points.
 *
 * Talk-time stats are computed deterministically from segment timings;
 * only the language understanding goes through the LLM.
 */
import OpenAI from "openai";

export interface TranscriptSegmentInput {
  speakerLabel: string;
  startMs: number;
  endMs: number;
  text: string;
}

export interface MeetingInsights {
  summary: string;
  keyPoints: string[];
  decisions: string[];
  actionItems: Array<{ description: string; owner: string | null; dueDate: string | null }>;
  /** Diarization label → resolved human name (when inferable from the conversation) */
  speakerNames: Record<string, string>;
  speakerStats: Array<{
    speaker: string;
    talkTimeSeconds: number;
    talkTimePercent: number;
    keyPoints: string[];
  }>;
}

export interface AnalyzeInput {
  title: string;
  segments: TranscriptSegmentInput[];
  /** Names of known participants (from the calendar event), helps name resolution */
  participantNames?: string[];
  openaiApiKey: string;
  model?: string;
}

/** Cap the transcript we send to the model (~100k chars ≈ 25k tokens) */
const MAX_TRANSCRIPT_CHARS = 100_000;

function formatTranscript(segments: TranscriptSegmentInput[]): string {
  let out = "";
  for (const segment of segments) {
    const line = `[${segment.speakerLabel}] ${segment.text}\n`;
    if (out.length + line.length > MAX_TRANSCRIPT_CHARS) break;
    out += line;
  }
  return out;
}

function computeTalkTime(segments: TranscriptSegmentInput[]): Map<string, number> {
  const bySpeaker = new Map<string, number>();
  for (const segment of segments) {
    const seconds = Math.max(0, (segment.endMs - segment.startMs) / 1000);
    bySpeaker.set(segment.speakerLabel, (bySpeaker.get(segment.speakerLabel) ?? 0) + seconds);
  }
  return bySpeaker;
}

interface LlmAnalysis {
  summary: string;
  key_points: string[];
  decisions: string[];
  action_items: Array<{ description: string; owner: string | null; due_date: string | null }>;
  speaker_names: Record<string, string>;
  speaker_key_points: Record<string, string[]>;
}

const SYSTEM_PROMPT = `You are an expert meeting analyst. You read diarized meeting transcripts and produce precise, factual analysis. Never invent content that is not supported by the transcript. Respond with strict JSON matching this schema:
{
  "summary": "3-6 sentence executive summary of what the meeting was about and what happened",
  "key_points": ["the most important discussion points, max 8"],
  "decisions": ["explicit decisions that were made, empty array if none"],
  "action_items": [{"description": "what must be done", "owner": "person name or null", "due_date": "ISO date or null"}],
  "speaker_names": {"Speaker 0": "Alice", "Speaker 1": "Bob"},
  "speaker_key_points": {"Speaker 0": ["main points this person made, max 3"]}
}
For speaker_names: infer real names only when participants address each other by name or introduce themselves; otherwise keep the original label. Use participant names from the context when they clearly match.`;

export async function analyzeTranscript(input: AnalyzeInput): Promise<MeetingInsights> {
  const openai = new OpenAI({ apiKey: input.openaiApiKey });
  const transcript = formatTranscript(input.segments);

  const userContent =
    `Meeting title: ${input.title}\n` +
    (input.participantNames?.length
      ? `Known participants: ${input.participantNames.join(", ")}\n`
      : "") +
    `\nTranscript:\n${transcript}`;

  const completion = await openai.chat.completions.create({
    model: input.model ?? "gpt-4o-mini",
    temperature: 0.2,
    max_tokens: 2048,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userContent },
    ],
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";
  let parsed: Partial<LlmAnalysis>;
  try {
    parsed = JSON.parse(raw) as Partial<LlmAnalysis>;
  } catch {
    throw new Error("Meeting analysis returned invalid JSON");
  }

  const speakerNames = parsed.speaker_names ?? {};
  const talkTime = computeTalkTime(input.segments);
  const totalSeconds = [...talkTime.values()].reduce((a, b) => a + b, 0) || 1;

  const speakerStats = [...talkTime.entries()]
    .map(([label, seconds]) => ({
      speaker: speakerNames[label] ?? label,
      talkTimeSeconds: Math.round(seconds),
      talkTimePercent: Math.round((seconds / totalSeconds) * 100),
      keyPoints: parsed.speaker_key_points?.[label] ?? [],
    }))
    .sort((a, b) => b.talkTimeSeconds - a.talkTimeSeconds);

  return {
    summary: parsed.summary ?? "No summary could be generated.",
    keyPoints: parsed.key_points ?? [],
    decisions: parsed.decisions ?? [],
    actionItems: (parsed.action_items ?? []).map((item) => ({
      description: item.description,
      owner: item.owner ?? null,
      dueDate: item.due_date ?? null,
    })),
    speakerNames,
    speakerStats,
  };
}
