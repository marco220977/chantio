import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { sbAdmin } from "@/lib/supabase-server";
import { stripe } from "@/lib/stripe";

export async function POST(req: Request) {
  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(body, req.headers.get("stripe-signature")!, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (e: any) {
    return NextResponse.json({ error: `Signature invalide: ${e.message}` }, { status: 400 });
  }
  const admin = sbAdmin();
  if (event.type.startsWith("customer.subscription.")) {
    const sub = event.data.object as Stripe.Subscription;
    const active = ["active", "trialing", "past_due"].includes(sub.status) && event.type !== "customer.subscription.deleted";
    const priceId = sub.items?.data?.[0]?.price?.id;
    const tier = priceId === process.env.STRIPE_PRICE_EQUIPE ? "equipe" : priceId === process.env.STRIPE_PRICE_PRO ? "pro" : "solo";
    await admin.from("companies").update({
      plan: active ? "pro" : "canceled", tier, stripe_subscription_id: sub.id,
      cancel_at: sub.cancel_at && active ? new Date(sub.cancel_at * 1000).toISOString() : null,
    }).eq("stripe_customer_id", sub.customer as string);
  }
  // Parrainage : au premier paiement d'un filleul, le parrain gagne un mois
  if (event.type === "invoice.paid") {
    const inv = event.data.object as Stripe.Invoice;
    if ((inv.amount_paid || 0) > 0 && inv.customer) {
      const { data: referee } = await admin.from("companies").select("id, referred_by").eq("stripe_customer_id", inv.customer as string).maybeSingle();
      if (referee?.referred_by) {
        const { data: ref } = await admin.from("referrals").select("*").eq("referee_id", referee.id).maybeSingle();
        if (ref && ref.status !== "recompense") {
          const { data: parrain } = await admin.from("companies").select("*").eq("id", referee.referred_by).single();
          const yearCount = await admin.from("referrals").select("id", { count: "exact", head: true }).eq("referrer_id", parrain.id).eq("status", "recompense").gte("rewarded_at", new Date(Date.now() - 365 * 86400000).toISOString());
          if ((yearCount.count || 0) < 12) {
            if (parrain.plan === "pro" && parrain.stripe_customer_id) {
              const price = await stripe().prices.retrieve(process.env.STRIPE_PRICE_SOLO || process.env.STRIPE_PRICE_ID!);
              const amount = Math.round((price.unit_amount || 2900) * 1.2); // un mois TTC
              await stripe().customers.createBalanceTransaction(parrain.stripe_customer_id, { amount: -amount, currency: "eur", description: "Parrainage : 1 mois offert" });
            } else {
              const base = Math.max(Date.now(), new Date(parrain.trial_ends_at || Date.now()).getTime());
              await admin.from("companies").update({ trial_ends_at: new Date(base + 30 * 86400000).toISOString() }).eq("id", parrain.id);
            }
            await admin.from("companies").update({ referral_months_earned: (parrain.referral_months_earned || 0) + 1 }).eq("id", parrain.id);
            await admin.from("referrals").update({ status: "recompense", rewarded_at: new Date().toISOString() }).eq("id", ref.id);
          } else {
            await admin.from("referrals").update({ status: "payant" }).eq("id", ref.id);
          }
        }
      }
    }
  }

  // Paiement en ligne d'une facture / d'un acompte par le client d'un abonné (Stripe Connect)
  if (event.type === "checkout.session.completed") {
    const cs = event.data.object as Stripe.Checkout.Session;
    const docId = cs.metadata?.document_id;
    if (docId && cs.payment_status === "paid") {
      const { data: doc } = await admin.from("documents").select("id, kind, status, company_id").eq("id", docId).single();
      if (doc?.kind === "invoice" && doc.status === "issued") {
        await admin.from("documents").update({ status: "paid", paid_at: new Date().toISOString(), payment_method: "Carte bancaire (en ligne)", online_paid_at: new Date().toISOString() }).eq("id", docId);
      } else if (doc?.kind === "quote") {
        await admin.from("documents").update({ deposit_paid_at: new Date().toISOString() }).eq("id", docId);
      }
    }
  }
  if (event.type === "account.updated") {
    const acc = event.data.object as Stripe.Account;
    await admin.from("companies").update({ stripe_account_ready: !!(acc.charges_enabled && acc.details_submitted) }).eq("stripe_account_id", acc.id);
  }

  return NextResponse.json({ received: true });
}
