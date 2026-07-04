CREATE TABLE "market_prices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"watch_model_id" uuid NOT NULL,
	"price" numeric(12, 2) NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"source" text,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "watch_models" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand" text NOT NULL,
	"model" text NOT NULL,
	"reference" text,
	"canonical_name" text NOT NULL,
	"photo_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "watches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"watch_model_id" uuid,
	"brand" text NOT NULL,
	"model" text NOT NULL,
	"reference" text,
	"photo_url" text,
	"purchase_price" numeric(12, 2),
	"purchase_date" date,
	"has_papers" boolean DEFAULT false NOT NULL,
	"has_box" boolean DEFAULT false NOT NULL,
	"notes" text,
	"completion_pct" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "market_prices" ADD CONSTRAINT "market_prices_watch_model_id_watch_models_id_fk" FOREIGN KEY ("watch_model_id") REFERENCES "public"."watch_models"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watches" ADD CONSTRAINT "watches_watch_model_id_watch_models_id_fk" FOREIGN KEY ("watch_model_id") REFERENCES "public"."watch_models"("id") ON DELETE set null ON UPDATE no action;