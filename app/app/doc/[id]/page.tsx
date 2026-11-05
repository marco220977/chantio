"use client";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { sb } from "@/lib/supabase";
import { addDays, computeTotals, dateFr, eur, STATUS_COLOR, STATUS_LABEL, VAT_RATES } from "@/lib/calc";
import { downloadPdf, sharePdf } from "@/lib/pdf";
import { useCompany } from "@/components/CompanyContext";
import Header from "@/components/Header";
import Modal from "@/components/Modal";
import SignaturePad from "@/components/SignaturePad";
import type { CatalogItem, Client, Doc, Line } from "@/lib/types";

const emptyLine = (): Line => ({ label: "", qty: 1, unit: "u", unit_price: 0, vat_rate: 10 });

function Editor() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const router = useRouter();
  const { company } = useCompany();
  const isNew = id === "nouveau";

  const [doc, setDoc] = useState<Doc | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [modal, setModal] = useState<"" | "catalog" | "client" | "sign" | "send" | "pay">("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [catQ, setCatQ] = useState("");
  const [newClient, setNewClient] = useState<Partial<Client>>({ type: "particulier" });

  useEffect(() => {
    const s = sb();
    s.from("clients").select("*").order("name").then(({ data }) => setClients(data || []));
    s.from("catalog_items").select("*").order("category").order("label").then(({ data }) => setCatalog(data || []));
    if (isNew) {
      const kind = (params.get("kind") as Doc["kind"]) || "quote";
      let dup: Partial<Doc> = {};
      try { dup = JSON.parse(sessionStorage.getItem("dup") || "{}"); sessionStorage.removeItem("dup"); } catch {}
      setDoc({ id: "", kind, status: "draft", lines: [], issue_date: addDays(0), client_id: params.get("client") || undefined, ...dup });
    } else {
      s.from("documents").select("*").eq("id", id).single().then(({ data }) => setDoc(data));
    }
  }, [id, isNew, params]);

  // valeurs par défaut dépendant de l'entreprise
  useEffect(() => {
    if (!doc || !company || doc.id) return;
    if (doc.kind === "quote" && !doc.valid_until) setDoc({ ...doc, valid_until: addDays(company.quote_validity_days ?? 30) });
    if (doc.kind !== "quote" && !doc.due_date) setDoc({ ...doc, due_date: addDays(company.payment_terms_days ?? 30) });
  }, [doc, company]);

  const totals = useMemo(() => computeTotals(doc?.lines || [], doc?.discount_pct, company?.vat_exempt), [doc, company]);
  const margin = useMemo(() => {
    if (!doc) return null;
    const cost = doc.lines.reduce((s, l) => s + (Number(l.cost_price) || 0) * (Number(l.qty) || 0), 0);
    return cost > 0 ? { cost, value: totals.ht - cost, pct: totals.ht ? ((totals.ht - cost) / totals.ht) * 100 : 0 } : null;
  }, [doc, totals]);

  if (!doc || !company) return <><Header title="…" back /><p className="p-6 text-center text-slate-400">Chargement…</p></>;

  const isQuote = doc.kind === "quote";
  const editable = doc.status === "draft" || (isQuote && doc.status === "sent");
  const set = (patch: Partial<Doc>) => setDoc({ ...doc, ...patch });
  const setLine = (i: number, patch: Partial<Line>) => set({ lines: doc.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) });
  const client = clients.find((c) => c.id === doc.client_id);
  const publicUrl = `${typeof window !== "undefined" ? location.origin : ""}/signer/${doc.public_token}`;

  async function save(extra: Partial<Doc> = {}): Promise<Doc | null> {
    setBusy(true); setErr("");
    const s = sb();
    const cur = { ...doc!, ...extra };
    const snap = client ? { name: client.name, email: client.email, phone: client.phone, address: client.address, zip: client.zip, city: client.city, siret: client.siret, type: client.type } : cur.client_snapshot;
    const payload: any = {
      kind: cur.kind, status: cur.status, client_id: cur.client_id || null, client_snapshot: snap || null,
      title: cur.title, site_address: cur.site_address, issue_date: cur.issue_date, due_date: cur.due_date || null,
      valid_until: cur.valid_until || null, lines: cur.lines, discount_pct: cur.discount_pct || 0,
      deposit_pct: cur.deposit_pct || 0, total_ht: totals.ht, total_vat: totals.vat, total_ttc: totals.ttc,
      notes: cur.notes, source_quote_id: cur.source_quote_id || null,
      signed_at: cur.signed_at || null, signer_name: cur.signer_name || null, signature_data: cur.signature_data || null, signer_photo: cur.signer_photo || null,
      paid_at: cur.paid_at || null, payment_method: cur.payment_method || null, number: cur.number || null,
    };
    const locked = cur.id && cur.kind !== "quote" && doc!.status !== "draft";
    if (locked) {
      for (const k of Object.keys(payload)) if (!["status", "paid_at", "payment_method"].includes(k)) delete payload[k];
    }
    if (!cur.id && cur.kind === "quote") {
      const { data: num, error } = await s.rpc("next_number", { p_kind: "D" });
      if (error) { setErr(error.message); setBusy(false); return null; }
      payload.number = num;
    }
    const q = cur.id ? s.from("documents").update(payload).eq("id", cur.id).select().single()
                     : s.from("documents").insert(payload).select().single();
    const { data, error } = await q;
    setBusy(false);
    if (error) { setErr(error.message); return null; }
    setDoc(data);
    if (!cur.id) router.replace(`/app/doc/${data.id}`);
    return data;
  }

  async function issueInvoice() {
    if (!doc!.client_id && !doc!.client_snapshot) return setErr("Choisissez un client.");
    if (!doc!.lines.length) return setErr("Ajoutez au moins une ligne.");
    if (!confirm("Émettre la facture ? Elle recevra un numéro définitif et ne pourra plus être modifiée.")) return;
    const { data: num, error } = await sb().rpc("next_number", { p_kind: doc!.kind === "credit" ? "A" : "F" });
    if (error) return setErr(error.message);
    await save({ number: num as string, status: "issued", issue_date: addDays(0) });
  }

  async function toInvoice() {
    const saved = doc!.id ? doc! : await save();
    if (!saved) return;
    const s = sb();
    const { data, error } = await s.from("documents").insert({
      kind: "invoice", status: "draft", client_id: saved.client_id, client_snapshot: saved.client_snapshot,
      title: saved.title, site_address: saved.site_address, lines: saved.lines, discount_pct: saved.discount_pct,
      total_ht: saved.total_ht, total_vat: saved.total_vat, total_ttc: saved.total_ttc,
      issue_date: addDays(0), due_date: addDays(company!.payment_terms_days ?? 30),
      notes: `Facture établie selon devis n° ${saved.number}${saved.signed_at ? ` accepté le ${dateFr(saved.signed_at)}` : ""}.`,
      source_quote_id: saved.id,
    }).select().single();
    if (error) return setErr(error.message);
    await s.from("documents").update({ status: "invoiced" }).eq("id", saved.id);
    router.push(`/app/doc/${data.id}`);
  }

  async function depositInvoice() {
    const pct = Number(prompt("Pourcentage d'acompte ?", String(doc!.deposit_pct || 30)));
    if (!pct) return;
    const k = pct / 100;
    const { data, error } = await sb().from("documents").insert({
      kind: "invoice", status: "draft", client_id: doc!.client_id, client_snapshot: doc!.client_snapshot,
      title: `Acompte ${pct} % — ${doc!.title || ""}`, site_address: doc!.site_address,
      lines: doc!.lines.map((l) => ({ ...l, label: `Acompte ${pct} % — ${l.label}`, unit_price: Math.round(l.unit_price * k * 100) / 100 })),
      discount_pct: doc!.discount_pct, total_ht: Math.round(totals.ht * k * 100) / 100,
      total_vat: Math.round(totals.vat * k * 100) / 100, total_ttc: Math.round(totals.ttc * k * 100) / 100,
      issue_date: addDays(0), due_date: addDays(0),
      notes: `Facture d'acompte de ${pct} % sur devis n° ${doc!.number}.`, source_quote_id: doc!.id,
    }).select().single();
    if (error) return setErr(error.message);
    router.push(`/app/doc/${data.id}`);
  }

  async function creditNote() {
    if (!confirm("Créer un avoir qui annule totalement cette facture ?")) return;
    const s = sb();
    const { data, error } = await s.from("documents").insert({
      kind: "credit", status: "draft", client_id: doc!.client_id, client_snapshot: doc!.client_snapshot,
      title: `Avoir sur facture ${doc!.number}`, site_address: doc!.site_address,
      lines: doc!.lines.map((l) => ({ ...l, qty: -Number(l.qty) })), discount_pct: doc!.discount_pct,
      total_ht: -Number(doc!.total_ht), total_vat: -Number(doc!.total_vat), total_ttc: -Number(doc!.total_ttc),
      issue_date: addDays(0), notes: `Avoir annulant la facture n° ${doc!.number} du ${dateFr(doc!.issue_date)}.`,
      source_quote_id: doc!.id,
    }).select().single();
    if (error) return setErr(error.message);
    await s.from("documents").update({ status: "canceled" }).eq("id", doc!.id);
    router.push(`/app/doc/${data.id}`);
  }

  async function duplicate() {
    sessionStorage.setItem("dup", JSON.stringify({ lines: doc!.lines, title: doc!.title, discount_pct: doc!.discount_pct, client_id: doc!.client_id, site_address: doc!.site_address }));
    location.href = `/app/doc/nouveau?kind=quote`;
  }

  async function remove() {
    if (!confirm("Supprimer ce brouillon ?")) return;
    const { error } = await sb().from("documents").delete().eq("id", doc!.id);
    if (error) return setErr(error.message);
    router.replace(isQuote ? "/app/devis" : "/app/factures");
  }

  async function addClient() {
    if (!newClient.name) return;
    const { data, error } = await sb().from("clients").insert(newClient).select().single();
    if (error) return setErr(error.message);
    setClients([...clients, data]); set({ client_id: data.id, site_address: doc!.site_address || [data.address, data.zip, data.city].filter(Boolean).join(" ") });
    setNewClient({ type: "particulier" }); setModal("");
  }

  const title = doc.kind === "quote" ? "Devis" : doc.kind === "credit" ? "Avoir" : "Facture";
  const relance = () => {
    const body = `Bonjour,\n\nSauf erreur de notre part, la facture ${doc.number} du ${dateFr(doc.issue_date)} d'un montant de ${eur(doc.total_ttc)} arrivée à échéance le ${dateFr(doc.due_date)} reste impayée.\n\nMerci de procéder au règlement${company.iban ? ` par virement (IBAN ${company.iban})` : ""}.\n\nCordialement,\n${company.name}`;
    location.href = `mailto:${client?.email || doc.client_snapshot?.email || ""}?subject=${encodeURIComponent(`Relance facture ${doc.number}`)}&body=${encodeURIComponent(body)}`;
  };

  return (
    <>
      <Header back title={`${title} ${doc.number || "(nouveau)"}`}
        right={<span className={`chip ${STATUS_COLOR[doc.status]}`}>{STATUS_LABEL[doc.status]}</span>} />
      <div className="space-y-4 p-4">
        {err && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{err}</p>}

        {/* Client */}
        <section className="card space-y-3">
          <div className="flex items-center justify-between">
            <span className="label !mb-0">Client</span>
            {editable && <button className="text-sm font-semibold text-brand" onClick={() => setModal("client")}>＋ Nouveau client</button>}
          </div>
          {editable ? (
            <select className="input" value={doc.client_id || ""} onChange={(e) => {
              const c = clients.find((x) => x.id === e.target.value);
              set({ client_id: e.target.value, site_address: doc.site_address || (c ? [c.address, c.zip, c.city].filter(Boolean).join(" ") : "") });
            }}>
              <option value="">— Choisir un client —</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}{c.city ? ` (${c.city})` : ""}</option>)}
            </select>
          ) : (
            <p className="font-semibold">{doc.client_snapshot?.name}<br /><span className="text-sm font-normal text-slate-500">{[doc.client_snapshot?.address, doc.client_snapshot?.zip, doc.client_snapshot?.city].filter(Boolean).join(" ")}</span></p>
          )}
          <div><label className="label">Objet</label><input className="input" disabled={!editable} placeholder="Ex : Remplacement chaudière gaz" value={doc.title || ""} onChange={(e) => set({ title: e.target.value })} /></div>
          <div><label className="label">Adresse du chantier</label><input className="input" disabled={!editable} value={doc.site_address || ""} onChange={(e) => set({ site_address: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Date</label><input type="date" className="input" disabled={!editable} value={doc.issue_date || ""} onChange={(e) => set({ issue_date: e.target.value })} /></div>
            {isQuote
              ? <div><label className="label">Valable jusqu'au</label><input type="date" className="input" disabled={!editable} value={doc.valid_until || ""} onChange={(e) => set({ valid_until: e.target.value })} /></div>
              : <div><label className="label">Échéance</label><input type="date" className="input" disabled={!editable} value={doc.due_date || ""} onChange={(e) => set({ due_date: e.target.value })} /></div>}
          </div>
        </section>

        {/* Lignes */}
        <section className="space-y-3">
          <h2 className="font-bold">Prestations</h2>
          {doc.lines.map((l, i) => (
            <div key={i} className="card space-y-2">
              {editable ? (
                <>
                  <div className="flex gap-2">
                    <input className="input font-semibold" placeholder="Désignation" value={l.label} onChange={(e) => setLine(i, { label: e.target.value })} />
                    <button className="px-2 text-xl text-red-500" onClick={() => set({ lines: doc.lines.filter((_, j) => j !== i) })} aria-label="Supprimer">🗑</button>
                  </div>
                  <textarea className="input text-sm" rows={2} placeholder="Description (optionnel)" value={l.description || ""} onChange={(e) => setLine(i, { description: e.target.value })} />
                  <div className="grid grid-cols-4 gap-2">
                    <div><label className="label">Qté</label><input className="input !px-2" inputMode="decimal" value={l.qty} onChange={(e) => setLine(i, { qty: e.target.value.replace(",", ".") as any })} /></div>
                    <div><label className="label">Unité</label><input className="input !px-2" value={l.unit} onChange={(e) => setLine(i, { unit: e.target.value })} /></div>
                    <div><label className="label">PU HT</label><input className="input !px-2" inputMode="decimal" value={l.unit_price} onChange={(e) => setLine(i, { unit_price: e.target.value.replace(",", ".") as any })} /></div>
                    <div><label className="label">TVA</label>
                      <select className="input !px-1" value={l.vat_rate} onChange={(e) => setLine(i, { vat_rate: Number(e.target.value) })}>
                        {VAT_RATES.map((r) => <option key={r} value={r}>{String(r).replace(".", ",")}%</option>)}
                      </select>
                    </div>
                  </div>
                  <p className="text-right text-sm font-semibold">{eur(Number(l.qty) * Number(l.unit_price))} HT</p>
                </>
              ) : (
                <div className="flex justify-between gap-3">
                  <div><p className="font-semibold">{l.label}</p>{l.description && <p className="text-sm text-slate-500">{l.description}</p>}
                    <p className="text-xs text-slate-400">{l.qty} {l.unit} × {eur(l.unit_price)} · TVA {l.vat_rate}%</p></div>
                  <p className="whitespace-nowrap font-semibold">{eur(Number(l.qty) * Number(l.unit_price))}</p>
                </div>
              )}
            </div>
          ))}
          {editable && (
            <div className="grid grid-cols-2 gap-2">
              <button className="btn-ghost" onClick={() => setModal("catalog")}>📚 Catalogue</button>
              <button className="btn-ghost" onClick={() => set({ lines: [...doc.lines, emptyLine()] })}>＋ Ligne libre</button>
            </div>
          )}
        </section>

        {/* Totaux */}
        <section className="card space-y-2">
          {editable && (
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Remise %</label><input className="input" inputMode="decimal" value={doc.discount_pct || ""} onChange={(e) => set({ discount_pct: e.target.value.replace(",", ".") as any })} /></div>
              {isQuote && <div><label className="label">Acompte %</label><input className="input" inputMode="decimal" value={doc.deposit_pct || ""} onChange={(e) => set({ deposit_pct: e.target.value.replace(",", ".") as any })} /></div>}
            </div>
          )}
          <div className="flex justify-between text-sm"><span>Total HT</span><span>{eur(totals.ht)}</span></div>
          {Object.entries(totals.byRate).filter(([r]) => Number(r) > 0).map(([r, v]) => (
            <div key={r} className="flex justify-between text-sm text-slate-500"><span>TVA {r.replace(".", ",")} %</span><span>{eur(v.vat)}</span></div>
          ))}
          <div className="flex justify-between border-t pt-2 text-lg font-extrabold"><span>Total TTC</span><span>{eur(totals.ttc)}</span></div>
          {margin && <p className="text-right text-xs text-slate-500">Marge estimée : {eur(margin.value)} ({margin.pct.toFixed(0)} %) — visible par vous seul</p>}
          <div><label className="label mt-2">Notes / conditions</label><textarea className="input text-sm" rows={2} disabled={!editable} value={doc.notes || ""} onChange={(e) => set({ notes: e.target.value })} /></div>
        </section>

        {/* Signature */}
        {doc.signature_data && (
          <section className="card">
            <p className="label">Signé par {doc.signer_name} le {new Date(doc.signed_at!).toLocaleString("fr-FR")}</p>
            <div className="flex items-center gap-4">
              {doc.signer_photo && <img src={doc.signer_photo} alt="Signataire" className="h-24 w-24 rounded-xl object-cover" />}
              <img src={doc.signature_data} alt="Signature" className="h-24" />
            </div>
          </section>
        )}
        {doc.status === "paid" && <p className="card text-sm text-green-800">✅ Payée le {dateFr(doc.paid_at)} ({doc.payment_method})</p>}

        {/* Actions */}
        <section className="space-y-2">
          {editable && <button className="btn-primary w-full py-3.5" disabled={busy} onClick={() => save()}>{busy ? "Enregistrement…" : "💾 Enregistrer"}</button>}

          {doc.id && (
            <div className="grid grid-cols-2 gap-2">
              <button className="btn-ghost" onClick={() => downloadPdf(doc, company)}>⬇️ PDF</button>
              <button className="btn-ghost" onClick={() => sharePdf(doc, company)}>📤 Partager PDF</button>
            </div>
          )}

          {doc.id && isQuote && editable && (
            <div className="grid grid-cols-2 gap-2">
              <button className="btn-brand" onClick={async () => { if (await save()) setModal("sign"); }}>✍️ Faire signer</button>
              <button className="btn-ghost" onClick={async () => { if (await save()) setModal("send"); }}>🔗 Envoyer le lien</button>
            </div>
          )}
          {doc.id && isQuote && ["signed", "sent", "draft"].includes(doc.status) && (
            <button className="btn-primary w-full" onClick={toInvoice}>⚡ Transformer en facture</button>
          )}
          {doc.id && isQuote && ["signed", "sent"].includes(doc.status) && (
            <button className="btn-ghost w-full" onClick={depositInvoice}>Facture d'acompte</button>
          )}
          {doc.id && !isQuote && doc.status === "draft" && (
            <button className="btn-brand w-full py-3.5" onClick={issueInvoice}>✅ Émettre {doc.kind === "credit" ? "l'avoir" : "la facture"}</button>
          )}
          {doc.kind === "invoice" && doc.status === "issued" && (
            <div className="grid grid-cols-2 gap-2">
              <button className="btn-brand" onClick={() => setModal("pay")}>💶 Marquer payée</button>
              <button className="btn-ghost" onClick={relance}>📧 Relancer</button>
            </div>
          )}
          {doc.kind === "invoice" && ["issued", "paid"].includes(doc.status) && (
            <button className="btn-ghost w-full" onClick={creditNote}>Créer un avoir</button>
          )}
          {doc.id && isQuote && <button className="btn-ghost w-full" onClick={duplicate}>Dupliquer</button>}
          {doc.id && isQuote && editable && <button className="btn-ghost w-full" onClick={() => save({ status: "refused" })}>Marquer refusé</button>}
          {doc.id && doc.status === "draft" && <button className="btn-danger w-full" onClick={remove}>Supprimer le brouillon</button>}
          {doc.id && doc.client_id && <Link href={`/app/planning?doc=${doc.id}&client=${doc.client_id}`} className="btn-ghost w-full">🗓 Planifier l'intervention</Link>}
        </section>
      </div>

      {/* Modales */}
      {modal === "catalog" && (
        <Modal title="Catalogue" onClose={() => setModal("")}>
          <input className="input mb-3" placeholder="Rechercher…" value={catQ} onChange={(e) => setCatQ(e.target.value)} />
          {catalog.length === 0 && <p className="text-sm text-slate-500">Catalogue vide. <Link href="/app/catalogue" className="text-brand">Ajouter des prestations →</Link></p>}
          <div className="space-y-2">
            {catalog.filter((c) => !catQ || `${c.label} ${c.category}`.toLowerCase().includes(catQ.toLowerCase())).map((c) => (
              <button key={c.id} className="card w-full text-left" onClick={() => {
                set({ lines: [...doc.lines, { label: c.label, description: c.description, qty: 1, unit: c.unit, unit_price: Number(c.unit_price), vat_rate: Number(c.vat_rate), cost_price: Number(c.cost_price) || 0 }] });
                setModal("");
              }}>
                <p className="text-xs text-slate-400">{c.category}</p>
                <div className="flex justify-between"><span className="font-semibold">{c.label}</span><span>{eur(c.unit_price)}</span></div>
              </button>
            ))}
          </div>
        </Modal>
      )}

      {modal === "client" && (
        <Modal title="Nouveau client" onClose={() => setModal("")}>
          <div className="space-y-3">
            <select className="input" value={newClient.type} onChange={(e) => setNewClient({ ...newClient, type: e.target.value })}>
              <option value="particulier">Particulier</option><option value="professionnel">Professionnel</option>
            </select>
            <input className="input" placeholder="Nom / raison sociale *" value={newClient.name || ""} onChange={(e) => setNewClient({ ...newClient, name: e.target.value })} />
            <input className="input" placeholder="Téléphone" inputMode="tel" value={newClient.phone || ""} onChange={(e) => setNewClient({ ...newClient, phone: e.target.value })} />
            <input className="input" placeholder="E-mail" type="email" value={newClient.email || ""} onChange={(e) => setNewClient({ ...newClient, email: e.target.value })} />
            <input className="input" placeholder="Adresse" value={newClient.address || ""} onChange={(e) => setNewClient({ ...newClient, address: e.target.value })} />
            <div className="grid grid-cols-3 gap-2">
              <input className="input" placeholder="CP" inputMode="numeric" value={newClient.zip || ""} onChange={(e) => setNewClient({ ...newClient, zip: e.target.value })} />
              <input className="input col-span-2" placeholder="Ville" value={newClient.city || ""} onChange={(e) => setNewClient({ ...newClient, city: e.target.value })} />
            </div>
            {newClient.type === "professionnel" && <input className="input" placeholder="SIREN / SIRET" value={newClient.siret || ""} onChange={(e) => setNewClient({ ...newClient, siret: e.target.value })} />}
            <button className="btn-primary w-full" onClick={addClient}>Ajouter</button>
          </div>
        </Modal>
      )}

      {modal === "sign" && (
        <Modal title={`Signature — ${eur(totals.ttc)} TTC`} onClose={() => setModal("")}>
          <SignaturePad defaultName={client?.name || ""} onCancel={() => setModal("")}
            onDone={async (name, sig, photo) => { setModal(""); await save({ status: "signed", signer_name: name, signature_data: sig, signer_photo: photo, signed_at: new Date().toISOString() }); }} />
        </Modal>
      )}

      {modal === "send" && (
        <Modal title="Envoyer le devis à signer" onClose={() => setModal("")}>
          <p className="mb-3 text-sm text-slate-600">Le client ouvre le lien, consulte le devis et signe depuis son téléphone.</p>
          <input className="input mb-3 text-xs" readOnly value={publicUrl} onFocus={(e) => e.target.select()} />
          <div className="grid gap-2">
            <button className="btn-ghost" onClick={async () => { await navigator.clipboard.writeText(publicUrl); await save({ status: "sent" }); alert("Lien copié"); }}>📋 Copier le lien</button>
            <a className="btn-ghost" onClick={() => save({ status: "sent" })} target="_blank" rel="noreferrer"
              href={`https://wa.me/${(client?.phone || "").replace(/\D/g, "").replace(/^0/, "33")}?text=${encodeURIComponent(`Bonjour, voici votre devis ${doc.number} de ${company.name} (${eur(totals.ttc)} TTC). Vous pouvez le consulter et le signer ici : ${publicUrl}`)}`}>💬 WhatsApp</a>
            <a className="btn-ghost" onClick={() => save({ status: "sent" })}
              href={`sms:${client?.phone || ""}?body=${encodeURIComponent(`Votre devis ${company.name} : ${publicUrl}`)}`}>📱 SMS</a>
            <a className="btn-ghost" onClick={() => save({ status: "sent" })}
              href={`mailto:${client?.email || ""}?subject=${encodeURIComponent(`Devis ${doc.number} — ${company.name}`)}&body=${encodeURIComponent(`Bonjour,\n\nVeuillez trouver votre devis n° ${doc.number} d'un montant de ${eur(totals.ttc)} TTC.\nVous pouvez le consulter et le signer en ligne :\n${publicUrl}\n\nCordialement,\n${company.name}`)}`}>📧 E-mail</a>
          </div>
        </Modal>
      )}

      {modal === "pay" && (
        <Modal title="Enregistrer le paiement" onClose={() => setModal("")}>
          <div className="grid gap-2">
            {["Virement", "Chèque", "Espèces", "Carte bancaire"].map((m) => (
              <button key={m} className="btn-ghost" onClick={async () => { setModal(""); await save({ status: "paid", paid_at: new Date().toISOString(), payment_method: m }); }}>{m}</button>
            ))}
          </div>
        </Modal>
      )}
    </>
  );
}

export default function Page() { return <Suspense><Editor /></Suspense>; }
