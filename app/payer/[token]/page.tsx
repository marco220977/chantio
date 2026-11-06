"use client";
import { Suspense, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/config";
import { eur } from "@/lib/calc";

function Pay() {
  const { token } = useParams<{ token: string }>();
  const ok = useSearchParams().get("ok");
  const [d, setD] = useState<any>(undefined);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => {
    createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } }).rpc("get_payable", { p_token: token }).then(({ data }) => setD(data || null));
  }, [token]);

  async function pay() {
    setBusy(true); setErr("");
    const r = await fetch("/api/pay", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) });
    const j = await r.json().catch(() => ({}));
    if (j.url) location.href = j.url; else { setErr(j.error || "Paiement indisponible"); setBusy(false); }
  }

  if (d === undefined) return <p className="p-10 text-center text-slate-400">Chargement…</p>;
  if (!d) return <p className="p-10 text-center">Document introuvable.</p>;
  const isInv = d.kind === "invoice";
  const amount = isInv ? Number(d.total_ttc) : Math.round(Number(d.total_ttc) * Number(d.deposit_pct)) / 100;
  const done = ok || (isInv ? d.status === "paid" : !!d.deposit_paid_at);

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-100 to-orange-50 p-5">
      <div className="card w-full max-w-sm space-y-4 p-6 text-center">
        {d.logo_url && <img src={d.logo_url} alt="" className="mx-auto h-12 object-contain" />}
        <p className="font-bold">{d.company}</p>
        <p className="text-sm text-slate-500">{isInv ? `Facture n° ${d.number}` : `Acompte de ${d.deposit_pct} % — devis n° ${d.number}`}{d.title ? ` · ${d.title}` : ""}</p>
        <p className="text-4xl font-extrabold">{eur(amount)}</p>
        {done ? (
          <p className="rounded-xl bg-green-50 p-3 text-green-800">✅ Paiement reçu. Merci !{ok ? " Vous allez recevoir un reçu par e-mail." : ""}</p>
        ) : !d.ready ? (
          <p className="text-sm text-slate-600">Le paiement en ligne n'est pas disponible pour cet artisan. Contactez-le pour régler.</p>
        ) : (
          <>
            <button className="btn-brand w-full py-4 text-lg" disabled={busy} onClick={pay}>{busy ? "…" : "💳 Payer par carte"}</button>
            <p className="text-xs text-slate-500">Paiement sécurisé par Stripe. Les fonds sont versés directement à {d.company}.</p>
          </>
        )}
        {err && <p className="text-sm text-red-600">{err}</p>}
      </div>
    </main>
  );
}
export default function Page() { return <Suspense><Pay /></Suspense>; }
