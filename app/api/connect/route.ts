import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { sbServer, sbAdmin } from "@/lib/supabase-server";
import { stripe } from "@/lib/stripe";

// Connexion du compte Stripe de l'abonné (Stripe Connect Express) pour encaisser ses clients en ligne
export async function POST(req: Request) {
  if (!process.env.STRIPE_SECRET_KEY || !process.env.SUPABASE_SERVICE_ROLE_KEY)
    return NextResponse.json({ error: "Le paiement en ligne n'est pas encore activé sur la plateforme." }, { status: 503 });
  try {
    const { data: { user } } = await sbServer().auth.getUser();
    if (!user) return NextResponse.json({ error: "Non connecté" }, { status: 401 });
    const { action } = await req.json().catch(() => ({ action: "onboard" }));
    const admin = sbAdmin();
    const { data: m } = await admin.from("members").select("role, company_id, companies(*)").eq("user_id", user.id).single();
    if (!m || m.role === "technician") return NextResponse.json({ error: "Réservé au superviseur" }, { status: 403 });
    const co: any = m.companies;
    const st = stripe();
    const origin = process.env.NEXT_PUBLIC_APP_URL || headers().get("origin");

    let acct = co.stripe_account_id;
    if (!acct) {
      const a = await st.accounts.create({ type: "express", country: "FR", email: co.email || user.email || undefined,
        business_profile: { name: co.name, mcc: "1711", product_description: "Travaux de plomberie et chauffage" },
        capabilities: { card_payments: { requested: true }, transfers: { requested: true } }, metadata: { company_id: co.id } });
      acct = a.id;
      await admin.from("companies").update({ stripe_account_id: acct }).eq("id", co.id);
    }
    if (action === "status") {
      const a = await st.accounts.retrieve(acct);
      const ready = !!(a.charges_enabled && a.details_submitted);
      await admin.from("companies").update({ stripe_account_ready: ready }).eq("id", co.id);
      return NextResponse.json({ ready });
    }
    if (action === "dashboard") {
      const l = await st.accounts.createLoginLink(acct);
      return NextResponse.json({ url: l.url });
    }
    const link = await st.accountLinks.create({ account: acct, type: "account_onboarding",
      refresh_url: `${origin}/app/parametres?stripe=refresh#paiement`, return_url: `${origin}/app/parametres?stripe=retour#paiement` });
    return NextResponse.json({ url: link.url });
  } catch (e: any) {
    return NextResponse.json({ error: "Stripe : " + (e?.message || "erreur") }, { status: 500 });
  }
}
