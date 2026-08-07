/**
 * OpenAPI 3.1 spec for the public /v1 API, served at /v1/openapi.json
 * and rendered by the docs page in the web app.
 */
const meetingSchema = {
  type: "object",
  properties: {
    id: { type: "string", example: "mtg_x7k2m9q4w1" },
    title: { type: "string" },
    platform: { type: "string", enum: ["google_meet", "zoom", "teams", "other"] },
    status: {
      type: "string",
      enum: ["scheduled", "bot_dispatched", "recording", "processing", "completed", "failed", "cancelled"],
    },
    starts_at: { type: ["string", "null"], format: "date-time" },
    duration_seconds: { type: ["integer", "null"] },
    summary: { type: ["string", "null"] },
    key_points: { type: "array", items: { type: "string" } },
    decisions: { type: "array", items: { type: "string" } },
    speaker_stats: {
      type: "array",
      items: {
        type: "object",
        properties: {
          speaker: { type: "string" },
          talkTimeSeconds: { type: "number" },
          talkTimePercent: { type: "number" },
          keyPoints: { type: "array", items: { type: "string" } },
        },
      },
    },
    created_at: { type: "string", format: "date-time" },
  },
} as const;

export const openApiSpec = {
  openapi: "3.1.0",
  info: {
    title: "Follac AI API",
    version: "1.0.0",
    description:
      "Programmatic access to your meetings, transcripts, and action items. " +
      "Authenticate with an API key from Dashboard → Developer: `Authorization: Bearer flc_live_...`. " +
      "API access requires the Business plan.",
  },
  servers: [{ url: "/v1" }],
  security: [{ apiKey: [] }],
  components: {
    securitySchemes: {
      apiKey: { type: "http", scheme: "bearer", bearerFormat: "flc_live_..." },
    },
    schemas: { Meeting: meetingSchema },
  },
  paths: {
    "/meetings": {
      get: {
        summary: "List meetings",
        responses: {
          "200": {
            description: "Up to 100 most recent meetings",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { data: { type: "array", items: { $ref: "#/components/schemas/Meeting" } } },
                },
              },
            },
          },
        },
      },
      post: {
        summary: "Invite the Follac bot to a live meeting",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["meeting_url"],
                properties: {
                  meeting_url: { type: "string", format: "uri" },
                  title: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          "201": { description: "Bot dispatched" },
          "402": { description: "Plan meeting-hour limit reached" },
        },
      },
    },
    "/meetings/{id}": {
      get: {
        summary: "Get one meeting with insights",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": { description: "Meeting detail" },
          "404": { description: "Not found" },
        },
      },
    },
    "/meetings/{id}/transcript": {
      get: {
        summary: "Get the diarized transcript",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": {
            description: "Ordered transcript segments with speaker attribution",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          speaker: { type: "string" },
                          start_ms: { type: "integer" },
                          end_ms: { type: "integer" },
                          text: { type: "string" },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/action-items": {
      get: {
        summary: "List action items across meetings",
        responses: { "200": { description: "Up to 200 most recent action items" } },
      },
    },
  },
} as const;
