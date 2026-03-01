# Adding a New Platform Adapter

This guide explains how to extend Follac AI to support a new platform
(e.g. Notion, Twitter/X, GitHub, Outlook).

---

## 1. Create the Adapter File

```
packages/platform-adapters/src/<platform>/<platform>.adapter.ts
```

Example: `packages/platform-adapters/src/notion/notion.adapter.ts`

## 2. Implement the PlatformAdapter Interface

```typescript
import { BaseAdapter } from "../base.adapter.js";
import type { ContextObject, ProposedAction } from "@follac/shared";
import { now, generateId } from "@follac/shared";

export class NotionAdapter extends BaseAdapter {
  readonly name = "Notion";

  canHandle(url: string): boolean {
    return /^https:\/\/www\.notion\.so\//.test(url);
  }

  async extractData(): Promise<Record<string, unknown>> {
    return {
      pageTitle: document.title,
      // ... extract DOM data
    };
  }

  async detectContext(): Promise<ContextObject> {
    const data = await this.extractData();
    return {
      platform: "notion" as any, // Add "notion" to Platform type in @follac/shared
      pageType: "document",
      detectedActivity: `Working on Notion page: "${data.pageTitle}"`,
      inferredIntent: "Editing or reviewing a Notion document",
      confidenceScore: 0.8,
      extractedData: data,
      capturedAt: now(),
    };
  }

  async proposeActions(context: ContextObject): Promise<ProposedAction[]> {
    return [
      {
        id: generateId(),
        type: "summarize-document",
        title: "Summarize this page",
        description: "Get a quick summary of this Notion document",
        payload: { title: context.extractedData.pageTitle },
        status: "pending",
        confidence: 0.85,
        createdAt: now(),
      },
    ];
  }
}
```

## 3. Add the Platform to Shared Types

In `packages/shared/src/types/index.ts`:

```typescript
// Before:
export type Platform = "gmail" | "google-docs" | "linkedin" | "unknown";

// After:
export type Platform = "gmail" | "google-docs" | "linkedin" | "notion" | "unknown";
```

## 4. Register the Adapter

In `apps/extension/src/content/platform-detector.ts`:

```typescript
import { NotionAdapter } from "@follac/platform-adapters";

adapterRegistry
  .register(new GmailAdapter())
  .register(new DocsAdapter())
  .register(new LinkedInAdapter())
  .register(new NotionAdapter()); // Add this
```

## 5. Update the Manifest

In `apps/extension/public/manifest.json`, add the URL pattern:

```json
"content_scripts": [
  {
    "matches": [
      "https://mail.google.com/*",
      "https://docs.google.com/document/*",
      "https://www.linkedin.com/*",
      "https://www.notion.so/*"   ← Add this
    ]
  }
],
"host_permissions": [
  "https://www.notion.so/*"   ← Add this
]
```

## 6. Export from the Package

In `packages/platform-adapters/src/index.ts`:

```typescript
export { NotionAdapter } from "./notion/notion.adapter.js";
```

## Done!

The new adapter is live. No other code changes required.
The `AdapterRegistry.resolve()` will automatically route Notion URLs to your new adapter.
