-- Nettoyée à la main : le générateur rejouait des colonnes déjà appliquées
-- hors journal (watch_attributes.sql, full_set_price.sql). Seules les
-- nouvelles tables de la monétisation restent.
CREATE TABLE IF NOT EXISTS "entitlements" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"plan" text DEFAULT 'free' NOT NULL,
	"source" text,
	"expires_at" timestamp with time zone,
	"rc_app_user_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "expert_reports" (
	"watch_id" uuid PRIMARY KEY NOT NULL REFERENCES "public"."watches"("id") ON DELETE cascade,
	"content" text NOT NULL,
	"model" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "recognition_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "recognition_events_user_month_idx" ON "recognition_events" ("user_id", "created_at");
