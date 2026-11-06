"use client";
import { useEffect, useState } from "react";
import { sb } from "@/lib/supabase";
import type { Company } from "@/lib/types";

export default function ReferralCard({ company }: { company: Company }) {
  const co: any = company;
  const [refs, setRefs] = useState<any[]>([]);
  const [copied, setCopied] = useState(false);
  useEffect(() => { sb().from("referrals").select("status, created_at").then(({ data }) => setRefs(data || [])); }, []);
  if (!co.referral_code) return null;
  const link = `${typeof window !== "undefined" ? location.origin : ""}/?parrain=${co.referral_code}`;
  const text = `J'utilise ${process.env.NEXT_PUBLIC_APP_NAME || "Chantio"} pour mes devis, factures et entretiens depuis mon téléphone. Avec mon lien tu as 30 jours d'essai gratuit : ${link}`;
  const paying = refs.filter((r) => r.status !== "inscrit").length;

  async function share() {
    const nav = navigator as any;
    if (nav.share) await nav.share({ title: "Parrainage", text }).catch(() => {});
    else { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2000); }
  }

  return (
    <div className="card space-y-3">
      <h2 className="font-bold">🎁 Parrainage</h2>
      <p className="text-sm text-slate-600">Invitez un autre artisan : il a <b>30 jours d'essai</b>, et vous gagnez <b>1 mois gratuit</b> dès qu'il s'abonne (jusqu'à 12 mois par an).</p>
      <div className="rounded-xl bg-slate-50 p-3 text-center">
        <p className="label">Votre code</p>
        <p className="font-mono text-2xl font-extrabold tracking-widest">{co.referral_code}</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button className="btn-brand" onClick={share}>📤 Partager mon lien</button>
        <a className="btn-ghost" target="_blank" rel="noreferrer" href={`https://wa.me/?text=${encodeURIComponent(text)}`}>💬 WhatsApp</a>
      </div>
      {copied && <p className="text-center text-xs text-green-700">Lien copié</p>}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-slate-50 p-2"><p className="text-xl font-extrabold">{refs.length}</p><p className="text-[11px] text-slate-500">filleul(s) inscrit(s)</p></div>
        <div className="rounded-xl bg-slate-50 p-2"><p className="text-xl font-extrabold">{paying}</p><p className="text-[11px] text-slate-500">abonné(s)</p></div>
        <div className="rounded-xl bg-green-50 p-2"><p className="text-xl font-extrabold text-green-700">{co.referral_months_earned || 0}</p><p className="text-[11px] text-slate-500">mois gagné(s)</p></div>
      </div>
    </div>
  );
}
