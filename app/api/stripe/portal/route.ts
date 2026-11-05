import { NextResponse } from "next/server";
import { sbServer, sbAdmin } from "@/lib/supabase-server";
import { stripe } from "@/lib/stripe";

export async function POST() {
  const { data: { user } } = await sbServer().auth.getUser();
  if (!user) return NextResponse.json({ error: "Non connecté" }, { status: 401 });
  const { data: m } = await sbAdmin().from("members").select("companies(stripe_customer_id)").eq("user_id", user.id).single();
  const customer = (m?.companies as any)?.stripe_customer_id;
  if (!customer) return NextResponse.json({ error: "Aucun abonnement" }, { status: 400 });
  const s = await stripe().billingPortal.sessions.create({ customer, return_url: `${process.env.NEXT_PUBLIC_APP_URL}/app/abonnement` });
  return NextResponse.json({ url: s.url });
}
