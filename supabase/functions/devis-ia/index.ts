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
  return "Génération impossible pour le moment, réessayez.";
}

const PROMPT = (desc: string, catalog: string, vat: number) => `Tu es l'assistant d'un artisan plombier-chauffagiste en France. Rédige les lignes d'un devis à partir de sa description du chantier${"\n"}(dictée, parfois approximative).

DESCRIPTION :
"""${desc}"""

CATALOGUE DE L'ARTISAN (id | désignation | unité | prix HT | TVA %) :
${catalog || "(vide)"}

Règles :
- Utilise en priorité les articles du catalogue : reprends leur "id" exact et leur prix. N'invente pas d'id.
- Si un poste nécessaire n'est pas au catalogue, ajoute une ligne avec "id": null et un prix HT réaliste du marché français 2026, en le signalant avec "estimate": true.
- Pense à tout ce qu'un pro chiffrerait : dépose/évacuation de l'ancien matériel, fournitures annexes (raccords, flexibles, vannes), main d'œuvre (en heures), mise en service, déplacement.
- Quantités réalistes. Unités : u, h, m, m², ml, forfait, ens.
- TVA par défaut ${vat} % (10 % rénovation de logement de plus de 2 ans, 5,5 % travaux de rénovation énergétique, 20 % neuf ou local pro) : choisis selon la description.
- Désignations claires et professionnelles, en français.

Réponds UNIQUEMENT avec un JSON, sans texte autour :
{"title":"titre court du chantier","lines":[{"id":null,"label":"","qty":1,"unit":"u","unit_price":0,"vat_rate":10,"estimate":false}],"notes":"remarques utiles pour l'artisan (points à vérifier sur place), une ou deux phrases","questions":["question éventuelle à poser au client"]}`;


// Accès réservé aux comptes en essai ou abonnés
async function subscriptionOk(req: Request): Promise<boolean> {
  try {
    const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/rest/v1/rpc/my_company_active`, {
      method: "POST", body: "{}",
      headers: { Authorization: req.headers.get("Authorization") || "", apikey: Deno.env.get("SUPABASE_ANON_KEY") || "", "content-type": "application/json" },
    });
    return (await r.json()) !== false;
  } catch { return true; }
}
const SUB_MSG = "Essai gratuit terminé : abonnez-vous (Menu → Abonnement) pour utiliser l'intelligence artificielle.";

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
        try { const o = JSON.parse(t.slice(i, k + 1)); if (o && Array.isArray(o.lines)) return o; } catch {}
        break;
      }
    }
  }
  return null;
}

async function callClaude(key: string, body: unknown) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  return { r, j };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (!(await subscriptionOk(req))) return json({ error: SUB_MSG }, 402);
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) return json({ error: "Clé ANTHROPIC_API_KEY manquante" }, 500);
  const { description, image, catalog, vat } = await req.json().catch(() => ({}));
  if (!description || String(description).trim().length < 5) return json({ error: "Décrivez le chantier en quelques mots." }, 400);
  const cat = (Array.isArray(catalog) ? catalog : []).slice(0, 400)
    .map((c: any) => `${c.id} | ${String(c.label).slice(0, 120)} | ${c.unit} | ${c.unit_price} | ${c.vat_rate}`).join("\n");
  const content: any[] = [];
  const m = /^data:(image\/\w+);base64,(.+)$/.exec(image || "");
  if (m) content.push({ type: "image", source: { type: "base64", media_type: m[1], data: m[2] } });
  content.push({ type: "text", text: PROMPT(String(description).slice(0, 4000), cat, Number(vat) || 10) + (m ? "\nUne photo du chantier est jointe : sers-t'en pour préciser le matériel existant." : "") });
  const model = Deno.env.get("ANTHROPIC_MODEL") || "claude-sonnet-5-5";
  const { r, j } = await callClaude(key, { model, max_tokens: 12000, messages: [{ role: "user", content }] });
  if (!r.ok) { console.error("Anthropic error", r.status, j?.error?.message); return json({ error: frError(j?.error?.message || "", r.status) }, 502); }
  const txt: string = (j.content || []).filter((c: any) => c.type === "text").map((c: any) => c.text).join("");
  let out = extractJson(txt);
  if (!out && txt.trim()) {
    // Réponse coupée ou mal formée : on demande de la remettre au propre
    console.error("devis-ia unparsable", j.stop_reason, txt.slice(-300));
    const again = await callClaude(key, { model, max_tokens: 12000, messages: [
      { role: "user", content },
      { role: "assistant", content: txt.slice(0, 30000).trimEnd() || "{" },
      { role: "user", content: "Ta réponse est incomplète ou n'est pas un JSON valide. Renvoie UNIQUEMENT le JSON complet et valide, au format demandé, avec des désignations courtes (regroupe les petites fournitures si besoin)." },
    ] });
    if (again.r.ok) out = extractJson((again.j.content || []).filter((c: any) => c.type === "text").map((c: any) => c.text).join(""));
  }
  if (!out) return json({ error: "Réponse IA illisible, réessayez." }, 502);
  return json(out);
});
