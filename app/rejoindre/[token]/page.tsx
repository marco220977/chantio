"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { sb } from "@/lib/supabase";

const frError = (m: string) => /rate limit/i.test(m) ? "Trop d'inscriptions en peu de temps. Réessayez dans une heure (ou demandez au responsable de l'appli d'augmenter la limite)."
  : /registered|already/i.test(m) ? "Un compte existe déjà avec cet e-mail."
  : /password/i.test(m) ? "Mot de passe trop court (6 caractères minimum)." : m;

export default function Rejoindre() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [inv, setInv] = useState<any>(undefined);
  const [name, setName] = useState("");
  const [pwd, setPwd] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    sb().rpc("get_invitation", { p_token: token }).then(({ data }) => { setInv(data || null); setName(data?.full_name || ""); });
  }, [token]);

  async function join(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setMsg("");
    const s = sb();
    await s.auth.signOut();
    const { data, error } = await s.auth.signUp({ email: inv.email, password: pwd, options: { data: { invite_token: token, full_name: name } } });
    setBusy(false);
    if (error) return setMsg(frError(error.message));
    if (!data.session) return setMsg("Compte créé ! Confirmez votre adresse via l'e-mail reçu, puis connectez-vous.");
    router.replace("/app");
  }

  if (inv === undefined) return <p className="p-10 text-center text-slate-400">Chargement…</p>;
  if (!inv) return <p className="p-10 text-center">Invitation introuvable ou annulée.</p>;
  if (inv.accepted) return <div className="p-10 text-center"><p>Cette invitation a déjà été utilisée.</p><a href="/connexion" className="btn-primary mt-4">Se connecter</a></div>;

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-100 to-orange-50 p-5">
      <form onSubmit={join} className="card w-full max-w-sm space-y-4 p-6">
        {inv.logo_url && <img src={inv.logo_url} alt="" className="h-12 object-contain" />}
        <h1 className="text-xl font-extrabold">Rejoindre {inv.company}</h1>
        <p className="text-sm text-slate-600">Vous êtes invité(e) en tant que <b>{inv.role === "technician" ? "technicien" : "superviseur"}</b>.</p>
        <div><label className="label">E-mail</label><input className="input" value={inv.email} disabled /></div>
        <div><label className="label">Prénom et nom</label><input className="input" required value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div><label className="label">Choisissez un mot de passe</label><input className="input" type="password" minLength={6} required value={pwd} onChange={(e) => setPwd(e.target.value)} /></div>
        <label className="flex items-start gap-2 text-xs text-slate-600"><input type="checkbox" required className="mt-0.5" /><span>J'ai lu la <a href="/legal/confidentialite" target="_blank" className="text-brand underline">politique de confidentialité</a>.</span></label>
        {msg && <p className="rounded-lg bg-blue-50 p-3 text-sm text-blue-900">{msg}</p>}
        <button className="btn-brand w-full" disabled={busy}>{busy ? "…" : "Créer mon accès"}</button>
      </form>
    </main>
  );
}
