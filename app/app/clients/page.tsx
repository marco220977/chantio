"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { sb } from "@/lib/supabase";
import Header from "@/components/Header";
import Modal from "@/components/Modal";
import type { Client } from "@/lib/types";
import { useCompany } from "@/components/CompanyContext";

export default function Clients() {
  const [list, setList] = useState<Client[]>([]);
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState<Partial<Client> | null>(null);
  const [err, setErr] = useState("");
  const { isSup } = useCompany();

  const load = () => sb().from("clients").select("*").order("name").then(({ data }) => setList(data || []));
  useEffect(() => { load(); }, []);

  async function save() {
    if (!edit?.name) return;
    const s = sb();
    const { id, ...rest } = edit as Client;
    const { error } = id ? await s.from("clients").update(rest).eq("id", id) : await s.from("clients").insert(rest);
    if (error) return setErr(error.message);
    setEdit(null); load();
  }
  async function del() {
    if (!edit?.id || !confirm("Supprimer ce client ? (ses documents sont conservés)")) return;
    await sb().from("clients").delete().eq("id", edit.id); setEdit(null); load();
  }

  const f = (k: keyof Client, ph: string, type = "text") => (
    <input className="input" placeholder={ph} type={type} value={(edit as any)?.[k] || ""} onChange={(e) => setEdit({ ...edit!, [k]: e.target.value })} />
  );

  return (
    <>
      <Header back title="Clients" right={<button className="btn-brand !px-3 !py-1.5 text-sm" onClick={() => setEdit({ type: "particulier" })}>＋ Client</button>} />
      <div className="space-y-2 p-4">
        <input className="input" placeholder="Rechercher…" value={q} onChange={(e) => setQ(e.target.value)} />
        {list.filter((c) => !q || `${c.name} ${c.city} ${c.phone}`.toLowerCase().includes(q.toLowerCase())).map((c) => (
          <div key={c.id} className="card flex items-center gap-3">
            <button className="min-w-0 flex-1 text-left" onClick={() => setEdit(c)}>
              <p className="truncate font-semibold">{c.name}</p>
              <p className="truncate text-sm text-slate-500">{[c.city, c.phone].filter(Boolean).join(" · ")}</p>
            </button>
            {c.phone && <a href={`tel:${c.phone}`} className="text-xl">📞</a>}
            {isSup ? <Link href={`/app/doc/nouveau?kind=quote&client=${c.id}`} className="chip bg-flame-light py-1.5 text-flame">Devis</Link>
              : <Link href={`/app/sav/nouveau?client=${c.id}`} className="chip bg-flame-light py-1.5 text-flame">SAV</Link>}
          </div>
        ))}
        {list.length === 0 && <p className="py-10 text-center text-slate-500">Aucun client.</p>}
      </div>
      {edit && (
        <Modal title={edit.id ? "Modifier le client" : "Nouveau client"} onClose={() => setEdit(null)}>
          <div className="space-y-3">
            {err && <p className="text-sm text-red-600">{err}</p>}
            <select className="input" value={edit.type} onChange={(e) => setEdit({ ...edit, type: e.target.value })}>
              <option value="particulier">Particulier</option><option value="professionnel">Professionnel</option>
            </select>
            {f("name", "Nom / raison sociale *")}{f("phone", "Téléphone", "tel")}{f("email", "E-mail", "email")}{f("address", "Adresse")}
            <div className="grid grid-cols-3 gap-2">{f("zip", "CP")}<div className="col-span-2">{f("city", "Ville")}</div></div>
            {edit.type === "professionnel" && f("siret", "SIREN / SIRET")}
            <textarea className="input" rows={2} placeholder="Notes (code portail, matériel en place…)" value={edit.notes || ""} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} />
            <button className="btn-primary w-full" onClick={save}>Enregistrer</button>
            {edit.id && <button className="btn-danger w-full" onClick={del}>Supprimer</button>}
          </div>
        </Modal>
      )}
    </>
  );
}
