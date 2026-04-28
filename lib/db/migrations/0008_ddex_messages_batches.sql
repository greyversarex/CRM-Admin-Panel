CREATE TABLE IF NOT EXISTS "ddex_batches" (
        "id" serial PRIMARY KEY NOT NULL,
        "batch_ref" text NOT NULL,
        "partner_code" text NOT NULL,
        "party_id_sender" text NOT NULL,
        "party_id_recipient" text NOT NULL,
        "ern_version" text DEFAULT '4.3' NOT NULL,
        "status" text DEFAULT 'building' NOT NULL,
        "uploaded_at" timestamp with time zone,
        "ack_received_at" timestamp with time zone,
        "transport" text DEFAULT 'local-fs' NOT NULL,
        "remote_path" text,
        "manifest_filename" text,
        "total_bytes" integer DEFAULT 0 NOT NULL,
        "file_count" integer DEFAULT 0 NOT NULL,
        "attempts" integer DEFAULT 0 NOT NULL,
        "next_retry_at" timestamp with time zone,
        "last_error" text,
        "created_by" integer,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
        CONSTRAINT "ddex_batches_batch_ref_unique" UNIQUE("batch_ref")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ddex_acknowledgements" (
        "id" serial PRIMARY KEY NOT NULL,
        "message_id" integer,
        "batch_id" integer,
        "partner_code" text NOT NULL,
        "source" text NOT NULL,
        "ack_type" text NOT NULL,
        "status" text NOT NULL,
        "raw_payload" text NOT NULL,
        "parsed" jsonb,
        "received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ddex_messages" (
        "id" serial PRIMARY KEY NOT NULL,
        "message_ref" text NOT NULL,
        "message_thread_id" text NOT NULL,
        "batch_id" integer,
        "release_id" integer NOT NULL,
        "delivery_id" integer,
        "partner_code" text NOT NULL,
        "message_type" text NOT NULL,
        "update_indicator" text NOT NULL,
        "ern_version" text DEFAULT '4.3' NOT NULL,
        "profile" text NOT NULL,
        "xml_payload" text NOT NULL,
        "xml_hash" text NOT NULL,
        "xml_size_bytes" integer NOT NULL,
        "status" text DEFAULT 'draft' NOT NULL,
        "validation_errors" jsonb,
        "sent_at" timestamp with time zone,
        "acked_at" timestamp with time zone,
        "ack_payload" jsonb,
        "rejection_reason" text,
        "parent_message_id" integer,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
        CONSTRAINT "ddex_messages_message_ref_unique" UNIQUE("message_ref")
);
--> statement-breakpoint
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ddex_batches_created_by_users_id_fk') THEN
        ALTER TABLE "ddex_batches" ADD CONSTRAINT "ddex_batches_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action NOT VALID;
        ALTER TABLE "ddex_batches" VALIDATE CONSTRAINT "ddex_batches_created_by_users_id_fk";
    END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ddex_acknowledgements_message_id_ddex_messages_id_fk') THEN
        ALTER TABLE "ddex_acknowledgements" ADD CONSTRAINT "ddex_acknowledgements_message_id_ddex_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."ddex_messages"("id") ON DELETE cascade ON UPDATE no action NOT VALID;
        ALTER TABLE "ddex_acknowledgements" VALIDATE CONSTRAINT "ddex_acknowledgements_message_id_ddex_messages_id_fk";
    END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ddex_acknowledgements_batch_id_ddex_batches_id_fk') THEN
        ALTER TABLE "ddex_acknowledgements" ADD CONSTRAINT "ddex_acknowledgements_batch_id_ddex_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."ddex_batches"("id") ON DELETE cascade ON UPDATE no action NOT VALID;
        ALTER TABLE "ddex_acknowledgements" VALIDATE CONSTRAINT "ddex_acknowledgements_batch_id_ddex_batches_id_fk";
    END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ddex_messages_batch_id_ddex_batches_id_fk') THEN
        ALTER TABLE "ddex_messages" ADD CONSTRAINT "ddex_messages_batch_id_ddex_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."ddex_batches"("id") ON DELETE set null ON UPDATE no action NOT VALID;
        ALTER TABLE "ddex_messages" VALIDATE CONSTRAINT "ddex_messages_batch_id_ddex_batches_id_fk";
    END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ddex_messages_release_id_releases_id_fk') THEN
        ALTER TABLE "ddex_messages" ADD CONSTRAINT "ddex_messages_release_id_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."releases"("id") ON DELETE cascade ON UPDATE no action NOT VALID;
        ALTER TABLE "ddex_messages" VALIDATE CONSTRAINT "ddex_messages_release_id_releases_id_fk";
    END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ddex_messages_delivery_id_deliveries_id_fk') THEN
        ALTER TABLE "ddex_messages" ADD CONSTRAINT "ddex_messages_delivery_id_deliveries_id_fk" FOREIGN KEY ("delivery_id") REFERENCES "public"."deliveries"("id") ON DELETE set null ON UPDATE no action NOT VALID;
        ALTER TABLE "ddex_messages" VALIDATE CONSTRAINT "ddex_messages_delivery_id_deliveries_id_fk";
    END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ddex_messages_parent_message_id_ddex_messages_id_fk') THEN
        ALTER TABLE "ddex_messages" ADD CONSTRAINT "ddex_messages_parent_message_id_ddex_messages_id_fk" FOREIGN KEY ("parent_message_id") REFERENCES "public"."ddex_messages"("id") ON DELETE set null ON UPDATE no action NOT VALID;
        ALTER TABLE "ddex_messages" VALIDATE CONSTRAINT "ddex_messages_parent_message_id_ddex_messages_id_fk";
    END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ddex_batches_partner_status_idx" ON "ddex_batches" USING btree ("partner_code","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ddex_batches_status_idx" ON "ddex_batches" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ddex_batches_created_idx" ON "ddex_batches" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ddex_acks_message_idx" ON "ddex_acknowledgements" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ddex_acks_batch_idx" ON "ddex_acknowledgements" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ddex_acks_partner_idx" ON "ddex_acknowledgements" USING btree ("partner_code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ddex_acks_received_idx" ON "ddex_acknowledgements" USING btree ("received_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ddex_messages_release_idx" ON "ddex_messages" USING btree ("release_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ddex_messages_batch_idx" ON "ddex_messages" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ddex_messages_status_idx" ON "ddex_messages" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ddex_messages_partner_idx" ON "ddex_messages" USING btree ("partner_code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ddex_messages_thread_idx" ON "ddex_messages" USING btree ("message_thread_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ddex_messages_type_idx" ON "ddex_messages" USING btree ("message_type","update_indicator");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ddex_messages_created_idx" ON "ddex_messages" USING btree ("created_at");
