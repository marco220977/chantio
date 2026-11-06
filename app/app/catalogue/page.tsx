"use client";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { sb } from "@/lib/supabase";
import { eur, VAT_RATES } from "@/lib/calc";
import Header from "@/components/Header";
import Modal from "@/components/Modal";
import type { CatalogItem } from "@/lib/types";

const STARTER: Omit<CatalogItem, "id">[] = [
  { category: "Main d'œuvre", label: "Main d'œuvre plombier chauffagiste", unit: "h", unit_price: 55, vat_rate: 10, cost_price: 0 },
  { category: "Main d'œuvre", label: "Déplacement", unit: "forfait", unit_price: 35, vat_rate: 10, cost_price: 0 },
  { category: "Dépannage", label: "Recherche de fuite", unit: "forfait", unit_price: 180, vat_rate: 10, cost_price: 0 },
  { category: "Dépannage", label: "Débouchage canalisation", unit: "forfait", unit_price: 150, vat_rate: 10, cost_price: 0 },
  { category: "Entretien", label: "Entretien annuel chaudière gaz", description: "Nettoyage, contrôle combustion, attestation d'entretien", unit: "forfait", unit_price: 120, vat_rate: 10, cost_price: 0 },
  { category: "Entretien", label: "Entretien pompe à chaleur air/eau", unit: "forfait", unit_price: 190, vat_rate: 10, cost_price: 0 },
  { category: "Chauffage", label: "Fourniture et pose chaudière gaz à condensation", unit: "u", unit_price: 3800, vat_rate: 5.5, cost_price: 2100 },
  { category: "Chauffage", label: "Fourniture et pose PAC air/eau 8 kW", unit: "u", unit_price: 11500, vat_rate: 5.5, cost_price: 6500 },
  { category: "Chauffage", label: "Désembouage circuit de chauffage", unit: "forfait", unit_price: 650, vat_rate: 10, cost_price: 80 },
  { category: "Chauffage", label: "Fourniture et pose radiateur acier", unit: "u", unit_price: 420, vat_rate: 10, cost_price: 160 },
  { category: "Sanitaire", label: "Fourniture et pose chauffe-eau électrique 200 L", unit: "u", unit_price: 1150, vat_rate: 10, cost_price: 450 },
  { category: "Sanitaire", label: "Fourniture et pose WC suspendu", unit: "u", unit_price: 890, vat_rate: 10, cost_price: 320 },
  { category: "Sanitaire", label: "Remplacement mitigeur", unit: "u", unit_price: 190, vat_rate: 10, cost_price: 60 },
  { category: "Fournitures", label: "Petites fournitures", unit: "forfait", unit_price: 30, vat_rate: 10, cost_price: 10 },
];

function SupplierTab({ onEdit, version }: { onEdit: (i: CatalogItem) => void; version: number }) {
  const [sups, setSups] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [only, setOnly] = useState("all");
  const [res, setRes] = useState<CatalogItem[]>([]);
  const [busy, setBusy] = useState(false);
  const loadSups = () => sb().from("suppliers").select("*").order("name").then(({ data }) => setSups(data || []));
  useEffect(() => { loadSups(); }, [version]);
  useEffect(() => {
    const t = setTimeout(async () => {
      let qy = sb().from("catalog_items").select("*").not("supplier", "is", null);
      if (only !== "all") qy = qy.eq("supplier", only);
      const words = q.trim().split(/\s+/).filter(Boolean);
      for (const w of words) qy = qy.or(`label.ilike.%${w.replace(/[%,()]/g, "")}%,ref.ilike.%${w.replace(/[%,()]/g, "")}%`);
      const { data } = await qy.order("label").limit(50);
      setRes(data || []);
    }, 300);
    return () => clearTimeout(t);
  }, [q, only, version]);

  async function coef(s: any) {
    const v = Number((prompt(`Nouveau coefficient de vente pour ${s.name} (actuel : ${s.coef})`, String(s.coef)) || "").replace(",", "."));
    if (!v || v <= 0) return;
    setBusy(true); await sb().rpc("apply_supplier_coef", { p_supplier: s.name, p_coef: v }); setBusy(false); loadSups(); setQ(q + "");
  }
  async function remove(s: any) {
    if (!confirm(`Supprimer tout le tarif ${s.name} (${s.item_count} articles) du catalogue ? Les devis déjà faits ne changent pas.`)) return;
    setBusy(true);
    await sb().from("catalog_items").delete().eq("supplier", s.name);
    await sb().from("suppliers").delete().eq("id", s.id);
    setBusy(false); loadSups(); setRes([]);
  }

  return (
    <div className="space-y-3">
      <Link href="/app/catalogue/import" className="btn-brand w-full py-3.5">📥 Importer un tarif fournisseur</Link>
      {sups.length === 0 && <p className="py-6 text-center text-sm text-slate-500">Aucun tarif importé. Demandez à votre fournisseur votre fichier tarif (Excel, CSV ou FAB-DIS).</p>}
      {sups.map((s) => (
        <div key={s.id} className="card space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div><p className="font-bold">🏭 {s.name}</p>
              <p className="text-xs text-slate-500">{(s.item_count || 0).toLocaleString("fr-FR")} articles · coef. {String(s.coef).replace(".", ",")}{s.last_import_at ? ` · mis à jour le ${new Date(s.last_import_at).toLocaleDateString("fr-FR")}` : ""}</p></div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Link href={`/app/catalogue/import?fournisseur=${encodeURIComponent(s.name)}`} className="btn-ghost !py-1.5 text-xs">🔄 Mettre à jour</Link>
            <button className="btn-ghost !py-1.5 text-xs" disabled={busy} onClick={() => coef(s)}>✖️ Coefficient</button>
            <button className="btn-danger !py-1.5 text-xs" disabled={busy} onClick={() => remove(s)}>Supprimer</button>
          </div>
        </div>
      ))}
      {sups.length > 0 && (
        <>
          <input className="input" placeholder="Rechercher une référence ou un article…" value={q} onChange={(e) => setQ(e.target.value)} />
          {sups.length > 1 && (
            <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1">
              {["all", ...sups.map((s) => s.name)].map((n) => (
                <button key={n} onClick={() => setOnly(n)} className={`chip whitespace-nowrap border py-1.5 ${only === n ? "border-ink bg-ink text-white" : "border-slate-200 bg-white"}`}>{n === "all" ? "Tous" : n}</button>
              ))}
            </div>
          )}
          <div className="space-y-2">
            {res.map((i: any) => (
              <button key={i.id} className="card flex w-full justify-between gap-3 text-left" onClick={() => onEdit(i)}>
                <span className="min-w-0"><span className="block truncate font-medium">{i.label}</span><span className="block text-xs text-slate-500">{i.supplier} · {i.ref} · achat {eur(i.cost_price)}</span></span>
                <span className="whitespace-nowrap text-sm font-semibold">{eur(i.unit_price)}</span>
              </button>
            ))}
            {res.length === 50 && <p className="text-center text-xs text-slate-500">50 premiers résultats — précisez la recherche.</p>}
          </div>
        </>
      )}
    </div>
  );
}

function Catalogue() {
  const [tab, setTab] = useState(useSearchParams().get("tab") === "fournisseurs" ? "fournisseurs" : "mine");
  const [version, setVersion] = useState(0);
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [edit, setEdit] = useState<Partial<CatalogItem> | null>(null);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [msg, setMsg] = useState("");
  const load = () => sb().from("catalog_items").select("*").is("supplier", null).order("category").order("label").then(({ data }) => setItems(data || []));
  useEffect(() => { load(); }, []);

  async function save() {
    if (!edit?.label) return;
    const { id, ...rest } = edit as CatalogItem;
    const row = { ...rest, unit_price: Number(String(rest.unit_price).replace(",", ".")) || 0, cost_price: Number(String(rest.cost_price ?? 0).replace(",", ".")) || 0 };
    id ? await sb().from("catalog_items").update(row).eq("id", id) : await sb().from("catalog_items").insert(row);
    setEdit(null); load(); setVersion((v) => v + 1);
  }
  async function del() { if (edit?.id && confirm("Supprimer ?")) { await sb().from("catalog_items").delete().eq("id", edit.id); setEdit(null); load(); } }
  async function starter() {
    const { data, error } = await sb().rpc("complete_my_catalog");
    if (error) { await sb().from("catalog_items").insert(STARTER); }
    setMsg(error ? "" : `✅ ${data || 0} article(s) ajouté(s)`); setTimeout(() => setMsg(""), 4000);
    load();
  }

  const cats = Array.from(new Set(items.map((i) => i.category)));
  const shown = items.filter((i) => (cat === "all" || i.category === cat) && (!q || `${i.label} ${i.category}`.toLowerCase().includes(q.toLowerCase())));

  return (
    <>
      <Header back title="Catalogue" right={<button className="btn-brand !px-3 !py-1.5 text-sm" onClick={() => setEdit({ category: "Prestation", unit: "u", vat_rate: 10, unit_price: 0 })}>＋ Article</button>} />
      <div className="space-y-3 p-4">
        <div className="grid grid-cols-2 rounded-xl bg-slate-200 p-1">
          {[["mine", "Mes prestations"], ["fournisseurs", "Tarifs fournisseurs"]].map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} className={`rounded-lg py-2 text-sm font-semibold ${tab === k ? "bg-white shadow" : "text-slate-600"}`}>{l}</button>
          ))}
        </div>
        {tab === "fournisseurs" ? <SupplierTab onEdit={(i) => setEdit(i)} version={version} /> : <>
        {items.length === 0 && (
          <div className="card text-center">
            <p className="mb-3 text-sm text-slate-600">Démarrez avec un catalogue type plomberie/chauffage (prix modifiables).</p>
            <button className="btn-primary w-full" onClick={starter}>Charger le catalogue type (170 articles)</button>
          </div>
        )}
        {msg && <p className="rounded-xl bg-green-50 p-3 text-sm text-green-800">{msg}</p>}
        {items.length > 0 && <input className="input" placeholder={`Rechercher parmi ${items.length} articles…`} value={q} onChange={(e) => setQ(e.target.value)} />}
        {items.length > 0 && (
          <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1">
            {["all", ...cats].map((c) => (
              <button key={c} onClick={() => setCat(c)} className={`chip whitespace-nowrap border py-1.5 ${cat === c ? "border-ink bg-ink text-white" : "border-slate-200 bg-white"}`}>{c === "all" ? "Tout" : c}</button>
            ))}
          </div>
        )}
        {items.length > 0 && <button className="btn-ghost w-full text-sm" onClick={starter}>📚 Compléter avec le catalogue type (sans toucher à mes prix)</button>}
        {cats.map((c) => {
          const rows = shown.filter((i) => i.category === c);
          if (!rows.length) return null;
          return (
            <div key={c}>
              <h2 className="label mt-2">{c}</h2>
              <div className="space-y-2">
                {rows.map((i) => (
                  <button key={i.id} className="card flex w-full justify-between gap-3 text-left" onClick={() => setEdit(i)}>
                    <span className="font-medium">{i.label}</span>
                    <span className="whitespace-nowrap text-sm">{eur(i.unit_price)}<span className="text-slate-400"> /{i.unit}</span></span>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
        </>}
      </div>
      {edit && (
        <Modal title={edit.id ? "Modifier l'article" : "Nouvel article"} onClose={() => setEdit(null)}>
          <div className="space-y-3">
            <div><label className="label">Catégorie</label><input className="input" list="cats" value={edit.category || ""} onChange={(e) => setEdit({ ...edit, category: e.target.value })} />
              <datalist id="cats">{cats.map((c) => <option key={c} value={c} />)}</datalist></div>
            {(edit as any).supplier && <p className="rounded-lg bg-slate-50 p-2 text-xs text-slate-600">🏭 {(edit as any).supplier} · réf. {(edit as any).ref}{(edit as any).public_price ? ` · prix public ${eur((edit as any).public_price)}` : ""}. Ce prix sera écrasé au prochain import du tarif.</p>}
            <div><label className="label">Désignation</label><input className="input" value={edit.label || ""} onChange={(e) => setEdit({ ...edit, label: e.target.value })} /></div>
            <div><label className="label">Description</label><textarea className="input" rows={2} value={edit.description || ""} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></div>
            <div className="grid grid-cols-3 gap-2">
              <div><label className="label">Prix HT</label><input className="input" inputMode="decimal" value={edit.unit_price ?? ""} onChange={(e) => setEdit({ ...edit, unit_price: e.target.value as any })} /></div>
              <div><label className="label">Unité</label><input className="input" value={edit.unit || ""} onChange={(e) => setEdit({ ...edit, unit: e.target.value })} /></div>
              <div><label className="label">TVA</label><select className="input" value={edit.vat_rate} onChange={(e) => setEdit({ ...edit, vat_rate: Number(e.target.value) })}>{VAT_RATES.map((r) => <option key={r} value={r}>{r}%</option>)}</select></div>
            </div>
            <div><label className="label">Prix d'achat HT (pour la marge, non affiché au client)</label><input className="input" inputMode="decimal" value={edit.cost_price ?? ""} onChange={(e) => setEdit({ ...edit, cost_price: e.target.value as any })} /></div>
            <button className="btn-primary w-full" onClick={save}>Enregistrer</button>
            {edit.id && <button className="btn-danger w-full" onClick={del}>Supprimer</button>}
          </div>
        </Modal>
      )}
    </>
  );
}

export default function Page() { return <Suspense><Catalogue /></Suspense>; }
