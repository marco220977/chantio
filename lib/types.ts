export type Line = {
  label: string;
  description?: string;
  qty: number;
  unit: string;
  unit_price: number; // HT
  vat_rate: number;
  cost_price?: number; // prix d'achat HT (interne, non imprimé)
  supplier?: string | null; ref?: string | null; components?: Component[] | null;
};

export type Company = {
  id: string; name: string; legal_form?: string; siret?: string; vat_number?: string;
  booking_enabled?: boolean; booking_duration_min?: number; booking_day_start?: string; booking_day_end?: string; booking_buffer_min?: number;
  booking_max_km?: number; booking_days_ahead?: number; booking_saturday?: boolean; booking_auto_confirm?: boolean; booking_keep_free?: number; booking_lunch?: boolean; booking_lunch_start?: string; booking_lunch_end?: string;
  vat_exempt?: boolean; rcs?: string; capital?: string; address?: string; zip?: string;
  city?: string; phone?: string; email?: string; iban?: string; bic?: string;
  insurance?: string; logo_url?: string; payment_terms_days?: number;
  late_penalty_rate?: string; quote_validity_days?: number; footer_note?: string;
  plan?: string; trial_ends_at?: string; free_until?: string | null; rge_number?: string | null; rge_organism?: string | null; rge_domains?: string | null; rge_valid_until?: string | null; siret_verified_at?: string | null; naf?: string | null; cancel_at?: string | null; stripe_subscription_id?: string | null;
};

export type Client = {
  id: string; type: string; name: string; email?: string; phone?: string;
  address?: string; zip?: string; city?: string; siret?: string; notes?: string; siret_verified_at?: string | null;
};

export type CatalogItem = {
  id: string; category: string; label: string; description?: string; unit: string;
  unit_price: number; vat_rate: number; cost_price?: number;
  supplier?: string | null; ref?: string | null; components?: Component[] | null;
};
export type Component = { label: string; qty: number; unit: string; cost_price: number; unit_price: number; supplier?: string | null; ref?: string | null };

export type Doc = {
  id: string; kind: "quote" | "invoice" | "credit"; number?: string; status: string;
  client_id?: string; client_snapshot?: Partial<Client>; title?: string; site_address?: string;
  issue_date?: string; due_date?: string; valid_until?: string; lines: Line[];
  discount_pct?: number; deposit_pct?: number; total_ht?: number; total_vat?: number;
  total_ttc?: number; notes?: string; public_token?: string; signed_at?: string;
  signer_name?: string; signature_data?: string; signer_photo?: string | null; source_quote_id?: string;
  paid_at?: string; payment_method?: string; created_at?: string; sent_at?: string; sent_to?: string;
  amends_id?: string | null; amendment_no?: number | null;
  aid_scheme?: string | null; technical_visit_date?: string | null; housing_info?: string | null; aid_amount?: number | null; aid_provider?: string | null;
  situation_no?: number | null; progress_pct?: number | null; retention_pct?: number | null; reverse_charge?: boolean | null;
  meta?: { market_ht?: number; cum_pct?: number; prev_pct?: number; prev_ht?: number; quote_number?: string } | null;
  amend_meta?: { parent_number?: string; parent_date?: string; parent_signed_at?: string; base_ttc?: number; previous_ttc?: number } | null;
};
