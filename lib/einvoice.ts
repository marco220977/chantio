// Facture électronique : canal (B2B / B2C), contrôles EN 16931 et XML Factur-X (CII, profil EN16931)
import type { Company, Doc } from "./types";

export const EINV_STATUS: Record<string, [string, string]> = {
  a_envoyer: ["À transmettre", "bg-slate-100 text-slate-700"],
  deposee: ["Déposée", "bg-blue-100 text-blue-800"],
  recue: ["Reçue par le client", "bg-indigo-100 text-indigo-800"],
  acceptee: ["Acceptée", "bg-green-100 text-green-800"],
  refusee: ["Refusée", "bg-red-100 text-red-700"],
  encaissee: ["Encaissée (déclarée)", "bg-green-100 text-green-800"],
  ereporting_ok: ["E-reporting transmis", "bg-green-100 text-green-800"],
  erreur: ["Erreur", "bg-red-100 text-red-700"],
};

const digits = (s?: string | null) => String(s || "").replace(/\D/g, "");
const r2 = (n: number) => Math.round(n * 100) / 100;
const esc = (s: any) => String(s ?? "").replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c]!));
const d102 = (d?: string | null) => (d || new Date().toISOString()).slice(0, 10).replace(/-/g, "");
const amt = (n: number) => r2(n).toFixed(2);

export function channelOf(doc: Doc): "b2b" | "b2c" {
  const c: any = doc.client_snapshot || {};
  return c.type === "professionnel" || digits(c.siret).length >= 9 ? "b2b" : "b2c";
}

export function validateEInvoice(doc: Doc, co: Company): string[] {
  const e: string[] = [];
  const c: any = doc.client_snapshot || {};
  if (digits(co.siret).length < 9) e.push("Votre SIRET (Mon entreprise)");
  if (!co.vat_exempt && !/^FR[0-9A-Z]{2}\d{9}$/.test(String(co.vat_number || "").replace(/\s/g, ""))) e.push("Votre n° de TVA intracommunautaire (Mon entreprise)");
  if (!co.address || !co.zip || !co.city) e.push("Votre adresse complète (Mon entreprise)");
  if (!doc.number || doc.status === "draft") e.push("La facture doit être émise");
  if (!doc.lines?.length) e.push("Au moins une ligne");
  if (channelOf(doc) === "b2b") {
    if (digits(c.siret).length < 9) e.push("Le SIREN/SIRET du client (fiche client)");
    if (!c.name) e.push("Le nom du client");
    if (!c.address || !c.zip || !c.city) e.push("L'adresse complète du client");
  }
  return e;
}

const UNIT: Record<string, string> = { u: "C62", forfait: "C62", h: "HUR", heure: "HUR", jour: "DAY", "m²": "MTK", m2: "MTK", ml: "MTR", m: "MTR", kg: "KGM", l: "LTR", barre: "C62", couronne: "C62", an: "ANN" };

export function buildFacturX(doc: Doc, co: Company): string {
  const credit = doc.kind === "credit";
  const sign = credit ? -1 : 1; // un avoir est exprimé en montants positifs avec le code 381
  const k = 1 - (Number(doc.discount_pct) || 0) / 100;
  const exempt = !!co.vat_exempt;
  const c: any = doc.client_snapshot || {};

  const lines = (doc.lines || []).map((l, i) => {
    const qty = sign * (Number(l.qty) || 0);
    const net = (Number(l.unit_price) || 0) * k;
    const total = r2(qty * net);
    const rate = exempt ? 0 : Number(l.vat_rate) || 0;
    return { i: i + 1, l, qty, net, total, rate, cat: exempt || rate === 0 ? "E" : "S" };
  });
  const groups: Record<string, { base: number; rate: number; cat: string }> = {};
  for (const x of lines) { const key = `${x.cat}${x.rate}`; groups[key] ??= { base: 0, rate: x.rate, cat: x.cat }; groups[key].base += x.total; }
  const taxes = Object.values(groups).map((g) => ({ ...g, base: r2(g.base), tax: r2((r2(g.base) * g.rate) / 100) }));
  const ht = r2(lines.reduce((a, x) => a + x.total, 0));
  const tva = r2(taxes.reduce((a, t) => a + t.tax, 0));
  const ttc = r2(ht + tva);
  const paid = doc.status === "paid" ? ttc : 0;

  const party = (name: string, siret: string, addr: any, email?: string, vat?: string) => `
        <ram:Name>${esc(name)}</ram:Name>
        ${digits(siret).length >= 9 ? `<ram:SpecifiedLegalOrganization><ram:ID schemeID="0002">${digits(siret).slice(0, 9)}</ram:ID></ram:SpecifiedLegalOrganization>` : ""}
        <ram:PostalTradeAddress>
          ${addr.zip ? `<ram:PostcodeCode>${esc(addr.zip)}</ram:PostcodeCode>` : ""}
          ${addr.address ? `<ram:LineOne>${esc(addr.address)}</ram:LineOne>` : ""}
          ${addr.city ? `<ram:CityName>${esc(addr.city)}</ram:CityName>` : ""}
          <ram:CountryID>FR</ram:CountryID>
        </ram:PostalTradeAddress>
        ${email ? `<ram:URIUniversalCommunication><ram:URIID schemeID="EM">${esc(email)}</ram:URIID></ram:URIUniversalCommunication>` : ""}
        ${vat ? `<ram:SpecifiedTaxRegistration><ram:ID schemeID="VA">${esc(vat.replace(/\s/g, ""))}</ram:ID></ram:SpecifiedTaxRegistration>` : ""}`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100" xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100" xmlns:qdt="urn:un:unece:uncefact:data:standard:QualifiedDataType:100" xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">
  <rsm:ExchangedDocumentContext>
    <ram:GuidelineSpecifiedDocumentContextParameter><ram:ID>urn:cen.eu:en16931:2017</ram:ID></ram:GuidelineSpecifiedDocumentContextParameter>
  </rsm:ExchangedDocumentContext>
  <rsm:ExchangedDocument>
    <ram:ID>${esc(doc.number)}</ram:ID>
    <ram:TypeCode>${credit ? 381 : 380}</ram:TypeCode>
    <ram:IssueDateTime><udt:DateTimeString format="102">${d102(doc.issue_date)}</udt:DateTimeString></ram:IssueDateTime>
    ${doc.notes ? `<ram:IncludedNote><ram:Content>${esc(doc.notes)}</ram:Content></ram:IncludedNote>` : ""}
    ${exempt ? `<ram:IncludedNote><ram:Content>TVA non applicable, art. 293 B du CGI</ram:Content></ram:IncludedNote>` : ""}
  </rsm:ExchangedDocument>
  <rsm:SupplyChainTradeTransaction>${lines.map((x) => `
    <ram:IncludedSupplyChainTradeLineItem>
      <ram:AssociatedDocumentLineDocument><ram:LineID>${x.i}</ram:LineID></ram:AssociatedDocumentLineDocument>
      <ram:SpecifiedTradeProduct><ram:Name>${esc(x.l.label)}</ram:Name>${x.l.description ? `<ram:Description>${esc(x.l.description)}</ram:Description>` : ""}</ram:SpecifiedTradeProduct>
      <ram:SpecifiedLineTradeAgreement><ram:NetPriceProductTradePrice><ram:ChargeAmount>${x.net.toFixed(4)}</ram:ChargeAmount></ram:NetPriceProductTradePrice></ram:SpecifiedLineTradeAgreement>
      <ram:SpecifiedLineTradeDelivery><ram:BilledQuantity unitCode="${UNIT[String(x.l.unit || "u").toLowerCase()] || "C62"}">${x.qty}</ram:BilledQuantity></ram:SpecifiedLineTradeDelivery>
      <ram:SpecifiedLineTradeSettlement>
        <ram:ApplicableTradeTax><ram:TypeCode>VAT</ram:TypeCode><ram:CategoryCode>${x.cat}</ram:CategoryCode><ram:RateApplicablePercent>${x.rate}</ram:RateApplicablePercent></ram:ApplicableTradeTax>
        <ram:SpecifiedTradeSettlementLineMonetarySummation><ram:LineTotalAmount>${amt(x.total)}</ram:LineTotalAmount></ram:SpecifiedTradeSettlementLineMonetarySummation>
      </ram:SpecifiedLineTradeSettlement>
    </ram:IncludedSupplyChainTradeLineItem>`).join("")}
    <ram:ApplicableHeaderTradeAgreement>
      <ram:SellerTradeParty>${party(co.name, co.siret || "", co, co.email, co.vat_exempt ? undefined : co.vat_number)}
      </ram:SellerTradeParty>
      <ram:BuyerTradeParty>${party(c.name || "Client", c.siret || "", c, c.email)}
      </ram:BuyerTradeParty>
    </ram:ApplicableHeaderTradeAgreement>
    <ram:ApplicableHeaderTradeDelivery>
      ${doc.site_address ? `<ram:ShipToTradeParty><ram:Name>Adresse du chantier</ram:Name><ram:PostalTradeAddress><ram:LineOne>${esc(doc.site_address)}</ram:LineOne><ram:CountryID>FR</ram:CountryID></ram:PostalTradeAddress></ram:ShipToTradeParty>` : ""}
      <ram:ActualDeliverySupplyChainEvent><ram:OccurrenceDateTime><udt:DateTimeString format="102">${d102(doc.issue_date)}</udt:DateTimeString></ram:OccurrenceDateTime></ram:ActualDeliverySupplyChainEvent>
    </ram:ApplicableHeaderTradeDelivery>
    <ram:ApplicableHeaderTradeSettlement>
      <ram:InvoiceCurrencyCode>EUR</ram:InvoiceCurrencyCode>
      ${co.iban ? `<ram:SpecifiedTradeSettlementPaymentMeans><ram:TypeCode>58</ram:TypeCode><ram:PayeePartyCreditorFinancialAccount><ram:IBANID>${esc(co.iban.replace(/\s/g, ""))}</ram:IBANID></ram:PayeePartyCreditorFinancialAccount></ram:SpecifiedTradeSettlementPaymentMeans>` : ""}${taxes.map((t) => `
      <ram:ApplicableTradeTax>
        <ram:CalculatedAmount>${amt(t.tax)}</ram:CalculatedAmount><ram:TypeCode>VAT</ram:TypeCode>
        ${t.cat === "E" ? `<ram:ExemptionReason>${exempt ? "TVA non applicable, art. 293 B du CGI" : "Exonération"}</ram:ExemptionReason>` : ""}
        <ram:BasisAmount>${amt(t.base)}</ram:BasisAmount><ram:CategoryCode>${t.cat}</ram:CategoryCode>
        ${t.cat === "E" && exempt ? `<ram:ExemptionReasonCode>VATEX-FR-FRANCHISE</ram:ExemptionReasonCode>` : ""}
        ${t.cat === "S" ? `<ram:DueDateTypeCode>72</ram:DueDateTypeCode>` : ""}
        <ram:RateApplicablePercent>${t.rate}</ram:RateApplicablePercent>
      </ram:ApplicableTradeTax>`).join("")}
      <ram:SpecifiedTradePaymentTerms>
        <ram:Description>Pénalités de retard : ${esc(co.late_penalty_rate || "3 fois le taux d'intérêt légal")}. Indemnité forfaitaire pour frais de recouvrement : 40 €. Pas d'escompte.</ram:Description>
        ${doc.due_date ? `<ram:DueDateDateTime><udt:DateTimeString format="102">${d102(doc.due_date)}</udt:DateTimeString></ram:DueDateDateTime>` : ""}
      </ram:SpecifiedTradePaymentTerms>
      <ram:SpecifiedTradeSettlementHeaderMonetarySummation>
        <ram:LineTotalAmount>${amt(ht)}</ram:LineTotalAmount>
        <ram:TaxBasisTotalAmount>${amt(ht)}</ram:TaxBasisTotalAmount>
        <ram:TaxTotalAmount currencyID="EUR">${amt(tva)}</ram:TaxTotalAmount>
        <ram:GrandTotalAmount>${amt(ttc)}</ram:GrandTotalAmount>
        ${paid ? `<ram:TotalPrepaidAmount>${amt(paid)}</ram:TotalPrepaidAmount>` : ""}
        <ram:DuePayableAmount>${amt(ttc - paid)}</ram:DuePayableAmount>
      </ram:SpecifiedTradeSettlementHeaderMonetarySummation>
    </ram:ApplicableHeaderTradeSettlement>
  </rsm:SupplyChainTradeTransaction>
</rsm:CrossIndustryInvoice>
`.replace(/\n\s*\n/g, "\n");
}

// Données e-reporting (ventes aux particuliers) : agrégat transmis par la plateforme
export function eReportingPayload(doc: Doc, co: Company) {
  return {
    seller_siren: digits(co.siret).slice(0, 9), invoice_number: doc.number, date: doc.issue_date,
    category: "prestations_services", total_ht: Number(doc.total_ht), total_vat: Number(doc.total_vat), total_ttc: Number(doc.total_ttc),
    paid_at: doc.paid_at || null, payment_method: doc.payment_method || null,
  };
}
