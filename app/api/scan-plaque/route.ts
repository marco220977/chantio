import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/config";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 60;

const PROMPT = `Tu analyses la photo d'une plaque signalétique d'appareil de chauffage ou sanitaire (chaudière, pompe à chaleur, chauffe-eau, ballon, climatiseur).
Réponds UNIQUEMENT avec un objet JSON, sans texte autour, avec ces clés (chaînes, vides si illisible) :
{"brand":"","model":"","type":"chaudière gaz condensation | PAC air/eau | chauffe-eau ...","energy":"gaz naturel | propane | fioul | électricité | ...","power_kw":"ex. 24 kW","serial_number":"","year":"année de fabrication si déductible","other":"infos utiles : catégorie gaz, pression, fluide frigorigène, capacité...","confidence":"high | medium | low"}
Si l'image n'est pas une plaque signalétique, renvoie confidence "low" et explique dans "other".`;

export async function POST(req: Request) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  const s = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data: { user } } = await s.auth.getUser(token);
  if (!user) return NextResponse.json({ error: "Non connecté" }, { status: 401 });
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: "Clé ANTHROPIC_API_KEY manquante" }, { status: 500 });

  const { image } = await req.json();
  const m = /^data:(image\/\w+);base64,(.+)$/.exec(image || "");
  if (!m) return NextResponse.json({ error: "Image invalide" }, { status: 400 });

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5",
      max_tokens: 800,
      messages: [{ role: "user", content: [
        { type: "image", source: { type: "base64", media_type: m[1], data: m[2] } },
        { type: "text", text: PROMPT },
      ] }],
    }),
  });
  const j = await r.json();
  if (!r.ok) return NextResponse.json({ error: j.error?.message || "Erreur IA" }, { status: 502 });
  const txt: string = j.content?.find((c: any) => c.type === "text")?.text || "{}";
  try {
    return NextResponse.json(JSON.parse(txt.slice(txt.indexOf("{"), txt.lastIndexOf("}") + 1)));
  } catch {
    return NextResponse.json({ other: txt, confidence: "low" });
  }
}
