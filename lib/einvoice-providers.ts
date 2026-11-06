// Connecteurs vers une plateforme agréée (PA). Un seul fichier à compléter le jour où le partenaire est choisi.
// Variables d'environnement : EINVOICE_PROVIDER = "simulation" (défaut) | "generic"
//                             EINVOICE_API_URL, EINVOICE_API_KEY (connecteur "generic")

export type SendResult = { id: string; status: string; message?: string };
export interface EInvoiceProvider {
  name: string;
  real: boolean;
  activate(c: { siren: string; name: string; email?: string }): Promise<{ accountId: string; message?: string }>;
  send(p: { xml: string; number: string; siren: string; buyerSiren: string }): Promise<SendResult>;
  ereport(p: Record<string, any>): Promise<SendResult>;
  reportPayment(p: { id: string; number: string; amount: number; date: string }): Promise<SendResult>;
  status(id: string): Promise<SendResult>;
}

const simulation: EInvoiceProvider = {
  name: "Simulation (aucune transmission réelle)",
  real: false,
  async activate(c) { return { accountId: `SIM-${c.siren}`, message: "Compte de test créé" }; },
  async send(p) { return { id: `SIM-${p.number}-${Date.now().toString(36)}`, status: "deposee", message: "Simulation : facture déposée (non transmise)" }; },
  async ereport() { return { id: `SIM-ER-${Date.now().toString(36)}`, status: "ereporting_ok", message: "Simulation : e-reporting enregistré (non transmis)" }; },
  async reportPayment(p) { return { id: p.id, status: "encaissee", message: "Simulation : encaissement déclaré (non transmis)" }; },
  async status(id) { return { id, status: "recue", message: "Simulation : facture reçue par la plateforme du client" }; },
};

// Connecteur REST générique : à adapter au contrat d'API du partenaire choisi (Iopole, B2Brouter, Sage…)
async function call(path: string, body: any) {
  const r = await fetch(`${process.env.EINVOICE_API_URL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${process.env.EINVOICE_API_KEY}` },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.message || j.error || `Plateforme : erreur ${r.status}`);
  return j;
}
const generic: EInvoiceProvider = {
  name: process.env.EINVOICE_PROVIDER_NAME || "Plateforme agréée",
  real: true,
  async activate(c) { const j = await call("/accounts", c); return { accountId: j.id || j.accountId }; },
  async send(p) { const j = await call("/invoices", { format: "CII", xml: Buffer.from(p.xml).toString("base64"), siren: p.siren, buyer_siren: p.buyerSiren }); return { id: j.id, status: j.status || "deposee" }; },
  async ereport(p) { const j = await call("/e-reporting", p); return { id: j.id, status: "ereporting_ok" }; },
  async reportPayment(p) { const j = await call(`/invoices/${p.id}/payment`, p); return { id: p.id, status: j.status || "encaissee" }; },
  async status(id) { const r = await fetch(`${process.env.EINVOICE_API_URL}/invoices/${id}`, { headers: { authorization: `Bearer ${process.env.EINVOICE_API_KEY}` } }); const j = await r.json(); return { id, status: j.status }; },
};

export function provider(): EInvoiceProvider {
  return process.env.EINVOICE_PROVIDER === "generic" && process.env.EINVOICE_API_URL ? generic : simulation;
}
