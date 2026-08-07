ALTER TABLE "meetings" ADD COLUMN "join_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN "has_external_guests" boolean;