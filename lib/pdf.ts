"use client";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { Company, Doc } from "./types";
import { computeTotals, dateFr } from "./calc";

export const money = (n: number) =>
  (Number(n) || 0).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/ | /g, " ") + " €";

export async function toDataUrl(url: string): Promise<string | null> {
  try {
    const r = await fetch(url);
    const b = await r.blob();
    return await new Promise((res) => {
      const fr = new FileReader();
      fr.onload = () => res(fr.result as string);
      fr.readAsDataURL(b);
    });
  } catch { return null; }
}

export async function buildPdf(doc: Doc, company: Company): Promise<jsPDF> {
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const W = 210, M = 15;
  const isQuote = doc.kind === "quote";
  const title = isQuote ? "DEVIS" : doc.kind === "credit" ? "AVOIR" : "FACTURE";
  const c = doc.client_snapshot || {};
  let y = M;

  // Logo + entreprise
  if (company.logo_url) {
    const img = await toDataUrl(company.logo_url);
    if (img) { try { pdf.addImage(img, M, y, 30, 18, undefined, "FAST"); y += 20; } catch {} }
  }
  pdf.setFont("helvetica", "bold").setFontSize(12).text(company.name || "", M, y + 4);
  pdf.setFont("helvetica", "normal").setFontSize(9);
  const coLines = [
    company.address, [company.zip, company.city].filter(Boolean).join(" "),
    company.phone && `Tél. ${company.phone}`, company.email,
    company.siret && `SIRET ${company.siret}`,
    company.vat_number && `TVA ${company.vat_number}`,
  ].filter(Boolean) as string[];
  pdf.text(coLines, M, y + 9);

  // Titre
  pdf.setFont("helvetica", "bold").setFontSize(20).setTextColor(29, 78, 216);
  pdf.text(title, W - M, M + 6, { align: "right" });
  pdf.setTextColor(0).setFontSize(10).text(`N° ${doc.number || "BROUILLON"}`, W - M, M + 12, { align: "right" });
  pdf.setFont("helvetica", "normal").setFontSize(9);
  const meta = [`Date : ${dateFr(doc.issue_date)}`];
  if (isQuote && doc.valid_until) meta.push(`Valable jusqu'au : ${dateFr(doc.valid_until)}`);
  if (!isQuote && doc.due_date) meta.push(`Échéance : ${dateFr(doc.due_date)}`);
  pdf.text(meta, W - M, M + 17, { align: "right" });

  // Client
  const by = Math.max(y + 9 + coLines.length * 4 + 4, 58);
  pdf.setDrawColor(220).setFillColor(247, 248, 250).roundedRect(110, by, 85, 32, 2, 2, "FD");
  pdf.setFont("helvetica", "bold").setFontSize(10).text(c.name || "", 114, by + 7);
  pdf.setFont("helvetica", "normal").setFontSize(9);
  pdf.text([c.address, [c.zip, c.city].filter(Boolean).join(" "), c.phone, c.email,
    c.siret && `SIREN/SIRET ${c.siret}`].filter(Boolean) as string[], 114, by + 12);

  y = by + 38;
  if (doc.title) { pdf.setFont("helvetica", "bold").setFontSize(10).text(`Objet : ${doc.title}`, M, y); y += 5; }
  if (doc.site_address) { pdf.setFont("helvetica", "normal").setFontSize(9).text(`Adresse du chantier : ${doc.site_address}`, M, y); y += 5; }
  pdf.setFontSize(8).setTextColor(100).text("Nature des opérations : prestations de services (travaux)", M, y); pdf.setTextColor(0);
  y += 3;

  // Lignes
  const exempt = !!company.vat_exempt;
  autoTable(pdf, {
    startY: y + 2,
    margin: { left: M, right: M },
    head: [["Désignation", "Qté", "Unité", "PU HT", exempt ? "" : "TVA", "Total HT"]],
    body: doc.lines.map((l) => [
      l.description ? `${l.label}\n${l.description}` : l.label,
      String(l.qty).replace(".", ","), l.unit, money(l.unit_price),
      exempt ? "" : `${String(l.vat_rate).replace(".", ",")} %`,
      money((Number(l.qty) || 0) * (Number(l.unit_price) || 0)),
    ]),
    styles: { fontSize: 8.5, cellPadding: 2 },
    headStyles: { fillColor: [15, 27, 45] },
    columnStyles: { 0: { cellWidth: 80 }, 1: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right" } },
  });
  y = (pdf as any).lastAutoTable.finalY + 6;

  // Totaux
  const t = computeTotals(doc.lines, doc.discount_pct, exempt);
  const rows: [string, string][] = [];
  if (doc.discount_pct) rows.push([`Remise ${doc.discount_pct} %`, "incluse"]);
  rows.push(["Total HT", money(t.ht)]);
  if (!exempt) for (const [rate, v] of Object.entries(t.byRate)) if (Number(rate) > 0) rows.push([`TVA ${rate.replace(".", ",")} % sur ${money(v.base)}`, money(v.vat)]);
  rows.push(["Total TTC", money(t.ttc)]);
  if (isQuote && doc.deposit_pct) rows.push([`Acompte à la commande (${doc.deposit_pct} %)`, money((t.ttc * Number(doc.deposit_pct)) / 100)]);
  if (y + rows.length * 6 > 270) { pdf.addPage(); y = M; }
  rows.forEach(([k, v], i) => {
    const bold = k === "Total TTC";
    pdf.setFont("helvetica", bold ? "bold" : "normal").setFontSize(bold ? 11 : 9);
    pdf.text(k, 140, y + i * 6, { align: "right" });
    pdf.text(v, W - M, y + i * 6, { align: "right" });
  });
  y += rows.length * 6 + 4;

  // Mentions légales
  const mentions: string[] = [];
  if (exempt) mentions.push("TVA non applicable, art. 293 B du CGI.");
  const reduced = !exempt && doc.lines.some((l) => [5.5, 10].includes(Number(l.vat_rate)));
  if (reduced) mentions.push("Taux réduit de TVA appliqué : le client certifie que les travaux portent sur un local à usage d'habitation achevé depuis plus de deux ans (art. 278-0 bis A et 279-0 bis du CGI).");
  if (company.insurance) mentions.push(`Assurance décennale : ${company.insurance}.`);
  if (isQuote) {
    mentions.push("Devis gratuit. Pour accepter ce devis, retournez-le signé avec la mention « Bon pour accord ».");
  } else {
    mentions.push(`Paiement à ${company.payment_terms_days ?? 30} jours. Pas d'escompte pour paiement anticipé.`);
    mentions.push(`Pénalités de retard : ${company.late_penalty_rate || "3 fois le taux d'intérêt légal"}. Indemnité forfaitaire pour frais de recouvrement (clients professionnels) : 40 €.`);
    if (company.iban) mentions.push(`Règlement par virement — IBAN : ${company.iban}${company.bic ? ` — BIC : ${company.bic}` : ""}`);
  }
  if (doc.notes) mentions.unshift(doc.notes);
  pdf.setFont("helvetica", "normal").setFontSize(8).setTextColor(60);
  for (const m of mentions) {
    const split = pdf.splitTextToSize(m, W - 2 * M);
    if (y + split.length * 3.6 > 280) { pdf.addPage(); y = M; }
    pdf.text(split, M, y); y += split.length * 3.6 + 1.5;
  }
  pdf.setTextColor(0);

  // Signature
  if (isQuote) {
    if (y + 40 > 285) { pdf.addPage(); y = M; }
    y += 3;
    pdf.setFont("helvetica", "bold").setFontSize(9).text("Bon pour accord — signature du client", 120, y);
    pdf.setDrawColor(200).rect(120, y + 2, 75, 32);
    if (doc.signer_photo) {
      try {
        pdf.addImage(doc.signer_photo, "JPEG", 85, y + 2, 32, 32);
        pdf.setFont("helvetica", "normal").setFontSize(7).text("Photo du signataire", 85, y + 37);
      } catch {}
    }
    if (doc.signature_data) {
      try { pdf.addImage(doc.signature_data, "PNG", 122, y + 4, 70, 22); } catch {}
      pdf.setFont("helvetica", "normal").setFontSize(7.5)
        .text(`Signé électroniquement par ${doc.signer_name || ""} le ${new Date(doc.signed_at!).toLocaleString("fr-FR")}`, 122, y + 31);
    }
  }

  // Pied de page
  const pages = pdf.getNumberOfPages();
  const foot = [company.name, company.legal_form, company.capital && `capital ${company.capital}`,
    company.siret && `SIRET ${company.siret}`, company.rcs].filter(Boolean).join(" — ");
  for (let i = 1; i <= pages; i++) {
    pdf.setPage(i).setFontSize(7).setTextColor(130);
    pdf.text(foot + (company.footer_note ? ` — ${company.footer_note}` : ""), W / 2, 290, { align: "center", maxWidth: W - 2 * M });
    pdf.text(`${i}/${pages}`, W - M, 290, { align: "right" });
  }
  return pdf;
}

export async function downloadPdf(doc: Doc, company: Company) {
  const pdf = await buildPdf(doc, company);
  pdf.save(`${doc.number || "brouillon"}.pdf`);
}

export async function sharePdf(doc: Doc, company: Company) {
  const pdf = await buildPdf(doc, company);
  const blob = pdf.output("blob");
  const file = new File([blob], `${doc.number || "document"}.pdf`, { type: "application/pdf" });
  const nav = navigator as any;
  if (nav.canShare && nav.canShare({ files: [file] })) {
    await nav.share({ files: [file], title: doc.number });
  } else {
    pdf.save(file.name);
  }
}

export async function pdfBase64(doc: Doc, company: Company): Promise<string> {
  const pdf = await buildPdf(doc, company);
  return pdf.output("datauristring").split(",")[1];
}
