"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { sb } from "@/lib/supabase";

const frError = (m: string) => /rate limit/i.test(m) ? "Trop d'inscriptions en peu de temps. Réessayez dans une heure (ou demandez au responsable de l'appli d'augmenter la limite)."
  : /registered|already/i.test(m) ? "Un compte existe déjà avec cet e-mail."
  : /sending.*(confirmation|email)|smtp/i.test(m) ? "L'e-mail de confirmation n'a pas pu être envoyé. Réessayez dans quelques minutes ; si ça continue, contactez-nous."
  : /invalid.*email|email.*invalid/i.test(m) ? "Adresse e-mail invalide."
  : /password/i.test(m) ? "Mot de passe trop court (6 caractères minimum)." : m;

function Form() {
  const params = useSearchParams();
  const router = useRouter();
  const [signup, setSignup] = useState(params.get("mode") === "signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [company, setCompany] = useState("");
  const [name, setName] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [accept, setAccept] = useState(false);
  const parrain = (params.get("parrain") || "").toUpperCase();
  const [parrainName, setParrainName] = useState("");
  useEffect(() => { if (parrain) sb().rpc("referral_info", { p_code: parrain }).then(({ data }) => setParrainName(data?.name || "")); }, [parrain]);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setMsg("");
    const s = sb();
    if (signup) {
      const { data, error } = await s.auth.signUp({
        email, password,
        options: { data: { company_name: company, full_name: name, ...(parrainName ? { referral_code: parrain } : {}) }, emailRedirectTo: `${location.origin}/app` },
      });
      if (error) setMsg(frError(error.message));
      // Adresse déjà inscrite : Supabase renvoie un faux succès sans identité
      else if (data.user && (data.user.identities?.length ?? 0) === 0)
        setMsg(`Cette adresse e-mail a déjà un compte${parrainName ? " : le parrainage ne s'applique qu'aux nouveaux comptes" : ""}. Connectez-vous avec « J'ai déjà un compte » (ou « Mot de passe oublié »).`);
      else if (!data.session) setMsg("Compte créé ! Confirmez votre adresse via l'e-mail reçu, puis connectez-vous.");
      else router.replace("/app/parametres?bienvenue=1");
    } else {
      const { error } = await s.auth.signInWithPassword({ email, password });
      if (error) setMsg("E-mail ou mot de passe incorrect.");
      else router.replace("/app");
    }
    setBusy(false);
  }

  async function reset() {
    if (!email) return setMsg("Saisissez votre e-mail d'abord.");
    await sb().auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/app/parametres` });
    setMsg("E-mail de réinitialisation envoyé.");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-100 to-orange-50 p-5">
      <form onSubmit={submit} className="card w-full max-w-sm space-y-4 p-6">
        <h1 className="text-2xl font-extrabold">{signup ? "Créer mon compte" : "Connexion"}</h1>
        {signup && parrainName && <p className="rounded-lg bg-green-50 p-3 text-sm text-green-800">🎁 Invité par <b>{parrainName}</b> : <b>30 jours d'essai gratuit</b> au lieu de 14.</p>}
        {signup && (
          <>
            <div><label className="label">Nom de l'entreprise</label><input className="input" required value={company} onChange={(e) => setCompany(e.target.value)} /></div>
            <div><label className="label">Votre nom</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></div>
          </>
        )}
        <div><label className="label">E-mail</label><input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <div><label className="label">Mot de passe</label><input className="input" type="password" minLength={6} required value={password} onChange={(e) => setPassword(e.target.value)} /></div>
        {signup && (
          <label className="flex items-start gap-2 text-xs text-slate-600">
            <input type="checkbox" className="mt-0.5" checked={accept} onChange={(e) => setAccept(e.target.checked)} />
            <span>J'accepte les <a href="/legal/cgv" target="_blank" className="text-brand underline">conditions générales</a>, l'<a href="/legal/sous-traitance" target="_blank" className="text-brand underline">accord de sous-traitance</a> et la <a href="/legal/confidentialite" target="_blank" className="text-brand underline">politique de confidentialité</a>.</span>
          </label>
        )}
        {msg && <p className="rounded-lg bg-blue-50 p-3 text-sm text-blue-900">{msg}</p>}
        <button className="btn-primary w-full" disabled={busy || (signup && !accept)}>{busy ? "…" : signup ? "Créer mon compte" : "Se connecter"}</button>
        <button type="button" className="w-full text-sm text-brand" onClick={() => setSignup(!signup)}>
          {signup ? "J'ai déjà un compte" : "Pas encore de compte ? Essai gratuit"}
        </button>
        {!signup && <button type="button" className="w-full text-xs text-slate-500" onClick={reset}>Mot de passe oublié</button>}
      </form>
    </main>
  );
}

export default function Page() { return <Suspense><Form /></Suspense>; }
