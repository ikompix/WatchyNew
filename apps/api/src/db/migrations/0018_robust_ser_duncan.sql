DROP TABLE "scan_credits" CASCADE;--> statement-breakpoint
ALTER TABLE "entitlements" RENAME COLUMN "extra_slots" TO "extra_watch_slots";--> statement-breakpoint
ALTER TABLE "entitlements" ADD COLUMN "extra_wishlist_slots" integer DEFAULT 0 NOT NULL;