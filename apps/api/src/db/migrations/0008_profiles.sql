CREATE TABLE "profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"age_range" text,
	"city" text,
	"country" text,
	"expertise" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
