-- Приём лейблов и управление доступом (ТЗ «Label Registration & Onboarding»).
--
-- Всё пишется идемпотентно: файл можно прогнать по базе, где часть объектов уже
-- есть, — повторный запуск ничего не сломает.

-- ─── 1. Анкета заявки ──────────────────────────────────────────────────────
ALTER TABLE "signup_requests"
ADD COLUMN IF NOT EXISTS "website" text,
ADD COLUMN IF NOT EXISTS "social_media" text,
ADD COLUMN IF NOT EXISTS "contact_person" text,
ADD COLUMN IF NOT EXISTS "contact_position" text,
ADD COLUMN IF NOT EXISTS "whatsapp" text,
ADD COLUMN IF NOT EXISTS "artist_count" integer,
ADD COLUMN IF NOT EXISTS "release_count" integer,
ADD COLUMN IF NOT EXISTS "track_count" integer,
ADD COLUMN IF NOT EXISTS "genres" text,
ADD COLUMN IF NOT EXISTS "current_distributor" text,
ADD COLUMN IF NOT EXISTS "reason_for_moving" text,
ADD COLUMN IF NOT EXISTS "main_dsps" text,
ADD COLUMN IF NOT EXISTS "territories" text,
ADD COLUMN IF NOT EXISTS "monthly_releases" text,
ADD COLUMN IF NOT EXISTS "catalog_size" text,
ADD COLUMN IF NOT EXISTS "hear_about" text,
ADD COLUMN IF NOT EXISTS "source_ip" text,
ADD COLUMN IF NOT EXISTS "user_agent" text,
ADD COLUMN IF NOT EXISTS "internal_note" text,
ADD COLUMN IF NOT EXISTS "info_request" text,
ADD COLUMN IF NOT EXISTS "info_requested_at" timestamp with time zone,
ADD COLUMN IF NOT EXISTS "info_response" text,
ADD COLUMN IF NOT EXISTS "info_responded_at" timestamp with time zone,
ADD COLUMN IF NOT EXISTS "access_token" text;

-- ─── 2. Ограничения доступа ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "account_restrictions" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL,
  "feature" text NOT NULL,
  "reason" text NOT NULL,
  "case_id" text,
  "note" text,
  "expires_at" timestamp with time zone,
  "applied_by" integer,
  "applied_at" timestamp with time zone DEFAULT now() NOT NULL,
  "lifted_by" integer,
  "lifted_at" timestamp with time zone
);
CREATE INDEX IF NOT EXISTS "account_restrictions_user_idx" ON "account_restrictions" ("user_id");
-- Действующее ограничение на функцию может быть только одно; снятых — сколько угодно.
CREATE UNIQUE INDEX IF NOT EXISTS "account_restrictions_active_idx"
  ON "account_restrictions" ("user_id", "feature") WHERE "lifted_at" IS NULL;

-- ─── 3. Нарушения ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "account_violations" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL,
  "kind" text NOT NULL,
  "severity" text DEFAULT 'warning' NOT NULL,
  "status" text DEFAULT 'open' NOT NULL,
  "title" text NOT NULL,
  "description" text,
  "case_id" text,
  "evidence_url" text,
  "created_by" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "resolved_by" integer,
  "resolved_at" timestamp with time zone
);
CREATE INDEX IF NOT EXISTS "account_violations_user_idx" ON "account_violations" ("user_id");
CREATE INDEX IF NOT EXISTS "account_violations_status_idx" ON "account_violations" ("status");

-- ─── 4. Договоры ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "contracts" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL,
  "contract_number" text NOT NULL,
  "kind" text DEFAULT 'distribution' NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "status" text DEFAULT 'draft' NOT NULL,
  "title" text NOT NULL,
  "body" text,
  "object_path" text,
  "original_filename" text,
  "effective_date" date,
  "expiry_date" date,
  "sign_otp" text,
  "sign_otp_expires_at" timestamp with time zone,
  "signed_at" timestamp with time zone,
  "signed_by_name" text,
  "signed_ip" text,
  "terminated_at" timestamp with time zone,
  "termination_reason" text,
  "created_by" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "contracts_user_idx" ON "contracts" ("user_id");
CREATE INDEX IF NOT EXISTS "contracts_status_idx" ON "contracts" ("status");

-- ─── 5. Проверка прав ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "rights_verifications" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL,
  "owns_rights" boolean DEFAULT false NOT NULL,
  "authorized_to_distribute" boolean DEFAULT false NOT NULL,
  "accepts_copyright_responsibility" boolean DEFAULT false NOT NULL,
  "territories" text,
  "distribution_rights" text,
  "document_path" text,
  "document_filename" text,
  "status" text DEFAULT 'pending' NOT NULL,
  "reviewed_by" integer,
  "reviewed_at" timestamp with time zone,
  "review_note" text,
  "submitted_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "rights_verifications_user_idx" ON "rights_verifications" ("user_id");
CREATE INDEX IF NOT EXISTS "rights_verifications_status_idx" ON "rights_verifications" ("status");

-- ─── 6. Внешние ключи ──────────────────────────────────────────────────────
-- NOT VALID + VALIDATE: на боевой базе могли остаться сироты от прежних push'ей,
-- поэтому сначала включаем проверку для новых строк, потом проверяем старые.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('account_restrictions', 'user_id',    'users', 'cascade'),
      ('account_restrictions', 'applied_by', 'users', 'set null'),
      ('account_restrictions', 'lifted_by',  'users', 'set null'),
      ('account_violations',   'user_id',    'users', 'cascade'),
      ('account_violations',   'created_by', 'users', 'set null'),
      ('account_violations',   'resolved_by','users', 'set null'),
      ('contracts',            'user_id',    'users', 'cascade'),
      ('contracts',            'created_by', 'users', 'set null'),
      ('rights_verifications', 'user_id',    'users', 'cascade'),
      ('rights_verifications', 'reviewed_by','users', 'set null')
    ) AS v(child, col, parent, ondelete)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = r.child || '_' || r.col || '_' || r.parent || '_id_fk'
    ) THEN
      EXECUTE format(
        'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %I(id) ON DELETE %s NOT VALID',
        r.child, r.child || '_' || r.col || '_' || r.parent || '_id_fk', r.col, r.parent, r.ondelete);
      EXECUTE format('ALTER TABLE %I VALIDATE CONSTRAINT %I',
        r.child, r.child || '_' || r.col || '_' || r.parent || '_id_fk');
    END IF;
  END LOOP;
END $$;
