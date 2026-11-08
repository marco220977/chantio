const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const PROMPT = `Tu analyses la photo d'une plaque signalétique d'appareil de chauffage ou sanitaire (chaudière, pompe à chaleur, chauffe-eau, ballon, climatiseur, radiateur).
Réponds UNIQUEMENT avec un objet JSON, sans texte autour, avec ces clés (chaînes, vides si illisible) :
{"brand":"","model":"","type":"chaudière gaz condensation | PAC air/eau | chauffe-eau électrique | radiateur électrique ...","energy":"gaz naturel | propane | fioul | électricité | ...","power_kw":"ex. 24 kW ou 2000 W","serial_number":"","year":"année de fabrication si déductible","other":"infos utiles : tension, intensité, IP, catégorie gaz, pression, fluide frigorigène, capacité, poids...","confidence":"high | medium | low"}
Si l'image n'est pas une plaque signalétique, renvoie confidence "low" et explique dans "other".`;

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json" } });

function frError(msg: string, status: number): string {
  const m = (msg || "").toLowerCase();
  if (m.includes("credit balance")) return "Service de lecture des plaques momentanément indisponible (crédit IA épuisé). Prévenez l'administrateur de l'appli.";
  if (status === 401 || m.includes("api key") || m.includes("authentication")) return "Clé IA invalide. Prévenez l'administrateur de l'appli.";
  if (status === 429 || m.includes("rate limit")) return "Trop de lectures en même temps, réessayez dans une minute.";
  if (status === 529 || m.includes("overloaded")) return "Service de lecture surchargé, réessayez dans un instant.";
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (!(await subscriptionOk(req))) return json({ error: "L'intelligence artificielle (devis IA, scan de plaque, diagnostic) est incluse dans les formules Pro et Équipe : Menu → Abonnement." }, 402);
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) return json({ error: "Clé ANTHROPIC_API_KEY manquante (Supabase > Edge Functions > Secrets)" }, 500);
  const { image } = await req.json().catch(() => ({}));
  const m = /^data:(image\/\w+);base64,(.+)$/.exec(image || "");
  if (!m) return json({ error: "Image invalide" }, 400);
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: Deno.env.get("ANTHROPIC_MODEL") || "claude-sonnet-5-5",
      max_tokens: 800,
      messages: [{ role: "user", content: [
        { type: "image", source: { type: "base64", media_type: m[1], data: m[2] } },
        { type: "text", text: PROMPT },
      ] }],
    }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    console.error("Anthropic error", r.status, j?.error?.message);
    return json({ error: frError(j?.error?.message || "", r.status) }, 502);
  }
  const txt: string = j.content?.find((c: any) => c.type === "text")?.text || "{}";
  try {
    return json(JSON.parse(txt.slice(txt.indexOf("{"), txt.lastIndexOf("}") + 1)));
  } catch {
    return json({ other: txt, confidence: "low" });
  }
});
