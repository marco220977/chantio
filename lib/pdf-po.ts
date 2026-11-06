"use client";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { Company } from "./types";
import { money } from "./pdf";
import { dateFr } from "./calc";
import { footer, header, paragraph } from "./pdf-maintenance";

export type PoLine = { ref?: string | null; label: string; qty: number; unit: string; cost_price: number };
export type PurchaseOrder = { id: string; number?: string; supplier: string; lines: PoLine[]; total_ht: number; created_at?: string; delivery_address?: string; notes?: string; status?: string; sent_at?: string; sent_to?: string };

export async function buildPoPdf(po: PurchaseOrder, company: Company) {
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const M = 15;
  let y = await header(pdf, company, "BON DE COMMANDE", po.number || "", [`Date : ${dateFr(po.created_at || new Date().toISOString())}`, `Fournisseur : ${po.supplier}`]);
  y = paragraph(pdf, y, "Adresse de livraison", po.delivery_address || [company.address, company.zip, company.city].filter(Boolean).join(" "));
  autoTable(pdf, {
    startY: y, margin: { left: M, right: M },
    head: [["Réf.", "Désignation", "Qté", "Unité", "PU HT", "Total HT"]],
    body: po.lines.map((l) => [l.ref || "", l.label, String(l.qty).replace(".", ","), l.unit, money(l.cost_price), money(l.qty * l.cost_price)]),
    styles: { fontSize: 8.5, cellPadding: 2 }, headStyles: { fillColor: [15, 27, 45] },
    columnStyles: { 0: { cellWidth: 28 }, 2: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right" } },
  });
  y = (pdf as any).lastAutoTable.finalY + 6;
  pdf.setFont("helvetica", "bold").setFontSize(11).text(`Total HT : ${money(po.total_ht)}`, 195, y, { align: "right" });
  y += 8;
  if (po.notes) y = paragraph(pdf, y, "Remarques", po.notes);
  paragraph(pdf, y, "", "Merci de confirmer la disponibilité et le délai de livraison. Prix selon nos conditions tarifaires en vigueur.");
  footer(pdf, company);
  return pdf;
}
