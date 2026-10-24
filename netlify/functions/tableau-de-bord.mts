import type { Config } from "@netlify/functions";
import { desc, gte, isNull, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { executions, publications } from "../../db/schema.js";

const JOUR_MS = 24 * 3600 * 1000;

export default async () => {
  const maintenant = Date.now();
  const il30j = new Date(maintenant - 30 * JOUR_MS);

  try {
    const [[totaux], parJour, parSource, recentes, dernieresExec, [derniereOk]] =
      await Promise.all([
        db
          .select({
            total: sql<number>`count(*)::int`,
            h24: sql<number>`count(*) filter (where ${publications.publieLe} >= now() - interval '24 hours')::int`,
            j7: sql<number>`count(*) filter (where ${publications.publieLe} >= now() - interval '7 days')::int`,
          })
          .from(publications),
        db
          .select({
            jour: sql<string>`to_char(date_trunc('day', ${publications.publieLe} at time zone 'UTC'), 'YYYY-MM-DD')`,
            n: sql<number>`count(*)::int`,
          })
          .from(publications)
          .where(gte(publications.publieLe, il30j))
          .groupBy(sql`1`)
          .orderBy(sql`1`),
        db
          .select({ source: publications.source, n: sql<number>`count(*)::int` })
          .from(publications)
          .where(gte(publications.publieLe, il30j))
          .groupBy(publications.source)
          .orderBy(desc(sql`2`)),
        db
          .select({
            source: publications.source,
            titre: publications.titre,
            lien: publications.lien,
            publieLe: publications.publieLe,
          })
          .from(publications)
          .orderBy(desc(publications.publieLe))
          .limit(25),
        db.select().from(executions).orderBy(desc(executions.demarreLe)).limit(48),
        db
          .select({ sources: executions.sources, demarreLe: executions.demarreLe })
          .from(executions)
          .where(isNull(executions.erreur))
          .orderBy(desc(executions.demarreLe))
          .limit(1),
      ]);

    // Série continue sur 30 jours (les jours sans publication valent 0)
    const index = new Map(parJour.map((r) => [r.jour, r.n]));
    const serie = Array.from({ length: 30 }, (_, i) => {
      const jour = new Date(maintenant - (29 - i) * JOUR_MS).toISOString().slice(0, 10);
      return { jour, n: index.get(jour) ?? 0 };
    });

    return Response.json(
      {
        genereLe: new Date(maintenant).toISOString(),
        totaux,
        serie,
        parSource,
        recentes,
        executions: dernieresExec,
        sources: derniereOk?.sources ?? {},
        sourcesVerifieesLe: derniereOk?.demarreLe ?? null,
      },
      { headers: { "cache-control": "no-store" } }
    );
  } catch (err) {
    console.error("Tableau de bord indisponible :", err);
    return Response.json({ erreur: "Données indisponibles" }, { status: 500 });
  }
};

export const config: Config = {
  path: "/api/tableau-de-bord",
};
