/**
 * Deepgram diarized transcription. Behind one function so AssemblyAI (or
 * another provider) can be swapped in without touching the processor.
 */
import { createClient } from "@deepgram/sdk";
import { config } from "../config.js";

export interface DiarizedSegment {
  speakerLabel: string;
  startMs: number;
  endMs: number;
  text: string;
}

export interface TranscriptionResult {
  segments: DiarizedSegment[];
  language: string | null;
  durationSeconds: number;
  raw: unknown;
}

export async function transcribeRecording(recordingUrl: string): Promise<TranscriptionResult> {
  if (!config.deepgram.apiKey) {
    throw new Error("DEEPGRAM_API_KEY is not set — cannot transcribe");
  }

  const deepgram = createClient(config.deepgram.apiKey);
  const { result, error } = await deepgram.listen.prerecorded.transcribeUrl(
    { url: recordingUrl },
    {
      model: config.deepgram.model,
      diarize: true,
      punctuate: true,
      smart_format: true,
      utterances: true,
      detect_language: true,
    },
  );
  if (error) throw new Error(`Deepgram transcription failed: ${error.message}`);
  if (!result) throw new Error("Deepgram returned no result");

  const utterances = result.results?.utterances ?? [];
  const segments: DiarizedSegment[] = utterances.map((utterance) => ({
    speakerLabel: `Speaker ${utterance.speaker ?? 0}`,
    startMs: Math.round((utterance.start ?? 0) * 1000),
    endMs: Math.round((utterance.end ?? 0) * 1000),
    text: utterance.transcript ?? "",
  }));

  return {
    segments,
    language: result.results?.channels?.[0]?.detected_language ?? null,
    durationSeconds: Math.round(result.metadata?.duration ?? 0),
    raw: result,
  };
}
