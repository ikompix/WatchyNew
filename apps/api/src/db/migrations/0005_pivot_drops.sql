CREATE TABLE "report_purchases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "watch_models" DROP COLUMN "enriched_at";--> statement-breakpoint
ALTER TABLE "wishlist_items" DROP COLUMN "target_price";--> statement-breakpoint
ALTER TABLE "wishlist_items" DROP COLUMN "notified_at";