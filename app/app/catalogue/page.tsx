"use client";
import { useEffect, useState } from "react";
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

export default function Catalogue() {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [edit, setEdit] = useState<Partial<CatalogItem> | null>(null);
  const [q, setQ] = useState("");
  const load = () => sb().from("catalog_items").select("*").order("category").order("label").then(({ data }) => setItems(data || []));
  useEffect(() => { load(); }, []);

  async function save() {
    if (!edit?.label) return;
    const { id, ...rest } = edit as CatalogItem;
    const row = { ...rest, unit_price: Number(String(rest.unit_price).replace(",", ".")) || 0, cost_price: Number(String(rest.cost_price ?? 0).replace(",", ".")) || 0 };
    id ? await sb().from("catalog_items").update(row).eq("id", id) : await sb().from("catalog_items").insert(row);
    setEdit(null); load();
  }
  async function del() { if (edit?.id && confirm("Supprimer ?")) { await sb().from("catalog_items").delete().eq("id", edit.id); setEdit(null); load(); } }
  async function starter() { await sb().from("catalog_items").insert(STARTER); load(); }

  const cats = Array.from(new Set(items.map((i) => i.category)));
  const shown = items.filter((i) => !q || `${i.label} ${i.category}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <>
      <Header back title="Catalogue" right={<button className="btn-brand !px-3 !py-1.5 text-sm" onClick={() => setEdit({ category: "Prestation", unit: "u", vat_rate: 10, unit_price: 0 })}>＋ Article</button>} />
      <div className="space-y-3 p-4">
        {items.length === 0 && (
          <div className="card text-center">
            <p className="mb-3 text-sm text-slate-600">Démarrez avec un catalogue type plomberie/chauffage (prix modifiables).</p>
            <button className="btn-primary w-full" onClick={starter}>Charger le catalogue de départ</button>
          </div>
        )}
        {items.length > 0 && <input className="input" placeholder="Rechercher…" value={q} onChange={(e) => setQ(e.target.value)} />}
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
      </div>
      {edit && (
        <Modal title={edit.id ? "Modifier l'article" : "Nouvel article"} onClose={() => setEdit(null)}>
          <div className="space-y-3">
            <div><label className="label">Catégorie</label><input className="input" list="cats" value={edit.category || ""} onChange={(e) => setEdit({ ...edit, category: e.target.value })} />
              <datalist id="cats">{cats.map((c) => <option key={c} value={c} />)}</datalist></div>
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
