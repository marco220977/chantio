const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json" } });

function frError(msg: string, status: number): string {
  const m = (msg || "").toLowerCase();
  if (m.includes("credit balance")) return "Service IA momentanément indisponible (crédit épuisé). Prévenez l'administrateur de l'appli.";
  if (status === 401 || m.includes("api key")) return "Clé IA invalide. Prévenez l'administrateur de l'appli.";
  if (status === 429) return "Trop de demandes en même temps, réessayez dans une minute.";
  if (status === 529 || m.includes("overloaded")) return "Service IA surchargé, réessayez dans un instant.";
  if (m.includes("image")) return "Photo illisible ou trop lourde, reprenez-la de plus près.";
  return "Lecture impossible pour le moment, réessayez.";
}

// Accès réservé aux formules Pro et Équipe (et à l'essai)
async function subscriptionOk(req: Request): Promise<boolean> {
  try {
    const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/rest/v1/rpc/my_company_has`, {
      method: "POST", body: JSON.stringify({ p_feature: "ia" }),
      headers: { Authorization: req.headers.get("Authorization") || "", apikey: Deno.env.get("SUPABASE_ANON_KEY") || "", "content-type": "application/json" },
    });
    return (await r.json()) !== false;
  } catch { return true; }
}

const PROMPT = `Tu lis des photos de pages de catalogue fournisseur, de tarifs, d'étiquettes de prix, de tickets de comptoir ou de factures d'un grossiste en plomberie / chauffage / sanitaire (France).
Extrais CHAQUE article lisible avec son prix. N'invente rien : si une information est illisible, laisse-la vide (prix : null).
- "label" : désignation claire et complète en français (type d'article, dimensions, caractéristiques utiles), sans la marque en double.
- "ref" : référence fabricant ou fournisseur exactement comme écrite.
- "brand" : marque si visible.
- "unit" : u, m, ml, m², kg, l, lot, rouleau, boîte... (u par défaut).
- "cost" : prix d'ACHAT unitaire HT en euros (prix net, remisé, de facture ou de ticket), null si absent.
- "public" : prix PUBLIC unitaire HT en euros (tarif catalogue avant remise), null si absent.
- Un prix « HT » de catalogue sans autre indication est un prix public. Si seul un prix TTC est indiqué, convertis en HT (TTC / 1,2).
- "category" : une parmi Chauffage, Sanitaire, Plomberie, Raccords, Évacuation, Robinetterie, Électricité, Outillage, Fournitures.
- Un même article décliné en plusieurs tailles = une ligne par taille (avec sa référence et son prix).
Réponds UNIQUEMENT avec un JSON, sans texte autour :
{"supplier":"nom du fournisseur ou du catalogue si visible","items":[{"label":"","ref":"","brand":"","unit":"u","cost":null,"public":0,"category":"Plomberie"}],"notes":"remarque utile (pages floues, prix manquants, consigne appliquée…)"}`;

function extractJson(txt: string): any | null {
  const t = txt.replace(/```(?:json)?/g, "");
  for (let i = t.indexOf("{"); i >= 0; i = t.indexOf("{", i + 1)) {
    let depth = 0, inStr = false, esc = false;
    for (let k = i; k < t.length; k++) {
      const c = t[k];
      if (inStr) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') inStr = false; continue; }
      if (c === '"') inStr = true;
      else if (c === "{") depth++;
      else if (c === "}" && --depth === 0) {
        try { const o = JSON.parse(t.slice(i, k + 1)); if (o && Array.isArray(o.items)) return o; } catch {}
        break;
      }
    }
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (!(await subscriptionOk(req))) return json({ error: "L'intelligence artificielle (devis IA, scan de plaque, diagnostic, catalogue par photo) est incluse dans les formules Pro et Équipe : Menu → Abonnement." }, 402);
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) return json({ error: "Clé ANTHROPIC_API_KEY manquante" }, 500);
  const { images, hint } = await req.json().catch(() => ({}));
  const list = (Array.isArray(images) ? images : []).slice(0, 4);
  const content: any[] = [];
  for (const im of list) {
    const m = /^data:(image\/\w+);base64,(.+)$/.exec(im || "");
    if (m) content.push({ type: "image", source: { type: "base64", media_type: m[1], data: m[2] } });
  }
  if (!content.length) return json({ error: "Ajoutez au moins une photo." }, 400);
  const h = String(hint || "").trim().slice(0, 1500);
  content.push({ type: "text", text: PROMPT + (h ? `\n\nCONSIGNES DE L'ARTISAN POUR CE CATALOGUE (prioritaires sur les règles ci-dessus, applique-les à chaque ligne) :\n"""${h}"""` : "") });
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: Deno.env.get("ANTHROPIC_MODEL") || "claude-sonnet-5-5", max_tokens: 12000, messages: [{ role: "user", content }] }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { console.error("Anthropic error", r.status, j?.error?.message); return json({ error: frError(j?.error?.message || "", r.status) }, 502); }
  const txt: string = (j.content || []).filter((c: any) => c.type === "text").map((c: any) => c.text).join("");
  const out = extractJson(txt);
  if (!out) { console.error("unparsable", j.stop_reason, txt.slice(-300)); return json({ error: "Lecture incomplète : essayez avec moins de pages à la fois." }, 502); }
  return json(out);
});
