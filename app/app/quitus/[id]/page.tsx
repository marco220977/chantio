"use client";
import Link from "next/link";
import ClientPicker from "@/components/ClientPicker";
import PlanningBlock from "@/components/PlanningBlock";
import RdvLink from "@/components/RdvLink";
import { Suspense, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { currentUser, sb } from "@/lib/supabase";
import { addDays, dateFr } from "@/lib/calc";
import { useCompany } from "@/components/CompanyContext";
import Header from "@/components/Header";
import PdfPreview from "@/components/PdfPreview";
import Modal from "@/components/Modal";
import SignaturePad from "@/components/SignaturePad";
import { buildReceptionPdf, type Reception } from "@/lib/quitus-sav";
import { pdfToBase64, shareOrSave } from "@/lib/pdf-maintenance";
import { askEmail, sendMail, snapshotOf } from "@/lib/send";
import { removeMedia, signedUrls, uploadPhoto } from "@/lib/chantiers";
import { MediaButtons, MediaGrid } from "@/components/Media";
import type { Client } from "@/lib/types";

function Editor() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const router = useRouter();
  const { company, isSup } = useCompany();
  const isNew = id === "nouveau";
  const [r, setR] = useState<Reception | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [preview, setPreview] = useState<null | (() => Promise<any>)>(null);
  const [modal, setModal] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [toast, setToast] = useState("");
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [upl, setUpl] = useState("");
  const [invoiceId, setInvoiceId] = useState<string | null>(null);
  const [ivBill, setIvBill] = useState<string | null>(null);

  useEffect(() => {
    const s = sb();
    s.from("clients").select("*").order("name").then(({ data }) => setClients(data || []));
    if (!isNew) { s.from("receptions").select("*").eq("id", id).single().then(async ({ data }) => {
      setR(data); if (data?.photos?.length) setUrls(await signedUrls(data.photos));
      if (data?.intervention_id) { const { data: iv } = await s.from("interventions").select("billable, price_ht, invoice_id").eq("id", data.intervention_id).single();
        if (iv?.billable) setIvBill(iv.price_ht ? `${Number(iv.price_ht).toLocaleString("fr-FR", { style: "currency", currency: "EUR" })} HT` : "à compléter");
        if (iv?.invoice_id) setInvoiceId(iv.invoice_id); }
      if (data?.document_id) { const { data: inv } = await s.from("documents").select("id").eq("source_quote_id", data.document_id).eq("kind", "invoice").neq("status", "canceled").order("created_at", { ascending: false }).limit(1); if (inv?.[0]) setInvoiceId(inv[0].id); }
    }); return; }
    (async () => {
      const user = await currentUser();
      const { data: me } = await s.from("members").select("full_name").eq("user_id", user?.id).maybeSingle();
      const base: Reception = { id: "", status: "draft", reserves: [], photos: [], reception_date: addDays(0), works_end_date: addDays(0), company_signer: me?.full_name || "" };
      let docId = params.get("doc");
      const chId = params.get("chantier");
      const ivId = params.get("intervention");
      if (ivId) {
        const { data: ex } = await s.from("receptions").select("id").eq("intervention_id", ivId).limit(1);
        if (ex?.[0]) { router.replace(`/app/quitus/${ex[0].id}`); return; }
        const { data: iv } = await s.from("interventions").select("*").eq("id", ivId).single();
        if (iv) {
          const day = new Date(iv.starts_at); day.setMinutes(day.getMinutes() - day.getTimezoneOffset());
          const d = day.toISOString().slice(0, 10);
          let snap: any = null;
          if (iv.client_id) { const { data: c } = await s.from("clients").select("*").eq("id", iv.client_id).single(); snap = snapshotOf(c); }
          Object.assign(base, { intervention_id: iv.id, client_id: iv.client_id, client_snapshot: snap, address: iv.address,
            works: [iv.title, iv.notes].filter(Boolean).join("\n"), works_end_date: d, reception_date: addDays(0),
            company_signer: iv.technician || base.company_signer });
          docId = docId || iv.document_id;
          setIvBill(iv.billable ? (iv.price_ht ? `${Number(iv.price_ht).toLocaleString("fr-FR", { style: "currency", currency: "EUR" })} HT` : "à compléter") : null);
        }
      }
      if (chId) {
        const { data: ch } = await s.from("chantiers").select("*").eq("id", chId).single();
        if (ch) {
          // Quitus déjà commencé pour ce chantier → on le rouvre
          const { data: ex } = await s.from("receptions").select("id").eq("chantier_id", ch.id).order("created_at", { ascending: false }).limit(1);
          if (ex?.[0]) { router.replace(`/app/quitus/${ex[0].id}`); return; }
          const { data: ents } = await s.from("chantier_entries").select("text, photos, tag, created_at").eq("chantier_id", ch.id).order("created_at");
          const notes = (ents || []).filter((e: any) => e.text && ["apres", "reception", "pendant"].includes(e.tag)).map((e: any) => `• ${e.text}`);
          Object.assign(base, { chantier_id: ch.id, client_id: ch.client_id, client_snapshot: ch.client_snapshot, address: ch.address,
            works: [ch.title?.trim(), ...notes].filter(Boolean).join("\n"), works_end_date: ch.end_date || base.works_end_date,
            photos: (ents || []).flatMap((e: any) => e.photos || []) });
          docId = docId || ch.document_id;
        }
      }
      if (docId) {
        const { data: d } = await s.from("documents").select("*").eq("id", docId).single();
        if (d) Object.assign(base, {
          document_id: d.id, client_id: base.client_id || d.client_id, client_snapshot: base.client_snapshot || d.client_snapshot,
          address: base.address || d.site_address,
          works: [d.title || base.works, ...(d.lines || []).map((l: any) => `• ${l.label}`)].filter(Boolean).join("\n") + `\n(selon devis n° ${d.number})`,
        });
      }
      setR(base);
      if (base.photos?.length) setUrls(await signedUrls(base.photos));
    })();
  }, [id, isNew, params]);

  if (!r || !company) return <><Header back title="…" /><p className="p-6 text-center text-slate-400">Chargement…</p></>;
  const editable = r.status === "draft";
  const client = clients.find((x) => x.id === r.client_id);
  const set = (p: Partial<Reception>) => setR({ ...r, ...p });
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(""), 4000); };

  async function save(extra: Partial<Reception> = {}): Promise<Reception | null> {
    setBusy(true); setErr("");
    const cur = { ...r!, ...extra };
    const { id: _i, created_at, ...rest } = cur as any;
    const payload: any = { ...rest, client_snapshot: snapshotOf(client) || cur.client_snapshot || null, client_id: cur.client_id || null,
      chantier_id: cur.chantier_id || null, document_id: cur.document_id || null, intervention_id: cur.intervention_id || null, reserves: cur.with_reserves ? cur.reserves.filter((x) => x.label.trim()) : [] };
    if (!cur.id) {
      const { data: num, error } = await sb().rpc("next_number", { p_kind: "Q" });
      if (error) { setErr(error.message); setBusy(false); return null; }
      payload.number = num;
    }
    const q = cur.id ? sb().from("receptions").update(payload).eq("id", cur.id).select().single() : sb().from("receptions").insert(payload).select().single();
    const { data, error } = await q;
    setBusy(false);
    if (error) { setErr(error.message); return null; }
    setR(data);
    if (!cur.id) router.replace(`/app/quitus/${data.id}`);
    return data;
  }

  async function addPhotos(files: File[] | FileList) {
    const saved = r!.id ? r! : await save(); if (!saved) return;
    try {
      const paths = [...(saved.photos || [])];
      const list = Array.from(files);
      for (let i = 0; i < list.length; i++) { setUpl(`Envoi ${i + 1}/${list.length}…`); paths.push(await uploadPhoto(company!.id, `quitus-${saved.id}`, list[i])); }
      const { data, error } = await sb().from("receptions").update({ photos: paths }).eq("id", saved.id).select().single();
      if (error) throw error;
      setR({ ...r!, ...saved, photos: data.photos });
      setUrls(await signedUrls(data.photos));
    } catch (e: any) { setErr(e.message); }
    setUpl("");
  }
  async function removePhoto(p: string) {
    if (!confirm("Supprimer ce média ?")) return;
    if (p.includes("/quitus-")) await removeMedia(p);
    const photos = (r!.photos || []).filter((x) => x !== p);
    await sb().from("receptions").update({ photos }).eq("id", r!.id);
    setR({ ...r!, photos });
  }

  // Signature : enregistrement + clôture de l'intervention + envoi automatique au client
  async function afterSign(name: string, sig: string, photo?: string | null) {
    const done = await save({ status: "signed", signer_name: name, signature_data: sig, signer_photo: photo, signed_at: new Date().toISOString() });
    if (!done) return;
    if (done.intervention_id) await sb().from("interventions").update({ status: "done" }).eq("id", done.intervention_id);
    const to = client?.email || done.client_snapshot?.email;
    let msg = "✅ Quitus signé et enregistré";
    const mode = (company as any)?.email_after_sign || "ask";
    if (to && (mode === "auto" || (mode === "ask" && confirm(`Quitus signé ✅\n\nEnvoyer le PDF par e-mail à ${to} ?`)))) {
      setBusy(true);
      try { const j = await sendMail({ type: "reception", id: done.id, to, pdfBase64: pdfToBase64(await buildReceptionPdf(done, company!, urls)) }); if (j.row) setR(j.row); msg += ` — envoyé à ${to}`; }
      catch (e: any) { msg += ` — envoi impossible : ${e.message}`; }
      setBusy(false);
    }
    const inv = !done.with_reserves ? await makeInvoice(done) : null;
    if (inv) msg += " — facture brouillon créée";
    flash(msg);
    if (inv && isSup) setTimeout(() => router.push(`/app/doc/${inv}`), 2500);
    else if (done.intervention_id) setTimeout(() => router.push("/app/planning"), 2500);
  }

  // Réception sans réserve (ou réserves levées) → facture du devis + avenants signés
  async function makeInvoice(rec: Reception): Promise<string | null> {
    if (!rec.document_id && !rec.intervention_id) return null;
    const { data, error } = rec.intervention_id
      ? await sb().rpc("invoice_from_intervention", { p_iv: rec.intervention_id, p_reception: rec.id })
      : await sb().rpc("invoice_from_quote", { p_quote: rec.document_id, p_reception: rec.id });
    if (!error && !data) return null;
    if (error) { setErr(`Facture non créée : ${error.message}`); return null; }
    setInvoiceId(data);
    return data as string;
  }

  async function lift(i: number) {
    const reserves = r!.reserves.map((x, j) => (j === i ? { ...x, lifted_at: x.lifted_at ? null : addDays(0) } : x));
    const all = reserves.every((x) => x.lifted_at);
    await save({ reserves, reserves_lifted_at: all ? new Date().toISOString() : null });
    if (all) {
      const inv = await makeInvoice(r!);
      flash(inv ? "✅ Réserves levées — facture brouillon créée" : "✅ Toutes les réserves sont levées");
    }
  }

  async function send() {
    const to = await askEmail(client?.email || r!.client_snapshot?.email, r!.client_id); if (!to) return;
    if (!confirm(`Envoyer le procès-verbal ${r!.number} à ${to} ?`)) return;
    setBusy(true); setErr("");
    try { const j = await sendMail({ type: "reception", id: r!.id, to, pdfBase64: pdfToBase64(await buildReceptionPdf(r!, company!, urls)) }); if (j.row) setR(j.row); flash(`✅ Envoyé à ${to}`); }
    catch (e: any) { setErr(e.message); }
    setBusy(false);
  }

  const pending = r.reserves.filter((x) => !x.lifted_at).length;
  const canPhoto = editable || pending > 0;

  return (
    <>
      <Header back title={`Quitus ${r.number || "(nouveau)"}`} right={<span className={`chip ${r.status === "draft" ? "bg-slate-100 text-slate-700" : "bg-green-100 text-green-800"}`}>{r.status === "draft" ? "Brouillon" : "Signé"}</span>} />
      <div className="space-y-4 p-4">
        {err && <p onClick={() => setErr("")} className="fixed inset-x-4 top-4 z-50 rounded-xl bg-red-600 p-3 text-center text-sm font-semibold text-white shadow-lg">⚠️ {err}</p>}
        {toast && <p className="fixed inset-x-4 top-4 z-50 rounded-xl bg-ink p-3 text-center text-sm font-semibold text-white shadow-lg">{toast}</p>}

        <section className="card space-y-3">
          <span className="label !mb-0">Client (maître d'ouvrage)</span>
          {editable ? (
            <ClientPicker clients={clients} value={r.client_id} placeholder="— Choisir —"
              onCreated={(x) => setClients((l) => [...l, x].sort((a, b) => a.name.localeCompare(b.name)))}
              onChange={(x) => set({ client_id: x?.id || null, address: r.address || (x ? [x.address, x.zip, x.city].filter(Boolean).join(" ") : "") } as any)} />
          ) : <p className="font-semibold">{r.client_snapshot?.name}</p>}
          <div><label className="label">Lieu des travaux</label><input className="input" disabled={!editable} value={r.address || ""} onChange={(e) => set({ address: e.target.value })} /></div>
          <div><label className="label">Nature des travaux</label><textarea className="input text-sm" rows={4} disabled={!editable} value={r.works || ""} onChange={(e) => set({ works: e.target.value })} placeholder="Ex : Remplacement chaudière gaz par PAC air/eau 8 kW" /></div>
          <div className="grid grid-cols-2 gap-2">
            {([["works_end_date", "Fin des travaux"], ["reception_date", "Réception"]] as const).map(([k, l]) => {
              const on = !!(r as any)[k];
              return (
                <div key={k}>
                  <label className="label flex items-center gap-1.5">
                    {editable && <input type="checkbox" checked={on} onChange={(e) => set({ [k]: e.target.checked ? new Date().toISOString().slice(0, 10) : null } as any)} />}
                    {l}
                  </label>
                  {on ? <input type="date" className="input" disabled={!editable} value={(r as any)[k] || ""} onChange={(e) => set({ [k]: e.target.value || null } as any)} />
                    : <p className="input !bg-slate-50 text-sm text-slate-400">Non indiquée</p>}
                </div>
              );
            })}
          </div>
          {editable && !r.reception_date && <p className="text-xs text-slate-500">Sans date de réception, c'est la date de signature du procès-verbal qui fait courir les garanties (parfait achèvement, biennale, décennale).</p>}
          {(r.chantier_id || r.document_id) && (
            <div className="flex gap-3 text-sm">
              {r.chantier_id && <Link className="text-brand" href={`/app/chantiers/${r.chantier_id}`}>🏗️ Chantier</Link>}
              {r.document_id && <Link className="text-brand" href={`/app/doc/${r.document_id}`}>📝 Devis</Link>}
            </div>
          )}
        </section>

        {editable && (
          <PlanningBlock address={r.address || [client?.address, client?.zip, client?.city].filter(Boolean).join(" ")} interventionId={r.intervention_id}
            value={{ when: (r as any).planned_at || null, tech: (r as any).assigned_to || null }}
            onChange={(v) => setR((cur) => cur && ({ ...cur, planned_at: v.when, assigned_to: v.tech } as any))}
            onSchedule={async (when, tech, duration) => {
              if (!r.client_id && !r.client_snapshot) { setErr("Choisissez d'abord le client."); return null; }
              const addr = r.address || [client?.address, client?.zip, client?.city].filter(Boolean).join(" ") || null;
              const { data, error } = await sb().from("interventions").insert({ title: `Intervention${r.works ? " — " + r.works.split("\n")[0].slice(0, 60) : ""}`,
                client_id: r.client_id || null, address: addr, starts_at: when, duration_min: duration, ...tech, notes: r.works || null, status: "planned" }).select("id").single();
              if (error) { setErr(error.message); return null; }
              // Le quitus est enregistré avec le lien vers ce rendez-vous
              const saved = await save({ intervention_id: data.id, address: addr || r.address, planned_at: when, assigned_to: tech.assigned_to } as any);
              if (!saved) { await sb().from("interventions").delete().eq("id", data.id); return null; }
              return data.id;
            }}>
            {r.id ? <RdvLink ticket={r} table="receptions" companyName={company?.name || ""} onToken={(tk) => setR({ ...r, booking_token: tk } as any)} />
              : <button type="button" className="btn-ghost w-full" disabled={busy} onClick={async () => {
                  if (!r.client_id && !r.client_snapshot) return setErr("Choisissez d'abord le client.");
                  // Enregistre le quitus avec son lien de RDV en une seule fois
                  const sv = await save({ booking_token: crypto.randomUUID() } as any);
                  if (sv) flash("📲 Lien de RDV créé : envoyez-le au client ci-dessous.");
                }}>📲 Laisser le client choisir son RDV en ligne</button>}
          </PlanningBlock>
        )}

        <section className="card space-y-3">
          <h2 className="font-bold">Réserves</h2>
          {editable && (
            <div className="grid grid-cols-2 rounded-xl bg-slate-200 p-1">
              {[[false, "Sans réserve"], [true, "Avec réserves"]].map(([v, l]) => (
                <button key={String(v)} onClick={() => set({ with_reserves: v as boolean, reserves: v && !r.reserves.length ? [{ label: "", deadline: addDays(30) }] : r.reserves })}
                  className={`rounded-lg py-2 text-sm font-semibold ${!!r.with_reserves === v ? "bg-white shadow" : "text-slate-600"}`}>{l as string}</button>
              ))}
            </div>
          )}
          {!r.with_reserves && !editable && <p className="text-sm text-green-700">✅ Réception prononcée sans réserve.</p>}
          {r.with_reserves && r.reserves.map((x, i) => (
            <div key={i} className="space-y-2 rounded-xl border border-slate-200 p-3">
              {editable ? (
                <>
                  <div className="flex gap-2">
                    <input className="input text-sm" placeholder="Ex : Calorifuge du départ chauffage à reprendre" value={x.label} onChange={(e) => set({ reserves: r.reserves.map((k, j) => (j === i ? { ...k, label: e.target.value } : k)) })} />
                    <button className="px-1 text-red-500" onClick={() => set({ reserves: r.reserves.filter((_, j) => j !== i) })}>🗑</button>
                  </div>
                  <div className="flex items-center gap-2 text-sm"><span className="text-slate-500">À lever avant le</span>
                    <input type="date" className="input !w-auto !py-1.5" value={x.deadline || ""} onChange={(e) => set({ reserves: r.reserves.map((k, j) => (j === i ? { ...k, deadline: e.target.value } : k)) })} /></div>
                </>
              ) : (
                <div className="flex items-start justify-between gap-3">
                  <div><p className={`text-sm ${x.lifted_at ? "text-slate-400 line-through" : "font-semibold"}`}>{x.label}</p>
                    <p className="text-xs text-slate-500">{x.lifted_at ? `Levée le ${dateFr(x.lifted_at)}` : `Avant le ${dateFr(x.deadline)}`}</p></div>
                  <button className={`chip whitespace-nowrap py-1.5 ${x.lifted_at ? "bg-slate-100" : "bg-green-100 text-green-800"}`} onClick={() => lift(i)}>{x.lifted_at ? "Annuler" : "✓ Levée"}</button>
                </div>
              )}
            </div>
          ))}
          {editable && r.with_reserves && <button className="btn-ghost w-full" onClick={() => set({ reserves: [...r.reserves, { label: "", deadline: addDays(30) }] })}>＋ Ajouter une réserve</button>}
          {!editable && r.with_reserves && (pending ? <p className="text-sm text-amber-700">{pending} réserve(s) à lever</p> : <p className="text-sm text-green-700">✅ Toutes les réserves sont levées{r.reserves_lifted_at ? ` (${dateFr(r.reserves_lifted_at)})` : ""}</p>)}
        </section>

        <section className="card space-y-3">
          <h2 className="font-bold">Photos et vidéos</h2>
          {(r.photos || []).length > 0 && <MediaGrid paths={r.photos || []} urls={urls} onRemove={canPhoto ? removePhoto : undefined} />}
          {!(r.photos || []).length && !canPhoto && <p className="text-sm text-slate-400">Aucune photo.</p>}
          {canPhoto && <MediaButtons onFiles={addPhotos} />}
          {upl && <p className="text-sm text-slate-500">{upl}</p>}
          {canPhoto && <p className="text-xs text-slate-400">Toutes les photos sont ajoutées au procès-verbal PDF ; chaque vidéo y figure avec un QR code pour la regarder.</p>}
        </section>

        <section className="card space-y-3">
          <div><label className="label">Observations</label><textarea className="input text-sm" rows={2} disabled={!editable} value={r.notes || ""} onChange={(e) => set({ notes: e.target.value })} /></div>
          <div><label className="label">Signataire pour l'entreprise</label><input className="input" disabled={!editable} value={r.company_signer || ""} onChange={(e) => set({ company_signer: e.target.value })} /></div>
        </section>

        {r.signature_data && (
          <section className="card flex items-center gap-3">
            {r.signer_photo && <img src={r.signer_photo} alt="" className="h-16 w-16 rounded-xl object-cover" />}
            <img src={r.signature_data} alt="Signature" className="h-14" />
            <p className="text-xs text-slate-500">Signé par {r.signer_name}<br />le {new Date(r.signed_at!).toLocaleString("fr-FR")}</p>
          </section>
        )}
        {editable && !r.document_id && ivBill && <p className="rounded-xl bg-green-50 p-3 text-xs text-green-800">Intervention facturable ({ivBill}) : après signature, la facture sera créée automatiquement en brouillon.</p>}
        {editable && !r.document_id && !ivBill && <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800">Aucun devis lié à ce quitus : la facture ne sera pas créée automatiquement après la signature.</p>}
        {editable && r.document_id && <p className="rounded-xl bg-green-50 p-3 text-xs text-green-800">Après signature sans réserve, la facture du devis (avec ses avenants signés) sera créée automatiquement en brouillon.</p>}
        {invoiceId && isSup && <Link href={`/app/doc/${invoiceId}`} className="btn-brand w-full">💶 Voir la facture créée</Link>}
        {r.sent_at && <p className="text-xs text-green-700">📧 Envoyé le {new Date(r.sent_at).toLocaleString("fr-FR")} à {r.sent_to}</p>}

        <section className="space-y-2">
          <div className={`grid gap-2 ${r.id ? "grid-cols-2" : "grid-cols-1"}`}>
            <button className="btn-ghost" onClick={() => setPreview(() => () => buildReceptionPdf({ ...r, client_snapshot: snapshotOf(client) || r.client_snapshot }, company, urls))}>👁 Aperçu PDF</button>
            {r.id && <button className="btn-ghost" onClick={async () => shareOrSave(await buildReceptionPdf(r, company, urls), `${r.number}.pdf`)}>📤 Partager</button>}
          </div>
          {editable && <button className="btn-primary w-full py-3.5" disabled={busy} onClick={() => save()}>💾 Enregistrer</button>}
          {editable && <button className="btn-brand w-full py-3.5" disabled={busy} onClick={async () => {
            if (!r.client_id && !r.client_snapshot) return setErr("Choisissez un client.");
            if (!r.works?.trim()) return setErr("Décrivez les travaux.");
            if (r.with_reserves && !r.reserves.some((x) => x.label.trim())) return setErr("Ajoutez au moins une réserve, ou choisissez « Sans réserve ».");
            if (await save()) setModal("sign");
          }}>✍️ Faire signer le quitus</button>}

          {r.status === "signed" && <button className="btn-primary w-full" disabled={busy} onClick={send}>📧 {r.sent_at ? "Renvoyer" : "Envoyer"} par e-mail</button>}
          {r.status === "signed" && <Link href={`/app/sav/nouveau?client=${r.client_id || ""}&reception=${r.id}`} className="btn-ghost w-full">🛠 Ouvrir un SAV pour ce client</Link>}
          {editable && r.id && <button className="btn-danger w-full" onClick={async () => { if (confirm("Supprimer ce brouillon ?")) { await sb().from("receptions").delete().eq("id", r.id); router.replace("/app/quitus"); } }}>Supprimer le brouillon</button>}
        </section>
      </div>

      {preview && <PdfPreview build={preview} filename={`${r.number || "quitus"}.pdf`} onClose={() => setPreview(null)} />}
      {modal === "sign" && (
        <Modal title="Signature du client" onClose={() => setModal("")}>
          <SignaturePad defaultName={client?.name || r.client_snapshot?.name || ""} onCancel={() => setModal("")}
            agreement={`Je prononce la réception des travaux ${r.with_reserves ? "avec les réserves indiquées" : "sans réserve"} et je donne quitus à l'entreprise pour leur exécution${r.with_reserves ? ", sous réserve de la levée des réserves" : ""}.`}
            onDone={async (name, sig, photo) => { setModal(""); await afterSign(name, sig, photo); }} />
        </Modal>
      )}
    </>
  );
}
export default function Page() { return <Suspense><Editor /></Suspense>; }
