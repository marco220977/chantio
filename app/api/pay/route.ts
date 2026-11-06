import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/config";
import { stripe } from "@/lib/stripe";

// Création d'une session de paiement Stripe sur le compte de l'artisan (facture ou acompte de devis)
export async function POST(req: Request) {
  if (!process.env.STRIPE_SECRET_KEY) return NextResponse.json({ error: "Paiement en ligne indisponible." }, { status: 503 });
  const { token } = await req.json();
  const s = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: d } = await s.rpc("get_payable", { p_token: token });
  if (!d) return NextResponse.json({ error: "Document introuvable" }, { status: 404 });
  if (!d.ready || !d.account) return NextResponse.json({ error: "Cet artisan n'accepte pas encore le paiement en ligne." }, { status: 400 });

  let amount = 0, label = "";
  if (d.kind === "invoice") {
    if (d.status !== "issued") return NextResponse.json({ error: d.status === "paid" ? "Cette facture est déjà réglée." : "Facture non payable." }, { status: 400 });
    amount = Number(d.total_ttc); label = `Facture ${d.number}`;
  } else {
    if (!Number(d.deposit_pct) || d.deposit_paid_at) return NextResponse.json({ error: d.deposit_paid_at ? "L'acompte est déjà réglé." : "Aucun acompte demandé." }, { status: 400 });
    amount = Math.round(Number(d.total_ttc) * Number(d.deposit_pct)) / 100; label = `Acompte ${d.deposit_pct} % — devis ${d.number}`;
  }
  const cents = Math.round(amount * 100);
  if (cents < 50) return NextResponse.json({ error: "Montant trop faible pour un paiement par carte." }, { status: 400 });
  const fee = Math.round(cents * (Number(process.env.PLATFORM_FEE_PCT) || 0) / 100);
  const origin = process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin;
  try {
    const session = await stripe().checkout.sessions.create({
      mode: "payment", locale: "fr", customer_email: d.client_email || undefined,
      line_items: [{ quantity: 1, price_data: { currency: "eur", unit_amount: cents, product_data: { name: `${label} — ${d.company}` } } }],
      payment_intent_data: { description: `${label} — ${d.client_name || ""}`, ...(fee ? { application_fee_amount: fee } : {}), metadata: { document_id: d.id } },
      metadata: { document_id: d.id },
      success_url: `${origin}/payer/${token}?ok=1`, cancel_url: `${origin}/payer/${token}`,
    }, { stripeAccount: d.account });
    return NextResponse.json({ url: session.url });
  } catch (e: any) {
    return NextResponse.json({ error: "Paiement indisponible : " + (e?.message || "erreur") }, { status: 500 });
  }
}
