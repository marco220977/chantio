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
    await admin.from("companies").update({
      plan: active ? "pro" : "canceled", stripe_subscription_id: sub.id,
      cancel_at: sub.cancel_at && active ? new Date(sub.cancel_at * 1000).toISOString() : null,
    }).eq("stripe_customer_id", sub.customer as string);
  }
  return NextResponse.json({ received: true });
}
