export type Line = {
  label: string;
  description?: string;
  qty: number;
  unit: string;
  unit_price: number; // HT
  vat_rate: number;
  cost_price?: number; // prix d'achat HT (interne, non imprimé)
};

export type Company = {
  id: string; name: string; legal_form?: string; siret?: string; vat_number?: string;
  vat_exempt?: boolean; rcs?: string; capital?: string; address?: string; zip?: string;
  city?: string; phone?: string; email?: string; iban?: string; bic?: string;
  insurance?: string; logo_url?: string; payment_terms_days?: number;
  late_penalty_rate?: string; quote_validity_days?: number; footer_note?: string;
  plan?: string; trial_ends_at?: string; siret_verified_at?: string | null; naf?: string | null; cancel_at?: string | null; stripe_subscription_id?: string | null;
};

export type Client = {
  id: string; type: string; name: string; email?: string; phone?: string;
  address?: string; zip?: string; city?: string; siret?: string; notes?: string; siret_verified_at?: string | null;
};

export type CatalogItem = {
  id: string; category: string; label: string; description?: string; unit: string;
  unit_price: number; vat_rate: number; cost_price?: number;
};

export type Doc = {
  id: string; kind: "quote" | "invoice" | "credit"; number?: string; status: string;
  client_id?: string; client_snapshot?: Partial<Client>; title?: string; site_address?: string;
  issue_date?: string; due_date?: string; valid_until?: string; lines: Line[];
  discount_pct?: number; deposit_pct?: number; total_ht?: number; total_vat?: number;
  total_ttc?: number; notes?: string; public_token?: string; signed_at?: string;
  signer_name?: string; signature_data?: string; signer_photo?: string | null; source_quote_id?: string;
  paid_at?: string; payment_method?: string; created_at?: string; sent_at?: string; sent_to?: string;
  amends_id?: string | null; amendment_no?: number | null;
  amend_meta?: { parent_number?: string; parent_date?: string; parent_signed_at?: string; base_ttc?: number; previous_ttc?: number } | null;
};
