"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { sb } from "@/lib/supabase";
import { addDays, dateFr, eur, VAT_RATES } from "@/lib/calc";
import { useCompany } from "@/components/CompanyContext";
import Header from "@/components/Header";
import Modal from "@/components/Modal";
import SignaturePad from "@/components/SignaturePad";
import EquipmentForm from "@/components/EquipmentForm";
import { buildContractPdf, pdfToBase64, shareOrSave } from "@/lib/pdf-maintenance";
import { CONTRACT_STATUS, contractEnd, DEFAULT_EXCLUDES, defaultIncludes, EQUIPMENT, equipmentLabel, nextTerm, renewalNoticeDue, type Contract } from "@/lib/maintenance";
import type { Client } from "@/lib/types";

async function callSend(body: any) {
  const { data: { session } } = await sb().auth.getSession();
  const r = await fetch("/api/send-document", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` }, body: JSON.stringify({ ...body, origin: location.origin }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "Échec de l'envoi");
  return j;
}

function Editor() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const router = useRouter();
  const { company, isSup } = useCompany();
  const isNew = id === "nouveau";
  const [c, setC] = useState<Contract | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [modal, setModal] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [toast, setToast] = useState("");

  useEffect(() => {
    sb().from("clients").select("*").order("name").then(({ data }) => setClients(data || []));
    if (isNew) setC({ id: "", status: "draft", equipment: {}, client_id: params.get("client"), start_date: addDays(0), duration_months: 12, period_months: 12, tacit_renewal: true, price_ht: 0, vat_rate: 10, excludes: DEFAULT_EXCLUDES });
    else sb().from("contracts").select("*").eq("id", id).single().then(({ data }) => setC(data));
  }, [id, isNew, params]);

  if (!c || !company) return <><Header back title="…" /><p className="p-6 text-center text-slate-400">Chargement…</p></>;
  const editable = c.status === "draft" && isSup;
  const client = clients.find((x) => x.id === c.client_id);
  const set = (p: Partial<Contract>) => setC({ ...c, ...p });
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(""), 4000); };

  function setType(type: string) {
    const d = EQUIPMENT[type];
    set({ equipment: { ...c!.equipment, type }, includes: d ? defaultIncludes(type) : c!.includes,
      price_ht: c!.price_ht || d?.price || 0, period_months: d?.period || 12 });
  }

  async function save(extra: Partial<Contract> = {}): Promise<Contract | null> {
    setBusy(true); setErr("");
    const cur = { ...c!, ...extra };
    const snap = client ? { name: client.name, email: client.email, phone: client.phone, address: client.address, zip: client.zip, city: client.city, type: client.type, siret: client.siret } : cur.client_snapshot;
    const { id: _id, created_at, ...rest } = cur as any;
    const payload: any = { ...rest, client_snapshot: snap || null, client_id: cur.client_id || null, price_ht: Number(String(cur.price_ht).replace(",", ".")) || 0 };
    if (!cur.id) {
      const { data: num, error } = await sb().rpc("next_number", { p_kind: "C" });
      if (error) { setErr(error.message); setBusy(false); return null; }
      payload.number = num;
    }
    const q = cur.id ? sb().from("contracts").update(payload).eq("id", cur.id).select().single() : sb().from("contracts").insert(payload).select().single();
    const { data, error } = await q;
    setBusy(false);
    if (error) { setErr(error.message); return null; }
    setC(data);
    if (!cur.id) router.replace(`/app/entretien/contrat/${data.id}`);
    return data;
  }

  async function pdf(target = c!) { return buildContractPdf(target, company!); }

  async function send() {
    const saved = editable ? await save() : c!; if (!saved) return;
    let to = client?.email || saved.client_snapshot?.email;
    if (!to) { to = prompt("Adresse e-mail du client ?") || ""; if (!to) return; if (client) await sb().from("clients").update({ email: to }).eq("id", client.id); }
    if (!confirm(`Envoyer le contrat ${saved.number} à ${to} ?`)) return;
    setBusy(true); setErr("");
    try { const j = await callSend({ type: "contract", id: saved.id, to, pdfBase64: pdfToBase64(await pdf(saved)) }); if (j.row) setC(j.row); flash(`✅ Envoyé à ${to}`); }
    catch (e: any) { setErr(e.message); }
    setBusy(false);
  }

  async function renewalNotice() {
    const to = client?.email || c!.client_snapshot?.email;
    if (!to) return setErr("Ajoutez l'e-mail du client.");
    if (!confirm(`Envoyer l'avis d'échéance (reconduction au ${dateFr(nextTerm(c!))}) à ${to} ?`)) return;
    setBusy(true); setErr("");
    try { await callSend({ type: "renewal", id: c!.id, to }); setC({ ...c!, renewal_notice_at: new Date().toISOString() }); flash("✅ Avis d'échéance envoyé"); } catch (e: any) { setErr(e.message); }
    setBusy(false);
  }

  async function invoice() {
    const vat = company!.vat_exempt ? 0 : Number(c!.vat_rate);
    const ht = Number(c!.price_ht);
    const start = c!.status === "active" ? nextTerm(c!) : contractEnd(c!);
    const from = new Date(start); from.setFullYear(from.getFullYear() - 1);
    const line = { label: `Contrat d'entretien n° ${c!.number} — ${equipmentLabel(c!.equipment)}`, description: `Période du ${dateFr(from.toISOString())} au ${dateFr(start)}`, qty: 1, unit: "an", unit_price: ht, vat_rate: vat };
    const vatAmt = Math.round(ht * vat) / 100;
    const { data, error } = await sb().from("documents").insert({
      kind: "invoice", status: "draft", client_id: c!.client_id, client_snapshot: c!.client_snapshot, title: `Contrat d'entretien ${c!.number}`,
      site_address: c!.site_address, lines: [line], total_ht: ht, total_vat: vatAmt, total_ttc: ht + vatAmt,
      issue_date: addDays(0), due_date: addDays(company!.payment_terms_days ?? 30),
    }).select().single();
    if (error) return setErr(error.message);
    router.push(`/app/doc/${data.id}`);
  }

  async function cancel() {
    if (!confirm("Résilier ce contrat ?")) return;
    await save({ status: "canceled" });
  }
  async function remove() {
    if (!confirm("Supprimer ce brouillon ?")) return;
    await sb().from("contracts").delete().eq("id", c!.id);
    router.replace("/app/entretien");
  }

  const vat = company.vat_exempt ? 0 : Number(c.vat_rate) || 0;
  const ttc = (Number(String(c.price_ht).replace(",", ".")) || 0) * (1 + vat / 100);
  const st = CONTRACT_STATUS[c.status];

  return (
    <>
      <Header back title={`Contrat ${c.number || "(nouveau)"}`} right={<span className={`chip ${st?.[1]}`}>{st?.[0]}</span>} />
      <div className="space-y-4 p-4">
        {err && <p onClick={() => setErr("")} className="fixed inset-x-4 top-4 z-50 rounded-xl bg-red-600 p-3 text-center text-sm font-semibold text-white shadow-lg">⚠️ {err}<span className="block text-xs font-normal opacity-80">Appuyez pour fermer</span></p>}
        {toast && <p className="fixed inset-x-4 top-4 z-50 rounded-xl bg-ink p-3 text-center text-sm font-semibold text-white shadow-lg">{toast}</p>}
        {renewalNoticeDue(c) && <button onClick={renewalNotice} className="card w-full border-blue-200 bg-blue-50 text-left text-sm">📨 Échéance le {dateFr(nextTerm(c))} : envoyez l'avis de reconduction au client (obligatoire, loi Chatel) →</button>}

        <section className="card space-y-3">
          <span className="label !mb-0">Client</span>
          {editable ? (
            <select className="input" value={c.client_id || ""} onChange={(e) => { const x = clients.find((k) => k.id === e.target.value); set({ client_id: e.target.value, site_address: c.site_address || (x ? [x.address, x.zip, x.city].filter(Boolean).join(" ") : "") }); }}>
              <option value="">— Choisir un client —</option>
              {clients.map((x) => <option key={x.id} value={x.id}>{x.name}{x.city ? ` (${x.city})` : ""}</option>)}
            </select>
          ) : <p className="font-semibold">{c.client_snapshot?.name}</p>}
          {(client || c.client_snapshot) && <p className="text-sm text-slate-500">{[client?.phone || c.client_snapshot?.phone, client?.email || c.client_snapshot?.email].filter(Boolean).join(" · ") || "Pas de téléphone ni d'e-mail"}</p>}
          {editable && <Link href="/app/clients" className="text-sm text-brand">＋ Gérer les clients</Link>}
          <div><label className="label">Adresse de l'installation</label><input className="input" disabled={!editable} value={c.site_address || ""} onChange={(e) => set({ site_address: e.target.value })} /></div>
        </section>

        <section className="card">
          <h2 className="mb-3 font-bold">Équipement</h2>
          <EquipmentForm value={c.equipment} disabled={!editable} onChange={(e) => (e.type !== c.equipment.type && e.type ? setC({ ...c, equipment: e, includes: defaultIncludes(e.type), price_ht: c.price_ht || EQUIPMENT[e.type].price, period_months: EQUIPMENT[e.type].period }) : set({ equipment: e }))} />
        </section>

        <section className="card space-y-3">
          <h2 className="font-bold">Conditions</h2>
          <div className="grid grid-cols-2 gap-2">
            <div><label className="label">Prise d'effet</label><input type="date" className="input" disabled={!editable} value={c.start_date || ""} onChange={(e) => set({ start_date: e.target.value })} /></div>
            <div><label className="label">Visite</label>
              <select className="input" disabled={!editable} value={c.period_months} onChange={(e) => set({ period_months: Number(e.target.value) })}>
                <option value={6}>Tous les 6 mois</option><option value={12}>1 fois par an</option><option value={24}>Tous les 2 ans</option>
              </select></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><label className="label">Prix HT / an</label><input className="input" inputMode="decimal" disabled={!editable} value={c.price_ht ?? ""} onChange={(e) => set({ price_ht: e.target.value as any })} /></div>
            <div><label className="label">TVA</label>
              <select className="input" disabled={!editable || company.vat_exempt} value={c.vat_rate} onChange={(e) => set({ vat_rate: Number(e.target.value) })}>
                {VAT_RATES.map((r) => <option key={r} value={r}>{r}%</option>)}
              </select></div>
          </div>
          {isSup && <p className="text-right text-sm font-semibold">{eur(ttc)} TTC / an</p>}
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={!editable} checked={!!c.tacit_renewal} onChange={(e) => set({ tacit_renewal: e.target.checked })} /> Reconduction tacite chaque année</label>
          <div><label className="label">Prestations incluses (une par ligne)</label><textarea className="input text-sm" rows={6} disabled={!editable} value={c.includes || ""} onChange={(e) => set({ includes: e.target.value })} placeholder="Choisissez d'abord le type d'équipement" /></div>
          <div><label className="label">Non inclus</label><textarea className="input text-sm" rows={4} disabled={!editable} value={c.excludes || ""} onChange={(e) => set({ excludes: e.target.value })} /></div>
          <div><label className="label">Options (dépannage prioritaire, pièces…)</label><textarea className="input text-sm" rows={2} disabled={!editable} value={c.options || ""} onChange={(e) => set({ options: e.target.value })} /></div>
          <div><label className="label">Conditions particulières</label><textarea className="input text-sm" rows={2} disabled={!editable} value={c.notes || ""} onChange={(e) => set({ notes: e.target.value })} /></div>
        </section>

        {c.status !== "draft" && (
          <section className="card space-y-2">
            <h2 className="font-bold">Suivi</h2>
            <p className="text-sm">Échéance : <b>{dateFr(nextTerm(c))}</b></p>
            <div><label className="label">Prochaine visite</label>
              <input type="date" className="input" disabled={!isSup} value={c.next_visit_date || ""} onChange={(e) => set({ next_visit_date: e.target.value })} onBlur={() => save()} /></div>
            {c.signature_data && (
              <div className="flex items-center gap-3 pt-2">
                {c.signer_photo && <img src={c.signer_photo} alt="" className="h-16 w-16 rounded-xl object-cover" />}
                <img src={c.signature_data} alt="Signature" className="h-14" />
                <p className="text-xs text-slate-500">Signé par {c.signer_name}<br />le {new Date(c.signed_at!).toLocaleString("fr-FR")}</p>
              </div>
            )}
            {c.renewal_notice_at && <p className="text-xs text-slate-500">📨 Dernier avis d'échéance envoyé le {new Date(c.renewal_notice_at).toLocaleDateString("fr-FR")}</p>}
            {c.sent_at && <p className="text-xs text-green-700">📧 Envoyé le {new Date(c.sent_at).toLocaleString("fr-FR")} à {c.sent_to}</p>}
          </section>
        )}

        <section className="space-y-2">
          {editable && <button className="btn-primary w-full py-3.5" disabled={busy} onClick={() => save()}>💾 Enregistrer</button>}
          {editable && c.id && <button className="btn-brand w-full py-3.5" onClick={async () => { if (!c.equipment.type) return setErr("Choisissez le type d'équipement."); if (!c.client_id) return setErr("Choisissez un client."); if (await save()) setModal("sign"); }}>✍️ Faire signer le contrat</button>}
          {c.id && (
            <div className="grid grid-cols-2 gap-2">
              <button className="btn-ghost" onClick={async () => (await pdf()).save(`${c.number}.pdf`)}>⬇️ PDF</button>
              <button className="btn-ghost" onClick={async () => shareOrSave(await pdf(), `${c.number}.pdf`)}>📤 Partager</button>
            </div>
          )}
          {isSup && c.id && <button className="btn-ghost w-full" disabled={busy} onClick={send}>📧 Envoyer par e-mail</button>}
          {c.status === "active" && !isSup && <Link href={`/app/entretien/visite/nouveau?contract=${c.id}`} className="btn-brand w-full py-3.5">🔧 Faire la visite d'entretien</Link>}
          {c.status === "active" && isSup && (
            <>
              <Link href={`/app/entretien/visite/nouveau?contract=${c.id}`} className="btn-brand w-full py-3.5">🔧 Faire la visite d'entretien</Link>
              <div className="grid grid-cols-2 gap-2">
                <button className="btn-ghost" onClick={invoice}>💶 Facturer l'année</button>
                <Link className="btn-ghost" href={`/app/planning?client=${c.client_id}`}>🗓 Planifier</Link>
              </div>
              <Link className="btn-ghost w-full" href={`/app/sav/nouveau?contract=${c.id}`}>🛠 Ouvrir un SAV</Link>
              {c.tacit_renewal && <button className="btn-ghost w-full" disabled={busy} onClick={renewalNotice}>📨 Avis d'échéance</button>}
              <button className="btn-danger w-full" onClick={cancel}>Résilier le contrat</button>
            </>
          )}
          {editable && c.id && <button className="btn-danger w-full" onClick={remove}>Supprimer le brouillon</button>}
        </section>
      </div>

      {modal === "sign" && (
        <Modal title={`Contrat — ${eur(ttc)} TTC/an`} onClose={() => setModal("")}>
          <SignaturePad defaultName={client?.name || ""} onCancel={() => setModal("")}
            agreement="« Lu et approuvé » — je déclare avoir pris connaissance des conditions du contrat d'entretien (prestations, prix, durée, reconduction, droit de rétractation) et les accepter."
            onDone={async (name, sig, photo) => { setModal(""); await save({ status: "active", signer_name: name, signature_data: sig, signer_photo: photo, signed_at: new Date().toISOString(), next_visit_date: c.next_visit_date || c.start_date }); }} />
        </Modal>
      )}
    </>
  );
}
export default function Page() { return <Suspense><Editor /></Suspense>; }
