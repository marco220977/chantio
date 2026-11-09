"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { sb } from "@/lib/supabase";
import { useCompany } from "@/components/CompanyContext";
import Header from "@/components/Header";
import NumberingSection from "@/components/NumberingSection";
import EInvoiceSettings from "@/components/EInvoiceSettings";
import AutomationSettings from "@/components/AutomationSettings";
import PaymentSettings from "@/components/PaymentSettings";
import SiretField from "@/components/SiretField";
import type { Company } from "@/lib/types";

function Settings() {
  const { company, reload, isSup, me } = useCompany();
  const [myName, setMyName] = useState("");
  useEffect(() => { setMyName(me?.full_name || ""); }, [me]);
  const welcome = useSearchParams().get("bienvenue");
  const [c, setC] = useState<Partial<Company>>({});
  const [msg, setMsg] = useState("");
  const [pwd, setPwd] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState("");
  const router = useRouter();

  async function deleteAccount() {
    if (confirmText.trim().toUpperCase() !== "SUPPRIMER") return;
    if (!confirm("Dernière confirmation : toutes vos données seront définitivement effacées. Continuer ?")) return;
    const s = sb();
    try {
      setDeleting("Suppression des photos…");
      const paths: string[] = [];
      const { data: entries } = await s.from("chantier_entries").select("photos");
      (entries || []).forEach((e: any) => paths.push(...(e.photos || [])));
      const { data: sav } = await s.from("sav_tickets").select("photos");
      (sav || []).forEach((e: any) => paths.push(...(e.photos || [])));
      for (let i = 0; i < paths.length; i += 100) await s.storage.from("chantiers").remove(paths.slice(i, i + 100));
      const { data: logos } = await s.storage.from("logos").list(company!.id);
      if (logos?.length) await s.storage.from("logos").remove(logos.map((f: any) => `${company!.id}/${f.name}`));
      setDeleting("Suppression du compte…");
      const { error } = await s.rpc("delete_my_account");
      if (error) throw error;
      await s.auth.signOut();
      router.replace("/?compte=supprime");
    } catch (e: any) {
      setDeleting("");
      setMsg(e.message || "Erreur lors de la suppression");
    }
  }
  useEffect(() => { if (company) setC(company); }, [company]);

  const F = ({ k, label, ph, type = "text", hint }: { k: keyof Company; label: string; ph?: string; type?: string; hint?: string }) => (
    <div>
      <label className="label">{label}</label>
      <input className="input" type={type} placeholder={ph} value={(c as any)[k] ?? ""} onChange={(e) => setC({ ...c, [k]: type === "number" ? Number(e.target.value) : e.target.value })} />
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );

  async function save() {
    // Changement d'entreprise (SIREN différent) : confirmation avant d'enregistrer
    const siren = (v?: string | null) => String(v || "").replace(/\D/g, "").slice(0, 9);
    const oldS = siren(company?.siret), newS = siren(c.siret);
    if (oldS.length === 9 && newS.length === 9 && oldS !== newS) {
      const paying = company?.plan === "pro" || company?.plan === "free";
      const { data: used } = paying ? { data: false } : await sb().rpc("siren_trial_used", { p_siret: newS });
      const left = Math.ceil((new Date(company?.trial_ends_at || 0).getTime() - Date.now()) / 86400000);
      const trialMsg = paying ? "Votre formule actuelle reste inchangée."
        : used ? "⚠️ Cette entreprise a déjà bénéficié d'un essai gratuit : l'essai s'arrête dès l'enregistrement et l'abonnement est à payer pour continuer."
        : left > 0 ? `Vous gardez le temps d'essai restant (${left} jour${left > 1 ? "s" : ""}, jusqu'au ${new Date(company!.trial_ends_at!).toLocaleDateString("fr-FR")}), sans nouvel essai : l'abonnement sera à payer à la fin de cette période.`
        : "Votre essai est terminé : l'abonnement est nécessaire pour continuer.";
      const ok = confirm(`🏢 Ce SIRET correspond à une AUTRE ENTREPRISE (SIREN ${newS} au lieu de ${oldS}).\n\nElle sera considérée comme une nouvelle entreprise :\n• ${trialMsg}\n• Vos clients, devis et factures restent dans ce compte ; les prochains documents porteront les informations de la nouvelle entreprise.\n\nConfirmer le changement d'entreprise ?`);
      if (!ok) return;
    }
    const { id, plan, trial_ends_at, ...rest } = c as any;
    delete rest.stripe_customer_id; delete rest.stripe_subscription_id; delete rest.created_at;
    for (const k of ["rge_valid_until"]) if (rest[k] === "") rest[k] = null;
    const { error } = await sb().from("companies").update(rest).eq("id", company!.id);
    setMsg(error ? error.message : "✅ Enregistré"); reload();
    setTimeout(() => setMsg(""), 2500);
  }

  async function upload(file: File) {
    const path = `${company!.id}/logo-${Date.now()}.${file.name.split(".").pop()}`;
    const { error } = await sb().storage.from("logos").upload(path, file, { upsert: true });
    if (error) return setMsg(error.message);
    const { data } = sb().storage.from("logos").getPublicUrl(path);
    setC({ ...c, logo_url: data.publicUrl });
  }

  async function changePwd() {
    if (pwd.length < 6) return setMsg("6 caractères minimum");
    const { error } = await sb().auth.updateUser({ password: pwd });
    setMsg(error ? error.message : "✅ Mot de passe modifié"); setPwd("");
  }

  if (!company) return null;
  if (!isSup) return (
    <>
      <Header back title="Mon profil" />
      <div className="space-y-4 p-4">
        {msg && <p className="text-center text-sm">{msg}</p>}
        <section className="card space-y-3">
          <div><label className="label">Prénom et nom</label><input className="input" value={myName} onChange={(e) => setMyName(e.target.value)} /></div>
          <button className="btn-primary w-full" onClick={async () => { await sb().rpc("update_my_name", { p_name: myName }); reload(); setMsg("✅ Enregistré"); }}>Enregistrer</button>
        </section>
        <section className="card space-y-3">
          <h2 className="font-bold">Mot de passe</h2>
          <input className="input" type="password" placeholder="Nouveau mot de passe" value={pwd} onChange={(e) => setPwd(e.target.value)} />
          <button className="btn-ghost w-full" onClick={changePwd}>Modifier</button>
        </section>
        <section className="card space-y-3 border-red-200">
          <h2 className="font-bold text-red-700">Supprimer mon accès</h2>
          <p className="text-sm text-slate-600">Supprime votre identifiant. Le travail réalisé reste dans l'entreprise.</p>
          <input className="input" placeholder="Tapez SUPPRIMER" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} />
          <button className="btn w-full bg-red-600 text-white" disabled={confirmText.trim().toUpperCase() !== "SUPPRIMER"} onClick={async () => {
            const { error } = await sb().rpc("delete_my_account"); if (error) return setMsg(error.message);
            await sb().auth.signOut(); router.replace("/connexion");
          }}>Supprimer mon accès</button>
        </section>
      </div>
    </>
  );
  return (
    <>
      <Header back title="Mon entreprise" />
      <div className="space-y-4 p-4">
        {welcome && <p className="card bg-flame-light text-sm">Bienvenue ! Renseignez vos informations : elles apparaîtront sur vos devis et factures. Vous changez de logiciel ? Réglez la suite de vos numéros dans « Numérotation », plus bas, avant votre première facture.</p>}
        <section className="card space-y-3">
          <h2 className="font-bold">Identité</h2>
          {me && <div><label className="label">Votre nom (affiché à l'équipe)</label><div className="flex gap-2"><input className="input" value={myName} onChange={(e) => setMyName(e.target.value)} /><button className="btn-ghost" onClick={async () => { await sb().rpc("update_my_name", { p_name: myName }); reload(); }}>OK</button></div></div>}
          <div className="flex items-center gap-3">
            {c.logo_url ? <img src={c.logo_url} alt="logo" className="h-14 w-24 rounded border object-contain" /> : <div className="flex h-14 w-24 items-center justify-center rounded border text-xs text-slate-400">Logo</div>}
            <label className="btn-ghost cursor-pointer text-sm">Choisir un logo<input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} /></label>
          </div>
          {F({ k: "name", label: "Nom commercial / raison sociale" })}
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Forme juridique</label>
              <select className="input" value={c.legal_form || "EI"} onChange={(e) => setC({ ...c, legal_form: e.target.value })}>
                {["EI", "Micro-entreprise", "EURL", "SARL", "SASU", "SAS"].map((x) => <option key={x}>{x}</option>)}
              </select></div>
            {F({ k: "capital", label: "Capital", ph: "ex. 1 000 €" })}
          </div>
          <SiretField value={c.siret || ""} checkDuplicate
            onChange={(v) => setC({ ...c, siret: v, siret_verified_at: null })}
            onVerified={(i) => {
              const fill = !c.address || confirm(`Remplir automatiquement avec les informations officielles ?\n${i.name}\n${[i.address, i.zip, i.city].filter(Boolean).join(" ")}`);
              setC({ ...c, siret: i.siret || c.siret, siret_verified_at: new Date().toISOString(), naf: i.naf || null,
                ...(fill ? { name: c.name && c.name !== "Mon entreprise" ? c.name : i.name, legal_form: i.legal_form || c.legal_form,
                  address: i.address || c.address, zip: i.zip || c.zip, city: i.city || c.city,
                  vat_number: c.vat_exempt ? c.vat_number : c.vat_number || i.vat_number } : {}) });
            }} />
          {c.siret_verified_at && <p className="-mt-2 text-xs text-green-700">✔ SIRET vérifié le {new Date(c.siret_verified_at).toLocaleDateString("fr-FR")}{c.siret_verified_at !== company.siret_verified_at ? " — appuyez sur Enregistrer" : ""}</p>}
          {F({ k: "rcs", label: "RCS / RM", ph: "ex. RM 123 456 789 Créteil" })}
          {F({ k: "vat_number", label: "N° TVA intracommunautaire", ph: "FR..." })}
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={!!c.vat_exempt} onChange={(e) => setC({ ...c, vat_exempt: e.target.checked })} />
            Franchise en base de TVA (micro-entreprise : « TVA non applicable, art. 293 B du CGI »)
          </label>
        </section>
        <section className="card space-y-3">
          <h2 className="font-bold">Coordonnées</h2>
          {F({ k: "address", label: "Adresse" })}
          <div className="grid grid-cols-3 gap-2">{F({ k: "zip", label: "CP" })}<div className="col-span-2">{F({ k: "city", label: "Ville" })}</div></div>
          {F({ k: "phone", label: "Téléphone", type: "tel" })}{F({ k: "email", label: "E-mail", type: "email" })}
        </section>
        <section className="card space-y-3">
          <h2 className="font-bold">Qualification RGE</h2>
          <p className="text-xs text-slate-500">Indispensable pour que vos clients touchent MaPrimeRénov' et les primes CEE. Apparaît sur vos devis et factures.</p>
          {F({ k: "rge_number", label: "N° de certificat RGE", ph: "ex. E-E123456" })}
          <div className="grid grid-cols-2 gap-2">{F({ k: "rge_organism", label: "Organisme", ph: "Qualibat, Qualit'EnR…" })}{F({ k: "rge_valid_until", label: "Valable jusqu'au", type: "date" })}</div>
          {F({ k: "rge_domains", label: "Domaines", ph: "PAC, chaudière biomasse, chauffe-eau thermodynamique…" })}
        </section>
        <section className="card space-y-3">
          <h2 className="font-bold">📲 Prise de RDV SAV par le client</h2>
          <p className="text-xs text-slate-500">Depuis une fiche SAV, envoyez au client un lien : il choisit parmi les créneaux où un technicien est déjà dans son secteur (trajets optimisés). Point de départ des tournées : l'adresse de l'entreprise ci-dessus.</p>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={c.booking_enabled ?? true} onChange={(e) => setC({ ...c, booking_enabled: e.target.checked })} /> Activer la prise de RDV en ligne</label>
          <div className="grid grid-cols-2 gap-2">
            {F({ k: "booking_day_start", label: "Début de journée", type: "time" })}{F({ k: "booking_day_end", label: "Fin de journée", type: "time" })}
            {F({ k: "booking_duration_min", label: "Durée d'un SAV (min)", type: "number" })}{F({ k: "booking_buffer_min", label: "Marge entre RDV (min)", type: "number" })}
            {F({ k: "booking_max_km", label: "Zone maxi (km)", type: "number" })}{F({ k: "booking_days_ahead", label: "Réservable sur (jours)", type: "number" })}
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={c.booking_lunch ?? true} onChange={(e) => setC({ ...c, booking_lunch: e.target.checked })} /> Pause déjeuner (aucun RDV pendant ce créneau)</label>
          {(c.booking_lunch ?? true) && <div className="grid grid-cols-2 gap-2">
            {F({ k: "booking_lunch_start", label: "Début de la pause", type: "time" })}{F({ k: "booking_lunch_end", label: "Fin de la pause", type: "time" })}
          </div>}
          {F({ k: "booking_keep_free", label: "Temps gardé libre pour les urgences (min par jour et par technicien)", type: "number" })}
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!c.booking_saturday} onChange={(e) => setC({ ...c, booking_saturday: e.target.checked })} /> Proposer le samedi</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!c.booking_auto_confirm} onChange={(e) => setC({ ...c, booking_auto_confirm: e.target.checked })} /> Confirmer automatiquement (sinon : « à confirmer » dans le planning)</label>
        </section>
        <section className="card space-y-3">
          <h2 className="font-bold">Assurance et paiement</h2>
          {F({ k: "insurance", label: "Assurance décennale (obligatoire)", ph: "Assureur, n° de contrat, couverture géographique" })}
          {F({ k: "iban", label: "IBAN" })}{F({ k: "bic", label: "BIC" })}
          <div className="grid grid-cols-2 gap-3">
            {F({ k: "payment_terms_days", label: "Délai paiement (jours)", type: "number" })}
            {F({ k: "quote_validity_days", label: "Validité devis (jours)", type: "number" })}
          </div>
          {F({ k: "late_penalty_rate", label: "Taux des pénalités de retard" })}
          {F({ k: "footer_note", label: "Mention pied de page (optionnel)" })}
        </section>
        <button className="btn-primary sticky bottom-24 w-full py-3.5 shadow-lg" onClick={save}>Enregistrer</button>
        {msg && <p className="fixed inset-x-4 top-4 z-50 rounded-xl bg-ink p-3 text-center text-sm font-semibold text-white shadow-lg">{msg}</p>}
        <NumberingSection />
        <PaymentSettings company={company} reload={reload} />
        <EInvoiceSettings company={company} reload={reload} />
        <AutomationSettings company={company} reload={reload} />
        <section className="card space-y-3">
          <h2 className="font-bold">Mot de passe</h2>
          <input className="input" type="password" placeholder="Nouveau mot de passe" value={pwd} onChange={(e) => setPwd(e.target.value)} />
          <button className="btn-ghost w-full" onClick={changePwd}>Modifier</button>
        </section>
        <section id="suppression" className="card space-y-3 border-red-200">
          <h2 className="font-bold text-red-700">Supprimer mon compte</h2>
          <p className="text-sm text-slate-600">
            Efface définitivement votre entreprise, les accès de votre équipe, vos clients, devis, factures, contrats, attestations, chantiers, photos et SAV. Cette action est irréversible.
          </p>
          <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-900">
            ⚠️ La loi vous oblige à conserver vos factures 10 ans. Avant de supprimer, téléchargez l'<Link href="/app/export" className="underline">export comptable</Link> et les PDF de vos factures.
            {company.plan === "pro" && !company.cancel_at ? " Résiliez aussi d'abord votre abonnement (page Abonnement)." : ""}
          </p>
          <input className="input" placeholder="Tapez SUPPRIMER pour confirmer" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} />
          <button className="btn w-full bg-red-600 text-white" disabled={confirmText.trim().toUpperCase() !== "SUPPRIMER" || !!deleting} onClick={deleteAccount}>
            {deleting || "Supprimer définitivement mon compte"}
          </button>
        </section>
      </div>
    </>
  );
}
export default function Page() { return <Suspense><Settings /></Suspense>; }
