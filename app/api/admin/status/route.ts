import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/config";

export const dynamic = "force-dynamic";

// État des services connectés (réservé à l'administrateur) : aucune clé n'est renvoyée, seulement présente / absente / fonctionne
export async function GET(req: Request) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Non connecté" }, { status: 401 });
  const s = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } });
  const { data: admin } = await s.rpc("is_platform_admin");
  if (!admin) return NextResponse.json({ error: "Réservé à l'administrateur" }, { status: 403 });

  const has = (k: string) => !!process.env[k];
  // Test réel d'OpenRouteService : trajet Créteil → Maisons-Alfort
  let ors: "ok" | "absent" | "erreur" = "absent"; let orsMsg = "";
  if (has("ORS_API_KEY")) {
    try {
      const r = await fetch("https://api.openrouteservice.org/v2/matrix/driving-car", {
        method: "POST", headers: { Authorization: process.env.ORS_API_KEY!, "content-type": "application/json" },
        body: JSON.stringify({ locations: [[2.455, 48.79], [2.44, 48.80]], metrics: ["duration"] }), cache: "no-store",
      });
      if (r.ok) { const j = await r.json(); ors = "ok"; orsMsg = `test : ${Math.round((j.durations?.[0]?.[1] || 0) / 60)} min de route Créteil → Maisons-Alfort`; }
      else { ors = "erreur"; orsMsg = r.status === 403 || r.status === 401 ? "clé refusée par OpenRouteService" : `réponse ${r.status}`; }
    } catch { ors = "erreur"; orsMsg = "service injoignable"; }
  }
  const stripePrices = ["STRIPE_PRICE_SOLO", "STRIPE_PRICE_PRO", "STRIPE_PRICE_EQUIPE"].filter(has).length + (!has("STRIPE_PRICE_SOLO") && has("STRIPE_PRICE_ID") ? 1 : 0);
  const stripeMode = (process.env.STRIPE_SECRET_KEY || "").startsWith("sk_live") ? "réel" : has("STRIPE_SECRET_KEY") ? "test" : "";
  return NextResponse.json({ items: [
    { k: "Itinéraires (OpenRouteService)", ok: ors === "ok", warn: ors === "absent", msg: ors === "ok" ? `✅ routes réelles — ${orsMsg}` : ors === "erreur" ? `❌ ${orsMsg}` : "⚠️ clé ORS_API_KEY absente : temps de trajet estimés à vol d'oiseau" },
    { k: "Paiement des abonnements (Stripe)", ok: has("STRIPE_SECRET_KEY") && has("STRIPE_WEBHOOK_SECRET") && stripePrices === 3 && has("SUPABASE_SERVICE_ROLE_KEY"),
      msg: !has("STRIPE_SECRET_KEY") ? "⚠️ non configuré (STRIPE_SECRET_KEY absente)"
        : [`mode ${stripeMode}`, has("STRIPE_WEBHOOK_SECRET") ? "webhook ✅" : "webhook ❌ (STRIPE_WEBHOOK_SECRET)", `prix des formules ${stripePrices}/3`, has("SUPABASE_SERVICE_ROLE_KEY") ? "" : "clé service Supabase ❌"].filter(Boolean).join(" · ") },
    { k: "E-mails et SMS (Brevo)", ok: has("BREVO_API_KEY") && has("EMAIL_FROM"), msg: has("BREVO_API_KEY") ? (has("EMAIL_FROM") ? "✅ configuré" : "⚠️ EMAIL_FROM absent") : "❌ BREVO_API_KEY absente : aucun e-mail ni SMS envoyé" },
    { k: "Clé service Supabase", ok: has("SUPABASE_SERVICE_ROLE_KEY"), msg: has("SUPABASE_SERVICE_ROLE_KEY") ? "✅ présente" : "⚠️ absente (paiements Stripe, tâches automatiques)" },
    { k: "Facture électronique (plateforme agréée)", ok: has("EINVOICE_API_URL") && has("EINVOICE_API_KEY"), msg: has("EINVOICE_API_URL") ? "✅ configurée" : "⚠️ non configurée (dépôt par la plateforme de l'artisan)" },
    { k: "Adresse du site", ok: has("NEXT_PUBLIC_APP_URL"), msg: process.env.NEXT_PUBLIC_APP_URL || "⚠️ NEXT_PUBLIC_APP_URL absente" },
  ], note: "L'intelligence artificielle (clé Anthropic) est réglée dans Supabase : son état se voit à l'usage (devis IA, scan, diagnostic)." });
}
