"use client";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { Company } from "./types";
import { money, toDataUrl } from "./pdf";
import { dateFr } from "./calc";
import { contractEnd, EQUIPMENT, equipmentLabel, type Contract, type Equipment, type Report } from "./maintenance";

const W = 210, M = 15;

export async function header(pdf: jsPDF, company: Company, title: string, number: string, meta: string[]) {
  let y = M;
  if (company.logo_url) {
    const img = await toDataUrl(company.logo_url);
    if (img) { try { pdf.addImage(img, M, y, 30, 18, undefined, "FAST"); y += 20; } catch {} }
  }
  pdf.setFont("helvetica", "bold").setFontSize(12).setTextColor(0).text(company.name || "", M, y + 4);
  pdf.setFont("helvetica", "normal").setFontSize(9);
  const co = [company.address, [company.zip, company.city].filter(Boolean).join(" "),
    company.phone && `Tél. ${company.phone}`, company.email, company.siret && `SIRET ${company.siret}`].filter(Boolean) as string[];
  pdf.text(co, M, y + 9);
  pdf.setFont("helvetica", "bold").setFontSize(15).setTextColor(29, 78, 216);
  pdf.text(pdf.splitTextToSize(title, 95), W - M, M + 6, { align: "right" });
  pdf.setTextColor(0).setFontSize(10).text(`N° ${number || "BROUILLON"}`, W - M, M + 18, { align: "right" });
  pdf.setFont("helvetica", "normal").setFontSize(9).text(meta, W - M, M + 23, { align: "right" });
  return Math.max(y + 9 + co.length * 4 + 4, 50);
}

export function box(pdf: jsPDF, x: number, y: number, w: number, title: string, lines: string[]) {
  const h = 9 + lines.length * 4.2;
  pdf.setDrawColor(220).setFillColor(247, 248, 250).roundedRect(x, y, w, h, 2, 2, "FD");
  pdf.setFont("helvetica", "bold").setFontSize(8).setTextColor(100).text(title.toUpperCase(), x + 3, y + 5);
  pdf.setFont("helvetica", "normal").setFontSize(9).setTextColor(0).text(lines, x + 3, y + 10);
  return h;
}

export const clientLines = (c: any = {}, site?: string) =>
  [c.name, c.address, [c.zip, c.city].filter(Boolean).join(" "), c.phone, c.email,
   site && `Lieu de l'installation : ${site}`].filter(Boolean) as string[];

export const equipLines = (e: Equipment) =>
  [equipmentLabel(e), [e.brand, e.model].filter(Boolean).join(" "), e.serial_number && `N° de série : ${e.serial_number}`,
   [e.power_kw && `Puissance : ${e.power_kw}`, e.year && `Année : ${e.year}`].filter(Boolean).join(" — "),
   e.energy && `Énergie : ${e.energy}`, [e.fluid && `Fluide : ${e.fluid}`, e.fluid_charge_kg && `${e.fluid_charge_kg} kg`].filter(Boolean).join(" — "),
   e.location && `Emplacement : ${e.location}`].filter(Boolean) as string[];

export function paragraph(pdf: jsPDF, y: number, title: string, text: string, size = 8.5) {
  if (!text) return y;
  const split = pdf.splitTextToSize(text, W - 2 * M);
  if (y + 6 + split.length * 3.8 > 280) { pdf.addPage(); y = M; }
  pdf.setFont("helvetica", "bold").setFontSize(9.5).text(title, M, y); y += 4.5;
  pdf.setFont("helvetica", "normal").setFontSize(size).text(split, M, y);
  return y + split.length * 3.8 + 3;
}

export function footer(pdf: jsPDF, company: Company) {
  const foot = [company.name, company.legal_form, company.siret && `SIRET ${company.siret}`, company.rcs,
    company.insurance && `Assurance : ${company.insurance}`].filter(Boolean).join(" — ");
  const pages = pdf.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    pdf.setPage(i).setFontSize(7).setTextColor(130);
    pdf.text(foot, W / 2, 290, { align: "center", maxWidth: W - 2 * M - 10 });
    pdf.text(`${i}/${pages}`, W - M, 290, { align: "right" });
  }
  pdf.setTextColor(0);
}

export function signatures(pdf: jsPDF, y: number, company: Company, left: string, s: { name?: string; data?: string; at?: string; photo?: string | null }, technician?: string) {
  if (y + 45 > 285) { pdf.addPage(); y = M; }
  pdf.setFont("helvetica", "bold").setFontSize(9).text(`Pour ${company.name}`, M, y);
  pdf.setFont("helvetica", "normal").setFontSize(8.5).text(technician ? `Technicien : ${technician}` : "", M, y + 5);
  pdf.setFont("helvetica", "bold").setFontSize(9).text(left, 120, y);
  pdf.setDrawColor(200).rect(120, y + 2, 75, 32);
  if (s.photo) { try { pdf.addImage(s.photo, "JPEG", 85, y + 2, 32, 32); pdf.setFontSize(7).setFont("helvetica", "normal").text("Photo du signataire", 85, y + 37); } catch {} }
  if (s.data) {
    try { pdf.addImage(s.data, "PNG", 122, y + 4, 70, 22); } catch {}
    pdf.setFont("helvetica", "normal").setFontSize(7.5).text(`Signé par ${s.name || ""} le ${new Date(s.at!).toLocaleString("fr-FR")}`, 122, y + 31);
  }
  return y + 40;
}

// ---------------- CONTRAT ----------------
export async function buildContractPdf(c: Contract, company: Company) {
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const def = c.equipment.type ? EQUIPMENT[c.equipment.type] : undefined;
  const exempt = !!company.vat_exempt;
  const vat = exempt ? 0 : Number(c.vat_rate) || 0;
  const ht = Number(c.price_ht) || 0, ttc = Math.round(ht * (1 + vat / 100) * 100) / 100;
  let y = await header(pdf, company, "CONTRAT D'ENTRETIEN", c.number || "", [
    `Date : ${dateFr(c.signed_at || c.created_at || new Date().toISOString())}`,
    `Prise d'effet : ${dateFr(c.start_date)}`,
  ]);
  const h1 = box(pdf, M, y, 88, "Client", clientLines(c.client_snapshot, c.site_address));
  const h2 = box(pdf, 107, y, 88, "Équipement", equipLines(c.equipment));
  y += Math.max(h1, h2) + 6;

  const pro = c.client_snapshot?.type === "professionnel";
  const periodTxt = (c.period_months || 12) === 24 ? "tous les 2 ans" : (c.period_months || 12) === 6 ? "tous les 6 mois" : "une fois par an";

  y = paragraph(pdf, y, "Article 1 — Objet", `Le présent contrat a pour objet l'entretien de l'équipement désigné ci-dessus (${def?.short || "équipement"}), installé à l'adresse indiquée, par ${company.name}. La visite d'entretien est réalisée ${periodTxt}, à une date convenue avec le client.${def ? " " + def.legal : ""}`);
  y = paragraph(pdf, y, "Article 2 — Prestations incluses", (c.includes || "").split("\n").filter(Boolean).map((l) => `• ${l}`).join("\n"));
  y = paragraph(pdf, y, "Article 3 — Prestations non incluses", (c.excludes || "").split("\n").filter(Boolean).map((l) => `• ${l}`).join("\n"));
  if (c.options) y = paragraph(pdf, y, "Options souscrites", c.options);
  y = paragraph(pdf, y, "Article 4 — Durée et reconduction",
    `Le contrat est conclu pour une durée de ${c.duration_months || 12} mois à compter du ${dateFr(c.start_date)}, soit jusqu'au ${dateFr(contractEnd(c))}. ` +
    (c.tacit_renewal
      ? `Il est ensuite reconduit tacitement par périodes de 12 mois, sauf résiliation par l'une des parties par lettre recommandée ou e-mail au moins un mois avant l'échéance.` +
        (pro ? "" : ` Conformément à l'article L215-1 du Code de la consommation, ${company.name} informe le client par écrit, au plus tôt trois mois et au plus tard un mois avant le terme de la période autorisant le rejet de la reconduction, de la possibilité de ne pas reconduire le contrat. À défaut, le client peut mettre gratuitement un terme au contrat, à tout moment à compter de la date de reconduction.`)
      : " Il prend fin à son terme sans reconduction."));
  y = paragraph(pdf, y, "Article 5 — Prix et paiement",
    `Le prix annuel est de ${money(ht)} HT${exempt ? " (TVA non applicable, art. 293 B du CGI)" : `, soit ${money(ttc)} TTC (TVA ${String(vat).replace(".", ",")} %)`}, payable à réception de la facture. Le prix peut être révisé à chaque échéance ; le client en est informé avec l'avis d'échéance.`);
  y = paragraph(pdf, y, "Article 6 — Obligations du client",
    "Le client s'engage à laisser libre accès à l'équipement, à signaler toute anomalie de fonctionnement, à ne pas faire intervenir un tiers sur l'équipement pendant la durée du contrat sans en informer le prestataire, et à maintenir les ventilations et évacuations dégagées.");
  y = paragraph(pdf, y, "Article 7 — Responsabilité",
    `${company.name} est responsable des prestations qu'il réalise. Il ne peut être tenu responsable des dommages résultant d'une mauvaise utilisation, d'une modification de l'installation par un tiers ou d'un défaut de l'installation existante signalé au client.` + (company.insurance ? ` Assurance professionnelle : ${company.insurance}.` : ""));
  if (!pro) {
    y = paragraph(pdf, y, "Article 8 — Droit de rétractation",
      "Lorsque le contrat est conclu hors établissement ou à distance, le client consommateur dispose d'un délai de 14 jours à compter de sa conclusion pour exercer son droit de rétractation, sans motif (articles L221-18 et suivants du Code de la consommation), au moyen du formulaire ci-dessous ou de toute autre déclaration dénuée d'ambiguïté. Si le client demande expressément que la visite soit réalisée avant la fin de ce délai, il reste redevable du montant correspondant au service fourni jusqu'à la rétractation.");
    y = paragraph(pdf, y, "Médiation de la consommation", "En cas de litige, le client peut recourir gratuitement au médiateur de la consommation dont relève le prestataire (coordonnées communiquées sur simple demande).");
  }
  if (c.notes) y = paragraph(pdf, y, "Conditions particulières", c.notes);

  y = signatures(pdf, y + 2, company, "Le client — lu et approuvé", { name: c.signer_name, data: c.signature_data, at: c.signed_at, photo: c.signer_photo });

  if (!pro) {
    if (y + 60 > 280) { pdf.addPage(); y = M; } else y += 6;
    pdf.setDrawColor(150).setLineDashPattern([2, 2], 0).line(M, y, W - M, y).setLineDashPattern([], 0);
    y += 6;
    y = paragraph(pdf, y, "Formulaire de rétractation",
      `À l'attention de ${company.name}, ${[company.address, company.zip, company.city].filter(Boolean).join(" ")}${company.email ? `, ${company.email}` : ""} :\n` +
      `Je vous notifie par la présente ma rétractation du contrat d'entretien n° ${c.number || "……"} conclu le ……………\n` +
      "Nom du client : ……………………………………    Adresse : ……………………………………………………………\n" +
      "Date : ……………………    Signature :", 8.5);
  }
  footer(pdf, company);
  return pdf;
}

// ---------------- ATTESTATION ----------------
export async function buildReportPdf(r: Report, company: Company) {
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const def = r.equipment.type ? EQUIPMENT[r.equipment.type] : undefined;
  let y = await header(pdf, company, "ATTESTATION D'ENTRETIEN", r.number || "", [
    `Date de la visite : ${dateFr(r.visit_date)}`,
    r.technician ? `Technicien : ${r.technician}` : "",
  ].filter(Boolean));
  const h1 = box(pdf, M, y, 88, "Client / propriétaire", clientLines(r.client_snapshot, r.site_address));
  const h2 = box(pdf, 107, y, 88, "Équipement entretenu", equipLines(r.equipment));
  y += Math.max(h1, h2) + 5;
  if (def) { pdf.setFontSize(7.5).setTextColor(90).text(pdf.splitTextToSize(def.legal, W - 2 * M), M, y); y += 9; pdf.setTextColor(0); }

  autoTable(pdf, {
    startY: y, margin: { left: M, right: M },
    head: [["Opérations réalisées", "Fait", "Remarque"]],
    body: r.checklist.map((i) => [i.label, i.done ? "Oui" : "Non", i.comment || ""]),
    styles: { fontSize: 8.5, cellPadding: 1.8 }, headStyles: { fillColor: [15, 27, 45] },
    columnStyles: { 0: { cellWidth: 110 }, 1: { cellWidth: 14, halign: "center" } },
    didParseCell: (d) => { if (d.section === "body" && d.column.index === 1) d.cell.styles.textColor = d.cell.raw === "Oui" ? [21, 128, 61] : [185, 28, 28]; },
  });
  y = (pdf as any).lastAutoTable.finalY + 5;

  const ms = (def?.measures || []).filter((m) => r.measures?.[m.key]);
  if (ms.length) {
    autoTable(pdf, {
      startY: y, margin: { left: M, right: M },
      head: [["Mesures et contrôles", "Valeur"]],
      body: ms.map((m) => [m.label, `${r.measures[m.key]}${m.unit ? " " + m.unit : ""}`]),
      styles: { fontSize: 8.5, cellPadding: 1.8 }, headStyles: { fillColor: [234, 122, 12] },
      columnStyles: { 1: { halign: "right", cellWidth: 45 } },
    });
    y = (pdf as any).lastAutoTable.finalY + 6;
  }

  y = paragraph(pdf, y, "Observations / anomalies constatées", r.observations || "Aucune anomalie constatée.");
  y = paragraph(pdf, y, "Conseils sur le bon usage de l'équipement", r.advice || "");
  y = paragraph(pdf, y, "Améliorations possibles de l'installation", r.improvements || "Aucune.");
  if (r.equipment.type?.startsWith("chaudiere") || r.replacement)
    y = paragraph(pdf, y, "Intérêt éventuel du remplacement de l'équipement", r.replacement || "Pas de remplacement à envisager à ce jour.");
  if (r.next_visit_date) y = paragraph(pdf, y, "Prochaine visite conseillée", dateFr(r.next_visit_date));

  y = signatures(pdf, y + 2, company, "Le client", { name: r.signer_name, data: r.signature_data, at: r.signed_at }, r.technician);
  pdf.setFontSize(7.5).setTextColor(90).text("Attestation à conserver au moins deux ans et à présenter en cas de contrôle ou de sinistre.", M, Math.min(y + 2, 284));
  footer(pdf, company);
  return pdf;
}

export const pdfToBase64 = (pdf: jsPDF) => pdf.output("datauristring").split(",")[1];

export async function shareOrSave(pdf: jsPDF, filename: string) {
  const file = new File([pdf.output("blob")], filename, { type: "application/pdf" });
  const nav = navigator as any;
  if (nav.canShare && nav.canShare({ files: [file] })) await nav.share({ files: [file], title: filename });
  else pdf.save(filename);
}
