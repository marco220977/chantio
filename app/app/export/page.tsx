"use client";
import { useState } from "react";
import { sb } from "@/lib/supabase";
import Header from "@/components/Header";

export default function Export() {
  const y = new Date().getFullYear();
  const [from, setFrom] = useState(`${y}-01-01`);
  const [to, setTo] = useState(`${y}-12-31`);

  async function exportCsv() {
    const { data } = await sb().from("documents").select("*").in("kind", ["invoice", "credit"]).neq("status", "draft")
      .gte("issue_date", from).lte("issue_date", to).order("number");
    const rows = [["Type", "Numéro", "Date", "Client", "Total HT", "TVA", "Total TTC", "Statut", "Payée le", "Mode"]];
    for (const d of data || []) rows.push([
      d.kind === "credit" ? "Avoir" : "Facture", d.number, d.issue_date, d.client_snapshot?.name || "",
      String(d.total_ht).replace(".", ","), String(d.total_vat).replace(".", ","), String(d.total_ttc).replace(".", ","),
      d.status, d.paid_at?.slice(0, 10) || "", d.payment_method || "",
    ]);
    const csv = "﻿" + rows.map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(";")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = `factures_${from}_${to}.csv`; a.click();
  }

  return (
    <>
      <Header back title="Export comptable" />
      <div className="space-y-3 p-4">
        <p className="text-sm text-slate-600">Livre des factures émises, au format CSV (ouvrable dans Excel / à envoyer au comptable).</p>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">Du</label><input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div><label className="label">Au</label><input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        </div>
        <button className="btn-primary w-full" onClick={exportCsv}>Télécharger le CSV</button>
      </div>
    </>
  );
}
