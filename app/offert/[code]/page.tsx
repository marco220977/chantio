"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { sb } from "@/lib/supabase";
import { LEGAL } from "@/lib/legal";

// Lien d'accès offert à l'application
export default function Offert() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();
  const [info, setInfo] = useState<{ valid: boolean; months: number | null } | null | false>(null);
  const [logged, setLogged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    sb().rpc("gift_info", { p_code: code }).then(({ data }) => setInfo(data || false));
    sb().auth.getSession().then(({ data }) => setLogged(!!data.session));
  }, [code]);

  async function activate() {
    setBusy(true); setMsg("");
    const { error } = await sb().rpc("redeem_gift", { p_code: code });
    setBusy(false);
    if (error) return setMsg(error.message);
    setDone(true);
  }

  const what = info && info.months ? `pendant ${info.months} mois` : "sans limite de durée";
  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-100 to-orange-50 p-5">
      <div className="card w-full max-w-sm space-y-4 p-6 text-center">
        <p className="text-5xl">🎁</p>
        <h1 className="text-2xl font-extrabold">{LEGAL.app} vous est offert</h1>
        {info === null && <p className="text-slate-400">Chargement…</p>}
        {info === false || (info && !info.valid) ? (
          <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Ce lien n'est plus valable (déjà utilisé, désactivé ou expiré).</p>
        ) : info && (
          done ? (
            <>
              <p className="rounded-lg bg-green-50 p-3 text-sm text-green-800">✅ Accès offert activé {what}. Toutes les fonctionnalités sont disponibles.</p>
              <button className="btn-brand w-full" onClick={() => router.replace("/app")}>Ouvrir l'application</button>
            </>
          ) : (
            <>
              <p className="text-slate-600">Devis, factures, planning, SAV, entretien, chantiers… : accès complet à l'application, <b>{what}</b>, sans abonnement ni carte bancaire.</p>
              {logged ? (
                <button className="btn-brand w-full" disabled={busy} onClick={activate}>{busy ? "Activation…" : "Activer sur mon compte"}</button>
              ) : (
                <div className="space-y-2">
                  <Link className="btn-brand block w-full" href={`/connexion?mode=signup&offert=${code}`}>Créer mon compte</Link>
                  <Link className="btn-ghost block w-full" href={`/connexion?offert=${code}`}>J'ai déjà un compte</Link>
                </div>
              )}
              {msg && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{msg}</p>}
            </>
          )
        )}
      </div>
    </main>
  );
}
