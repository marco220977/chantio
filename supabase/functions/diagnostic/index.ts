const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json" } });

function frError(msg: string, status: number): string {
  const m = (msg || "").toLowerCase();
  if (m.includes("credit balance")) return "Assistant indisponible (crédit IA épuisé). Prévenez l'administrateur de l'appli.";
  if (status === 401 || m.includes("api key")) return "Clé IA invalide. Prévenez l'administrateur de l'appli.";
  if (status === 429) return "Trop de demandes en même temps, réessayez dans une minute.";
  if (status === 529 || m.includes("overloaded")) return "Assistant surchargé, réessayez dans un instant.";
  return "Diagnostic impossible pour le moment, réessayez.";
}

async function subscriptionOk(req: Request): Promise<boolean> {
  try {
    const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/rest/v1/rpc/my_company_has`, {
      method: "POST", body: JSON.stringify({ p_feature: "ia" }),
      headers: { Authorization: req.headers.get("Authorization") || "", apikey: Deno.env.get("SUPABASE_ANON_KEY") || "", "content-type": "application/json" },
    });
    return (await r.json()) !== false;
  } catch { return true; }
}

const PROMPT = (eq: string, code: string, symptoms: string, done: string) => `Tu assistes un technicien qualifié (chauffage, plomberie, eau chaude, ventilation/VMC, climatisation), en France, devant l'appareil en panne. Le champ « code » peut contenir une description de panne au lieu d'un code.

APPAREIL : ${eq || "non précisé"}
CODE ERREUR AFFICHÉ : ${code || "aucun"}
SYMPTÔMES / CONSTATS : ${symptoms || "non précisés"}
DÉJÀ VÉRIFIÉ : ${done || "rien"}

Méthode :
- Si un code erreur est donné, recherche sa signification exacte pour CETTE marque et CE modèle (notice d'installation/entretien du fabricant, sites de pièces détachées, forums de professionnels). Les codes varient d'une marque et d'une génération à l'autre : ne donne pas une signification d'une autre marque.
- Si tu n'es pas certain de la signification, dis-le clairement (fiabilité "faible") plutôt que d'inventer.
- Classe les causes de la plus probable à la moins probable, avec pour chacune des contrôles concrets et mesurables (valeurs attendues : pression, résistance en ohms, tension, courant d'ionisation en µA, etc. quand c'est pertinent).
- Commence par les vérifications simples et sans démontage.
- Sécurité : rappelle les consignes utiles (coupure électrique, gaz, monoxyde de carbone, fluide frigorigène réservé aux personnes avec attestation de capacité). Ne propose jamais de shunter ou désactiver un organe de sécurité.

Réponds UNIQUEMENT avec un JSON, sans texte autour :
{"code_meaning":"signification du code pour cet appareil, ou vide","reliability":"élevée | moyenne | faible","summary":"résumé en une phrase","causes":[{"cause":"","probability":"forte | moyenne | faible","checks":["contrôle 1","contrôle 2"]}],"parts":["pièce à prévoir éventuellement (avec référence si connue)"],"safety":["consigne"],"questions":["information utile à relever si le diagnostic n'est pas concluant"]}`;

// Extrait le premier objet JSON valide d'un texte (ignore le texte autour, les ``` et les citations)
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
        try { const o = JSON.parse(t.slice(i, k + 1)); if (o && typeof o === "object" && ("causes" in o || "summary" in o || "code_meaning" in o)) return o; } catch {}
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
  if (!(await subscriptionOk(req))) return json({ error: "L'intelligence artificielle (devis IA, scan de plaque, diagnostic) est incluse dans les formules Pro et Équipe : Menu → Abonnement." }, 402);
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) return json({ error: "Clé ANTHROPIC_API_KEY manquante" }, 500);
  const { equipment, code, symptoms, done } = await req.json().catch(() => ({}));
  if (!String(code || "").trim() && String(symptoms || "").trim().length < 4) return json({ error: "Indiquez le code erreur ou décrivez la panne." }, 400);
  const model = Deno.env.get("ANTHROPIC_MODEL") || "claude-sonnet-5-5";
  const messages: any[] = [{ role: "user", content: PROMPT(String(equipment || "").slice(0, 400), String(code || "").slice(0, 60), String(symptoms || "").slice(0, 2000), String(done || "").slice(0, 1000)) }];
  const tools = [{ type: "web_search_20250305", name: "web_search", max_uses: 3, user_location: { type: "approximate", country: "FR" } }];
  const blocks: any[] = [];
  // La recherche web peut s'arrêter en "pause_turn" : on relance jusqu'à 3 fois pour obtenir la réponse finale
  for (let turn = 0; turn < 3; turn++) {
    const { r, j } = await callClaude(key, { model, max_tokens: 6000, tools, messages });
    if (!r.ok) { console.error("Anthropic error", r.status, j?.error?.message); return json({ error: frError(j?.error?.message || "", r.status) }, 502); }
    blocks.push(...(j.content || []));
    if (j.stop_reason !== "pause_turn") { console.log("stop_reason", j.stop_reason); break; }
    messages.push({ role: "assistant", content: j.content });
  }
  const sources: { title: string; url: string }[] = [];
  for (const b of blocks) {
    if (b.type === "web_search_tool_result" && Array.isArray(b.content))
      for (const s of b.content) if (s.url && !sources.find((x) => x.url === s.url)) sources.push({ title: s.title || s.url, url: s.url });
  }
  const texts = blocks.filter((b) => b.type === "text").map((b) => b.text as string);
  let out = extractJson(texts.join("")) || extractJson(texts.join("\n"));
  if (!out && texts.join("").trim()) {
    // Dernier recours : on demande de remettre la réponse au format JSON, sans recherche
    const { r, j } = await callClaude(key, { model, max_tokens: 3000, messages: [{ role: "user", content: `Convertis ce diagnostic en JSON strict, sans texte autour, au format :
{"code_meaning":"","reliability":"élevée | moyenne | faible","summary":"","causes":[{"cause":"","probability":"forte | moyenne | faible","checks":[""]}],"parts":[],"safety":[],"questions":[]}

DIAGNOSTIC :
${texts.join("\n").slice(0, 12000)}` }] });
    if (r.ok) out = extractJson((j.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join(""));
  }
  if (!out) { console.error("unparsable", texts.join("").slice(0, 500)); return json({ error: "Réponse illisible, réessayez." }, 502); }
  return json({ ...out, sources: sources.slice(0, 5) });
});
