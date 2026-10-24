import { pgTable, serial, text, timestamp, integer, jsonb, index } from "drizzle-orm/pg-core";

// Une ligne par article publié sur le canal Telegram
export const publications = pgTable(
  "publications",
  {
    id: serial().primaryKey(),
    source: text().notNull(),
    titre: text().notNull(),
    lien: text().notNull(),
    resume: text().notNull().default(""),
    dateArticle: timestamp("date_article", { withTimezone: true }),
    publieLe: timestamp("publie_le", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("publications_publie_le_idx").on(t.publieLe)]
);

export type EtatSource = { ok: boolean; articles: number; erreur?: string };

// Une ligne par exécution de la fonction planifiée
export const executions = pgTable(
  "executions",
  {
    id: serial().primaryKey(),
    demarreLe: timestamp("demarre_le", { withTimezone: true }).notNull().defaultNow(),
    dureeMs: integer("duree_ms").notNull().default(0),
    articlesLus: integer("articles_lus").notNull().default(0),
    nouveaux: integer().notNull().default(0),
    publies: integer().notNull().default(0),
    echecsEnvoi: integer("echecs_envoi").notNull().default(0),
    sources: jsonb().$type<Record<string, EtatSource>>().notNull().default({}),
    erreur: text(),
  },
  (t) => [index("executions_demarre_le_idx").on(t.demarreLe)]
);
