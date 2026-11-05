"use client";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/config";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { computeTotals, dateFr, eur } from "@/lib/calc";
import { downloadPdf } from "@/lib/pdf";
import SignaturePad from "@/components/SignaturePad";
import type { Company, Doc } from "@/lib/types";

const anon = () => createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });

export default function Signer() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<{ doc: Doc; company: Company } | null | false>(null);
  const [signing, setSigning] = useState(false);

  const load = () => anon().rpc("get_public_quote", { p_token: token }).then(({ data }) => setData(data || false));
  useEffect(() => { load(); }, [token]);

  if (data === null) return <p className="p-10 text-center text-slate-400">Chargement…</p>;
  if (data === false) return <p className="p-10 text-center">Devis introuvable.</p>;
  const { doc, company } = data;
  const t = computeTotals(doc.lines, doc.discount_pct, company.vat_exempt);
  const expired = doc.valid_until && doc.valid_until < new Date().toISOString().slice(0, 10);
  const canSign = ["draft", "sent"].includes(doc.status) && !expired;

  return (
    <main className="mx-auto max-w-xl space-y-4 p-4 pb-10">
      <header className="flex items-center gap-3 pt-2">
        {company.logo_url && <img src={company.logo_url} alt="" className="h-12 w-20 object-contain" />}
        <div><p className="font-extrabold">{company.name}</p><p className="text-xs text-slate-500">{[company.phone, company.email].filter(Boolean).join(" · ")}</p></div>
      </header>
      <div className="card">
        <p className="label">Devis n° {doc.number} · {dateFr(doc.issue_date)}</p>
        <h1 className="text-xl font-extrabold">{doc.title || "Devis"}</h1>
        <p className="text-sm text-slate-500">Pour {doc.client_snapshot?.name}{doc.site_address ? ` — ${doc.site_address}` : ""}</p>
        {doc.valid_until && <p className="text-xs text-slate-500">Valable jusqu'au {dateFr(doc.valid_until)}</p>}
      </div>
      <div className="card space-y-2">
        {doc.lines.map((l, i) => (
          <div key={i} className="flex justify-between gap-3 border-b border-slate-100 pb-2 text-sm">
            <div><p className="font-semibold">{l.label}</p>{l.description && <p className="text-slate-500">{l.description}</p>}<p className="text-xs text-slate-400">{l.qty} {l.unit} × {eur(l.unit_price)} HT</p></div>
            <p className="whitespace-nowrap font-semibold">{eur(Number(l.qty) * Number(l.unit_price))}</p>
          </div>
        ))}
        <div className="flex justify-between text-sm"><span>Total HT</span><span>{eur(t.ht)}</span></div>
        {!company.vat_exempt && <div className="flex justify-between text-sm"><span>TVA</span><span>{eur(t.vat)}</span></div>}
        <div className="flex justify-between text-xl font-extrabold"><span>Total TTC</span><span>{eur(t.ttc)}</span></div>
        {!!doc.deposit_pct && <p className="text-sm text-slate-600">Acompte à la commande : {eur((t.ttc * Number(doc.deposit_pct)) / 100)} ({doc.deposit_pct} %)</p>}
      </div>
      <button className="btn-ghost w-full" onClick={() => downloadPdf(doc, company)}>⬇️ Télécharger le devis PDF</button>

      {doc.signed_at ? (
        <div className="card bg-green-50 text-center text-green-800">✅ Devis signé par {doc.signer_name} le {new Date(doc.signed_at).toLocaleString("fr-FR")}. Merci !</div>
      ) : expired ? (
        <div className="card text-center text-slate-600">Ce devis a expiré. Contactez {company.name} pour une nouvelle proposition.</div>
      ) : doc.status === "refused" ? (
        <div className="card text-center text-slate-600">Ce devis a été refusé.</div>
      ) : canSign && (
        signing ? (
          <div className="card"><SignaturePad defaultName={doc.client_snapshot?.name || ""} onCancel={() => setSigning(false)}
            onDone={async (name, sig) => { await anon().rpc("sign_public_quote", { p_token: token, p_name: name, p_signature: sig }); setSigning(false); load(); }} /></div>
        ) : (
          <button className="btn-brand w-full py-4 text-lg" onClick={() => setSigning(true)}>✍️ Accepter et signer</button>
        )
      )}
      <p className="text-center text-xs text-slate-400">Signature électronique horodatée.</p>
    </main>
  );
}
