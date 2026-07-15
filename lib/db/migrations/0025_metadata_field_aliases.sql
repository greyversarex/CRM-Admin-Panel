CREATE TABLE IF NOT EXISTS "metadata_field_aliases" (
	"id" serial PRIMARY KEY NOT NULL,
	"internal_field" text NOT NULL,
	"alias" text NOT NULL,
	"source" text DEFAULT '' NOT NULL,
	"created_by_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "metadata_field_aliases_alias_source_uq" ON "metadata_field_aliases" USING btree ("alias","source");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "metadata_field_aliases_internal_field_idx" ON "metadata_field_aliases" USING btree ("internal_field");--> statement-breakpoint
DO $$ BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'metadata_field_aliases_created_by_id_users_id_fk') THEN
		ALTER TABLE "metadata_field_aliases" ADD CONSTRAINT "metadata_field_aliases_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null NOT VALID;
		ALTER TABLE "metadata_field_aliases" VALIDATE CONSTRAINT "metadata_field_aliases_created_by_id_users_id_fk";
	END IF;
END $$;--> statement-breakpoint
INSERT INTO "metadata_field_aliases" ("internal_field","alias","source") VALUES
	('title','album title',''),
	('title','release title',''),
	('title','album name',''),
	('title','album',''),
	('title','release',''),
	('title','product title',''),
	('releaseVersion','release version',''),
	('upc','upc',''),
	('upc','ean',''),
	('upc','upc ean',''),
	('upc','barcode',''),
	('upc','upc code',''),
	('releaseDate','release date',''),
	('releaseDate','digital release date',''),
	('releaseDate','original release date',''),
	('genre','genre',''),
	('genre','primary genre',''),
	('genre','main genre',''),
	('subgenre','subgenre',''),
	('subgenre','sub genre',''),
	('subgenre','secondary genre',''),
	('label','label',''),
	('label','label name',''),
	('label','record label',''),
	('pLine','p line',''),
	('pLine','phonographic copyright',''),
	('cLine','c line',''),
	('cLine','copyright',''),
	('coverUrl','cover url',''),
	('coverUrl','artwork url',''),
	('coverUrl','cover art',''),
	('language','language',''),
	('language','lyrics language',''),
	('primaryArtist','primary artist',''),
	('primaryArtist','artist',''),
	('primaryArtist','main artist',''),
	('primaryArtist','album artist',''),
	('primaryArtist','display artist',''),
	('trackTitle','track title',''),
	('trackTitle','song title',''),
	('trackTitle','track name',''),
	('trackVersion','track version',''),
	('isrc','isrc',''),
	('isrc','isrc code',''),
	('trackNumber','track number',''),
	('trackNumber','track no',''),
	('trackNumber','sequence',''),
	('trackNumber','position',''),
	('explicit','explicit',''),
	('explicit','parental advisory',''),
	('explicit','explicit content',''),
	('explicit','explicit lyrics',''),
	('duration','duration',''),
	('duration','length',''),
	('duration','runtime',''),
	('featuredArtists','featured artists',''),
	('featuredArtists','featuring',''),
	('featuredArtists','feat','')
ON CONFLICT ("alias","source") DO NOTHING;
