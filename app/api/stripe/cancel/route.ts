import { NextResponse } from "next/server";
import { sbServer, sbAdmin } from "@/lib/supabase-server";
import { stripe } from "@/lib/stripe";

export async function POST(req: Request) {
  if (!process.env.STRIPE_SECRET_KEY || !process.env.SUPABASE_SERVICE_ROLE_KEY)
    return NextResponse.json({ error: "Le paiement en ligne n'est pas encore activé sur cette plateforme." }, { status: 503 });
  try {
    const { data: { user } } = await sbServer().auth.getUser();
    if (!user) return NextResponse.json({ error: "Non connecté" }, { status: 401 });
    const { resume } = await req.json().catch(() => ({ resume: false }));
    const admin = sbAdmin();
    const { data: m } = await admin.from("members").select("company_id, companies(stripe_subscription_id)").eq("user_id", user.id).single();
    const subId = (m?.companies as any)?.stripe_subscription_id;
    if (!subId) return NextResponse.json({ error: "Aucun abonnement actif." }, { status: 400 });
    const sub = await stripe().subscriptions.update(subId, { cancel_at_period_end: !resume });
    const cancel_at = sub.cancel_at ? new Date(sub.cancel_at * 1000).toISOString() : null;
    await admin.from("companies").update({ cancel_at }).eq("id", m!.company_id);
    return NextResponse.json({ ok: true, cancel_at });
  } catch (e: any) {
    return NextResponse.json({ error: "Erreur Stripe : " + (e?.message || "inconnue") }, { status: 500 });
  }
}
