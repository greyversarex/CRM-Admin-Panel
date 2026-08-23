-- Подтверждение почты и раздельные согласия при подаче заявки.
--
-- Телефон здесь не трогаем: подтверждать его нечем, пока у заказчика нет
-- SMS-шлюза. Колонки заведены заранее, чтобы потом не менять таблицу.

ALTER TABLE "users"
ADD COLUMN IF NOT EXISTS "email_verified_at" timestamp with time zone,
ADD COLUMN IF NOT EXISTS "email_verify_token" text,
ADD COLUMN IF NOT EXISTS "email_verify_sent_at" timestamp with time zone,
ADD COLUMN IF NOT EXISTS "phone_verified_at" timestamp with time zone,
ADD COLUMN IF NOT EXISTS "phone_verify_code" text,
ADD COLUMN IF NOT EXISTS "phone_verify_expires_at" timestamp with time zone;

CREATE INDEX IF NOT EXISTS "users_email_verify_token_idx" ON "users" ("email_verify_token");

-- Все, кто уже работает, считаются подтверждёнными: они завелись до появления
-- проверки, и заставлять их подтверждать почту задним числом незачем.
UPDATE "users" SET "email_verified_at" = "created_at" WHERE "email_verified_at" IS NULL;

ALTER TABLE "signup_requests"
ADD COLUMN IF NOT EXISTS "accepted_terms_at" timestamp with time zone,
ADD COLUMN IF NOT EXISTS "accepted_privacy_at" timestamp with time zone;

ALTER TABLE "kyc_documents"
ADD COLUMN IF NOT EXISTS "info_request" text;
