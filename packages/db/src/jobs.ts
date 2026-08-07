/**
 * Job-queue contracts shared between the API server (producer)
 * and the worker (consumer). Queue names and payload types only —
 * no BullMQ imports here so the extension never pulls it in.
 */

export const QUEUES = {
  /** Transcribe → analyze → persist insights for one meeting */
  meetingProcessing: "meeting-processing",
  /** Render + send full/summary email reports for a completed meeting */
  reports: "reports",
  /** Deliver an outbound webhook event to a customer endpoint */
  webhookDelivery: "webhook-delivery",
} as const;

export interface MeetingProcessingJob {
  meetingId: string;
  /** Publicly fetchable (time-limited) recording URL from the bot provider */
  recordingUrl: string;
  /** Participant names known from the calendar event, used to label speakers */
  participantNames?: string[];
}

export interface ReportJob {
  meetingId: string;
}

export interface WebhookDeliveryJob {
  endpointId: string;
  event: string;
  payload: Record<string, unknown>;
}
