CREATE TABLE "push_tokens" (
	"token" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wishlist_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"watch_model_id" uuid NOT NULL,
	"target_price" numeric(12, 2),
	"notified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wishlist_user_model_unique" UNIQUE("user_id","watch_model_id")
);
--> statement-breakpoint
ALTER TABLE "wishlist_items" ADD CONSTRAINT "wishlist_items_watch_model_id_watch_models_id_fk" FOREIGN KEY ("watch_model_id") REFERENCES "public"."watch_models"("id") ON DELETE cascade ON UPDATE no action;