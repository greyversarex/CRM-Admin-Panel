-- explicit_status / ai_usage / audio_style must be nullable with no default:
-- "not chosen yet" (NULL) must be distinguishable from an explicit user choice.
ALTER TABLE "tracks" ALTER COLUMN "explicit_status" DROP DEFAULT;
ALTER TABLE "tracks" ALTER COLUMN "explicit_status" DROP NOT NULL;
ALTER TABLE "tracks" ALTER COLUMN "ai_usage" DROP DEFAULT;
ALTER TABLE "tracks" ALTER COLUMN "ai_usage" DROP NOT NULL;
ALTER TABLE "tracks" ALTER COLUMN "audio_style" DROP DEFAULT;
ALTER TABLE "tracks" ALTER COLUMN "audio_style" DROP NOT NULL;
