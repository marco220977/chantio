import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { sbServer, sbAdmin } from "@/lib/supabase-server";
import { stripe } from "@/lib/stripe";

const PRICE: Record<string, string | undefined> = {
  solo: process.env.STRIPE_PRICE_SOLO || process.env.STRIPE_PRICE_ID, pro: process.env.STRIPE_PRICE_PRO, equipe: process.env.STRIPE_PRICE_EQUIPE,
};

export async function POST(req: Request) {
  const { tier = "solo" } = await req.json().catch(() => ({}));
  const price = PRICE[tier];
  if (!price) return NextResponse.json({ error: "Cette formule n'est pas encore disponible au paiement (prix Stripe à configurer)." }, { status: 503 });
  if (!process.env.STRIPE_SECRET_KEY || !process.env.SUPABASE_SERVICE_ROLE_KEY)
    return NextResponse.json({ error: "Le paiement en ligne n'est pas encore activé sur cette plateforme." }, { status: 503 });
  try {
  const { data: { user } } = await sbServer().auth.getUser();
  if (!user) return NextResponse.json({ error: "Non connecté" }, { status: 401 });
  const admin = sbAdmin();
  const { data: m } = await admin.from("members").select("company_id, companies(*)").eq("user_id", user.id).single();
  const company: any = m?.companies;
  if (!company) return NextResponse.json({ error: "Entreprise introuvable" }, { status: 404 });

  const st = stripe();
  let customer = company.stripe_customer_id;
  if (!customer) {
    const c = await st.customers.create({ email: user.email!, name: company.name, metadata: { company_id: company.id } });
    customer = c.id;
    await admin.from("companies").update({ stripe_customer_id: customer }).eq("id", company.id);
  }
  const url = process.env.NEXT_PUBLIC_APP_URL || headers().get("origin");
  const session = await st.checkout.sessions.create({
    mode: "subscription",
    customer,
    line_items: [{ price, quantity: 1 }],
    client_reference_id: company.id,
    subscription_data: { metadata: { company_id: company.id, tier } },
    allow_promotion_codes: true,
    tax_id_collection: { enabled: true },
    customer_update: { name: "auto", address: "auto" },
    locale: "fr",
    success_url: `${url}/app/abonnement?ok=1`,
    cancel_url: `${url}/app/abonnement`,
  });
  return NextResponse.json({ url: session.url });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: "Erreur Stripe : " + (e?.message || "inconnue") }, { status: 500 });
  }
}
