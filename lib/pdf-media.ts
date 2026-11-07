"use client";
import type jsPDF from "jspdf";
import QRCode from "qrcode";
import { toDataUrl } from "./pdf";
import { isVideo, longLinks, posterOf } from "./chantiers";

// Image d'un média pour le PDF : photo, ou aperçu de la vidéo avec un QR code vers la vidéo
export async function mediaImage(path: string, urls: Record<string, string>) {
  return toDataUrl(isVideo(path) ? urls[posterOf(path)] : urls[path]);
}

let links: Record<string, string> = {};
export async function prepareVideoLinks(paths: string[]) {
  const vids = paths.filter(isVideo);
  links = vids.length ? { ...links, ...(await longLinks(vids)) } : links;
}

export async function drawVideoBadge(pdf: jsPDF, path: string, x: number, y: number, w: number, h: number) {
  if (!isVideo(path)) return;
  const link = links[path];
  const s = Math.min(22, w * 0.4, h * 0.5);
  pdf.setFillColor(255, 255, 255).rect(x + w - s - 2, y + h - s - 6, s + 2, s + 6, "F");
  if (link) {
    const qr = await QRCode.toDataURL(link, { margin: 0, width: 240, errorCorrectionLevel: "L" });
    pdf.addImage(qr, "PNG", x + w - s - 1, y + h - s - 5, s, s);
    pdf.link(x, y, w, h, { url: link });
  }
  pdf.setFont("helvetica", "bold").setFontSize(6).setTextColor(0).text(link ? "Voir la vidéo" : "Vidéo", x + w - s / 2 - 1, y + h - 1.5, { align: "center" });
}
