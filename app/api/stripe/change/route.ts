import { NextResponse } from "next/server";
import { sbServer, sbAdmin } from "@/lib/supabase-server";
import { stripe } from "@/lib/stripe";

// Changement de formule d'un abonné (prorata automatique)
const PRICE: Record<string, string | undefined> = {
  solo: process.env.STRIPE_PRICE_SOLO || process.env.STRIPE_PRICE_ID, pro: process.env.STRIPE_PRICE_PRO, equipe: process.env.STRIPE_PRICE_EQUIPE,
};

export async function POST(req: Request) {
  if (!process.env.STRIPE_SECRET_KEY || !process.env.SUPABASE_SERVICE_ROLE_KEY)
    return NextResponse.json({ error: "Le paiement en ligne n'est pas encore activé sur cette plateforme." }, { status: 503 });
  const { tier } = await req.json().catch(() => ({}));
  const price = PRICE[tier];
  if (!price) return NextResponse.json({ error: "Formule indisponible." }, { status: 400 });
  try {
    const { data: { user } } = await sbServer().auth.getUser();
    if (!user) return NextResponse.json({ error: "Non connecté" }, { status: 401 });
    const admin = sbAdmin();
    const { data: m } = await admin.from("members").select("role, companies(*)").eq("user_id", user.id).single();
    const company: any = m?.companies;
    if (!company || m?.role !== "owner") return NextResponse.json({ error: "Seul le responsable du compte peut changer de formule." }, { status: 403 });
    if (company.plan !== "pro" || !company.stripe_subscription_id) return NextResponse.json({ error: "Aucun abonnement actif." }, { status: 400 });
    if (tier === "solo" || (tier === "pro" && company.tier === "equipe")) {
      const lim = tier === "solo" ? 1 : 2;
      const { count } = await admin.from("members").select("user_id", { count: "exact", head: true }).eq("company_id", company.id);
      if ((count || 0) > lim) return NextResponse.json({ error: `La formule choisie permet ${lim} utilisateur${lim > 1 ? "s" : ""} : retirez d'abord des membres de l'équipe (Menu → Équipe).` }, { status: 400 });
    }
    const st = stripe();
    const sub = await st.subscriptions.retrieve(company.stripe_subscription_id);
    await st.subscriptions.update(sub.id, { items: [{ id: sub.items.data[0].id, price }], proration_behavior: "create_prorations", metadata: { ...sub.metadata, tier } });
    await admin.from("companies").update({ tier }).eq("id", company.id);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: "Erreur Stripe : " + (e?.message || "inconnue") }, { status: 500 });
  }
}
