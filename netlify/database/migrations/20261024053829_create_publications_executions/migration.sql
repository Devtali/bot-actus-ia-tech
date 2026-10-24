CREATE TABLE "executions" (
	"id" serial PRIMARY KEY,
	"demarre_le" timestamp with time zone DEFAULT now() NOT NULL,
	"duree_ms" integer DEFAULT 0 NOT NULL,
	"articles_lus" integer DEFAULT 0 NOT NULL,
	"nouveaux" integer DEFAULT 0 NOT NULL,
	"publies" integer DEFAULT 0 NOT NULL,
	"echecs_envoi" integer DEFAULT 0 NOT NULL,
	"sources" jsonb DEFAULT '{}' NOT NULL,
	"erreur" text
);
--> statement-breakpoint
CREATE TABLE "publications" (
	"id" serial PRIMARY KEY,
	"source" text NOT NULL,
	"titre" text NOT NULL,
	"lien" text NOT NULL,
	"resume" text DEFAULT '' NOT NULL,
	"date_article" timestamp with time zone,
	"publie_le" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "executions_demarre_le_idx" ON "executions" ("demarre_le");--> statement-breakpoint
CREATE INDEX "publications_publie_le_idx" ON "publications" ("publie_le");