import type { Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";
import { XMLParser } from "fast-xml-parser";

// ---- Réglages -------------------------------------------------------------
const FLUX: Record<string, string> = {
  "TechCrunch IA": "https://techcrunch.com/category/artificial-intelligence/feed/",
  "The Verge IA": "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml",
  "MIT Tech Review": "https://www.technologyreview.com/feed/",
  "Hugging Face": "https://huggingface.co/blog/feed.xml",
  "Korben (FR)": "https://korben.info/feed",
  "Numerama (FR)": "https://www.numerama.com/feed/",
};
const MAX_PAR_PASSAGE = 5; // articles publiés à chaque exécution
const AGE_MAX_MS = 48 * 3600 * 1000; // on ignore les articles de plus de 48 h

// ---- Types & utilitaires --------------------------------------------------
type Article = {
  source: string;
  titre: string;
  lien: string;
  resume: string;
  date: number;
};

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));
const echapper = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function texte(v: any): string {
  if (v == null) return "";
  if (typeof v === "string" || typeof v === "number") return String(v);
  if (typeof v === "object") return texte(v["#text"]);
  return "";
}

function lienDe(e: any): string {
  const l = e.link;
  if (typeof l === "string") return l;
  const liste = Array.isArray(l) ? l : l ? [l] : [];
  const choix = liste.find((x: any) => !x["@_rel"] || x["@_rel"] === "alternate") ?? liste[0];
  return choix?.["@_href"] ?? texte(choix);
}

async function lireFlux(source: string, url: string): Promise<Article[]> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: { "user-agent": "Mozilla/5.0 (compatible; BotActus/1.0)" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const doc = parser.parse(await res.text());
    const brut = doc?.rss?.channel?.item ?? doc?.feed?.entry ?? [];
    const items: any[] = Array.isArray(brut) ? brut : [brut];

    return items.slice(0, 10).map((e) => {
      const date = Date.parse(
        texte(e.pubDate ?? e.published ?? e.updated ?? e["dc:date"])
      );
      const resume = texte(e.description ?? e.summary ?? e.content)
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 250);
      return {
        source,
        titre: texte(e.title).trim(),
        lien: lienDe(e),
        resume,
        date: Number.isNaN(date) ? Date.now() : date,
      };
    }).filter((a) => a.lien && a.titre);
  } catch (err) {
    console.error(`Flux « ${source} » indisponible :`, err);
    return [];
  }
}

function formater(a: Article): string {
  let t = `📰 <b>${echapper(a.titre)}</b>\n`;
  if (a.resume) t += `\n${echapper(a.resume)}…\n`;
  t += `\n🔗 <a href="${a.lien.replace(/"/g, "%22")}">Lire l’article</a>  •  <i>${echapper(a.source)}</i>`;
  return t;
}

async function envoyer(token: string, canal: string, message: string): Promise<boolean> {
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: canal, text: message, parse_mode: "HTML" }),
  });
  if (!res.ok) console.error("Erreur Telegram :", res.status, await res.text());
  return res.ok;
}

// ---- Fonction planifiée ---------------------------------------------------
export default async () => {
  const token = Netlify.env.get("BOT_TOKEN");
  const canal = Netlify.env.get("CHANNEL_ID");
  if (!token || !canal) {
    console.error("BOT_TOKEN ou CHANNEL_ID manquant (portée « Functions » requise).");
    return;
  }

  // Mémoire des liens déjà publiés (Netlify Blobs)
  const store = getStore("actus");
  const vusBrut = (await store.get("vus", { type: "json" })) as string[] | null;
  const premierPassage = vusBrut === null;
  const vus = new Set<string>(vusBrut ?? []);

  const tous = (
    await Promise.all(Object.entries(FLUX).map(([s, u]) => lireFlux(s, u)))
  ).flat();

  // Nouveaux articles récents, sans doublons, du plus récent au plus ancien
  const uniques = new Map<string, Article>();
  for (const a of tous) {
    if (!vus.has(a.lien) && Date.now() - a.date < AGE_MAX_MS) uniques.set(a.lien, a);
  }
  const frais = [...uniques.values()].sort((a, b) => b.date - a.date);

  let publies = 0;
  for (const a of frais) {
    if (publies >= MAX_PAR_PASSAGE) break;
    if (await envoyer(token, canal, formater(a))) {
      vus.add(a.lien);
      publies++;
      await dormir(1000); // évite le flood Telegram
    }
  }

  // Premier passage : on marque tout l'existant comme « vu » pour ne pas
  // inonder le canal avec l'historique.
  if (premierPassage && publies > 0) tous.forEach((a) => vus.add(a.lien));

  await store.setJSON("vus", [...vus].slice(-2000));
  console.log(`${publies} article(s) publié(s) sur ${frais.length} nouveau(x).`);
};

export const config: Config = {
  schedule: "*/30 * * * *", // toutes les 30 minutes (UTC)
};
