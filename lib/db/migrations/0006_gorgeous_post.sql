CREATE TABLE "signup_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"entity_type" text NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"country" text,
	"legal_name" text,
	"inn" text,
	"message" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"reviewed_by" integer,
	"reviewed_at" timestamp with time zone,
	"rejection_reason" text,
	"created_user_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kyc_documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"kind" text NOT NULL,
	"storage_key" text NOT NULL,
	"object_path" text NOT NULL,
	"original_filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"reviewed_by" integer,
	"reviewed_at" timestamp with time zone,
	"rejection_reason" text,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "kyc_status" text DEFAULT 'not_started' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "kyc_completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "bank_name" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "bank_account_number" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "bank_swift" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "bank_iban" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "bank_holder_name" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "bank_country" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "tax_id" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "tax_country" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "tax_form_type" text;--> statement-breakpoint
ALTER TABLE "signup_requests" ADD CONSTRAINT "signup_requests_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signup_requests" ADD CONSTRAINT "signup_requests_created_user_id_users_id_fk" FOREIGN KEY ("created_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kyc_documents" ADD CONSTRAINT "kyc_documents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kyc_documents" ADD CONSTRAINT "kyc_documents_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "signup_requests_status_idx" ON "signup_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "signup_requests_email_idx" ON "signup_requests" USING btree ("email");--> statement-breakpoint
CREATE INDEX "signup_requests_created_idx" ON "signup_requests" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "kyc_documents_user_idx" ON "kyc_documents" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "kyc_documents_status_idx" ON "kyc_documents" USING btree ("status");--> statement-breakpoint
CREATE INDEX "kyc_documents_uploaded_idx" ON "kyc_documents" USING btree ("uploaded_at");--> statement-breakpoint
CREATE INDEX "users_kyc_status_idx" ON "users" USING btree ("kyc_status");