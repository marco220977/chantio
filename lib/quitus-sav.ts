"use client";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { Company } from "./types";
import type { Equipment } from "./maintenance";
import { dateFr } from "./calc";
import { toDataUrl } from "./pdf";
import { box, clientLines, equipLines, footer, header, paragraph, signatures } from "./pdf-maintenance";

export type Reserve = { label: string; deadline?: string; lifted_at?: string | null };
export type Reception = {
  id: string; number?: string; status: string; chantier_id?: string | null; document_id?: string | null;
  client_id?: string | null; client_snapshot?: any; address?: string; works?: string; works_end_date?: string;
  reception_date?: string; with_reserves?: boolean; reserves: Reserve[]; notes?: string;
  signed_at?: string; signer_name?: string; signature_data?: string; signer_photo?: string | null;
  company_signer?: string; reserves_lifted_at?: string | null; sent_at?: string; sent_to?: string; created_at?: string;
};
export type Ticket = {
  id: string; number?: string; status: string; priority?: string; origin?: string; client_id?: string | null;
  client_snapshot?: any; address?: string; equipment: Equipment; contract_id?: string | null; chantier_id?: string | null;
  warranty?: string; problem?: string; scheduled_at?: string | null; technician?: string; diagnosis?: string;
  actions?: string; parts?: string; billable?: boolean; photos: string[]; resolved_at?: string | null;
  signed_at?: string; signer_name?: string; signature_data?: string; document_id?: string | null;
  sent_at?: string; sent_to?: string; created_at?: string; assigned_to?: string | null;
};

export const SAV_STATUS: Record<string, [string, string]> = {
  open: ["Nouveau", "bg-red-100 text-red-700"],
  planned: ["Planifié", "bg-blue-100 text-blue-800"],
  in_progress: ["En cours", "bg-amber-100 text-amber-800"],
  waiting_parts: ["Attente pièce", "bg-purple-100 text-purple-800"],
  resolved: ["Résolu", "bg-green-100 text-green-800"],
  closed: ["Clôturé", "bg-slate-200 text-slate-600"],
};
export const WARRANTY: Record<string, string> = {
  parfait_achevement: "Garantie de parfait achèvement (1 an)",
  biennale: "Garantie biennale de bon fonctionnement (2 ans)",
  decennale: "Garantie décennale",
  fabricant: "Garantie fabricant",
  contrat: "Contrat d'entretien",
  hors_garantie: "Hors garantie (facturable)",
};
export const ORIGINS = ["Téléphone", "SMS / WhatsApp", "E-mail", "Sur place", "Visite d'entretien"];

const addYears = (d: string, n: number) => { const x = new Date(d); x.setFullYear(x.getFullYear() + n); return x.toISOString().slice(0, 10); };

// Garantie applicable à partir d'un quitus signé
export function warrantyFromReception(receptionDate?: string): string {
  if (!receptionDate) return "hors_garantie";
  const now = new Date().toISOString().slice(0, 10);
  if (now <= addYears(receptionDate, 1)) return "parfait_achevement";
  if (now <= addYears(receptionDate, 2)) return "biennale";
  if (now <= addYears(receptionDate, 10)) return "decennale";
  return "hors_garantie";
}

// ---------------- PV DE RÉCEPTION / QUITUS ----------------
export async function buildReceptionPdf(r: Reception, company: Company) {
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const M = 15;
  let y = await header(pdf, company, "PROCÈS-VERBAL DE RÉCEPTION DES TRAVAUX", r.number || "", [`Date de réception : ${dateFr(r.reception_date)}`]);
  const h1 = box(pdf, M, y, 88, "Maître d'ouvrage (client)", clientLines(r.client_snapshot));
  const h2 = box(pdf, 107, y, 88, "Entreprise", [company.name, [company.address, company.zip, company.city].filter(Boolean).join(" "), company.siret ? `SIRET ${company.siret}` : "", company.insurance ? `Assurance : ${company.insurance}` : ""].filter(Boolean) as string[]);
  y += Math.max(h1, h2) + 6;
  y = paragraph(pdf, y, "Lieu des travaux", r.address || "");
  y = paragraph(pdf, y, "Nature des travaux", r.works || "");
  if (r.works_end_date) y = paragraph(pdf, y, "Date d'achèvement des travaux", dateFr(r.works_end_date));

  y = paragraph(pdf, y, "Décision du maître d'ouvrage",
    `Après visite des travaux effectuée contradictoirement le ${dateFr(r.reception_date)}, le maître d'ouvrage déclare que la réception est prononcée ` +
    (r.with_reserves && r.reserves.length ? "AVEC les réserves mentionnées ci-dessous." : "SANS réserve."));

  if (r.with_reserves && r.reserves.length) {
    autoTable(pdf, {
      startY: y, margin: { left: M, right: M },
      head: [["Réserves", "À lever avant le", "Levée le"]],
      body: r.reserves.map((x) => [x.label, x.deadline ? dateFr(x.deadline) : "", x.lifted_at ? dateFr(x.lifted_at) : ""]),
      styles: { fontSize: 8.5, cellPadding: 2 }, headStyles: { fillColor: [185, 28, 28] },
      columnStyles: { 1: { cellWidth: 32 }, 2: { cellWidth: 25 } },
    });
    y = (pdf as any).lastAutoTable.finalY + 5;
    if (r.reserves_lifted_at) y = paragraph(pdf, y, "Levée des réserves", `L'ensemble des réserves a été levé le ${dateFr(r.reserves_lifted_at)}.`);
  }

  const d = r.reception_date || new Date().toISOString().slice(0, 10);
  y = paragraph(pdf, y, "Effets de la réception",
    `La réception constitue le point de départ des garanties légales (articles 1792 et suivants du Code civil) :\n` +
    `• garantie de parfait achèvement : jusqu'au ${dateFr(addYears(d, 1))} ;\n` +
    `• garantie de bon fonctionnement des éléments d'équipement dissociables (biennale) : jusqu'au ${dateFr(addYears(d, 2))} ;\n` +
    `• garantie décennale : jusqu'au ${dateFr(addYears(d, 10))}.\n` +
    `Les désordres apparents non signalés au présent procès-verbal sont réputés acceptés.`);
  if (r.notes) y = paragraph(pdf, y, "Observations", r.notes);
  y = paragraph(pdf, y, "Quitus", `Sous réserve de la levée des éventuelles réserves ci-dessus, le maître d'ouvrage donne quitus à ${company.name} pour l'exécution des travaux décrits.`);

  signatures(pdf, y + 2, company, "Le maître d'ouvrage", { name: r.signer_name, data: r.signature_data, at: r.signed_at, photo: r.signer_photo }, r.company_signer);
  footer(pdf, company);
  return pdf;
}

// ---------------- BON D'INTERVENTION SAV ----------------
export async function buildSavPdf(t: Ticket, company: Company, photoUrls: Record<string, string> = {}) {
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const M = 15;
  let y = await header(pdf, company, "BON D'INTERVENTION SAV", t.number || "", [
    `Demande du : ${dateFr(t.created_at)}`, t.scheduled_at ? `Intervention : ${new Date(t.scheduled_at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}` : "",
    t.technician ? `Technicien : ${t.technician}` : "",
  ].filter(Boolean));
  const h1 = box(pdf, M, y, 88, "Client", clientLines(t.client_snapshot, t.address));
  const h2 = box(pdf, 107, y, 88, "Équipement", t.equipment?.type || t.equipment?.brand ? equipLines(t.equipment) : ["—"]);
  y += Math.max(h1, h2) + 6;
  y = paragraph(pdf, y, "Prise en charge", `${WARRANTY[t.warranty || "hors_garantie"]}${t.priority === "urgent" ? " — URGENT" : ""}`);
  y = paragraph(pdf, y, "Problème signalé", t.problem || "");
  y = paragraph(pdf, y, "Diagnostic", t.diagnosis || "");
  y = paragraph(pdf, y, "Travaux réalisés", t.actions || "");
  if (t.parts) y = paragraph(pdf, y, "Pièces remplacées / fournies", t.parts);
  if (t.resolved_at) y = paragraph(pdf, y, "Résolution", `Intervention terminée le ${dateFr(t.resolved_at)}.`);

  const photos = t.photos.filter((p) => photoUrls[p]).slice(0, 4);
  if (photos.length) {
    if (y + 50 > 280) { pdf.addPage(); y = M; }
    pdf.setFont("helvetica", "bold").setFontSize(9.5).text("Photos", M, y); y += 3;
    let x = M;
    for (const p of photos) {
      const img = await toDataUrl(photoUrls[p]); if (!img) continue;
      const pr = pdf.getImageProperties(img); const h = 40, w = Math.min(42, (pr.width / pr.height) * h);
      pdf.addImage(img, "JPEG", x, y, w, h); x += 45;
    }
    y += 45;
  }
  signatures(pdf, y + 2, company, "Le client — intervention constatée", { name: t.signer_name, data: t.signature_data, at: t.signed_at }, t.technician);
  footer(pdf, company);
  return pdf;
}
