-- =========================================================
-- CHANTIO — Schéma Supabase (à coller dans SQL Editor > Run)
-- Multi-entreprises : chaque utilisateur appartient à une entreprise,
-- la sécurité (RLS) empêche toute fuite de données entre entreprises.
-- =========================================================

create extension if not exists pgcrypto;

-- ---------- Entreprises ----------
create table if not exists companies (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  name text not null default 'Mon entreprise',
  legal_form text default 'EI',            -- EI, EURL, SARL, SAS...
  siret text,
  vat_number text,                         -- TVA intracommunautaire
  vat_exempt boolean default false,        -- franchise en base (art. 293 B du CGI)
  rcs text,                                -- RCS / RM
  capital text,
  address text,
  zip text,
  city text,
  phone text,
  email text,
  iban text,
  bic text,
  insurance text,                          -- assurance décennale : assureur + n° + zone
  logo_url text,
  payment_terms_days int default 30,
  late_penalty_rate text default '3 fois le taux d''intérêt légal',
  quote_validity_days int default 30,
  footer_note text,
  -- abonnement SaaS
  plan text default 'trial',               -- trial | pro | canceled
  trial_ends_at timestamptz default (now() + interval '14 days'),
  stripe_customer_id text,
  stripe_subscription_id text
);

-- ---------- Membres (utilisateur -> entreprise) ----------
create table if not exists members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  role text default 'owner',
  full_name text,
  created_at timestamptz default now()
);

create or replace function my_company_id() returns uuid
language sql stable security definer set search_path = public as $$
  select company_id from members where user_id = auth.uid()
$$;

-- Création automatique de l'entreprise à l'inscription
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare cid uuid;
begin
  insert into companies (name, email)
    values (coalesce(new.raw_user_meta_data->>'company_name', 'Mon entreprise'), new.email)
    returning id into cid;
  insert into members (user_id, company_id, full_name)
    values (new.id, cid, new.raw_user_meta_data->>'full_name');
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- ---------- Clients ----------
create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default my_company_id() references companies(id) on delete cascade,
  created_at timestamptz default now(),
  type text default 'particulier',         -- particulier | professionnel
  name text not null,
  email text,
  phone text,
  address text,
  zip text,
  city text,
  siret text,
  notes text
);

-- ---------- Catalogue ----------
create table if not exists catalog_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default my_company_id() references companies(id) on delete cascade,
  created_at timestamptz default now(),
  category text default 'Prestation',
  label text not null,
  description text,
  unit text default 'u',
  unit_price numeric(12,2) not null default 0,  -- HT
  vat_rate numeric(5,2) not null default 10,
  cost_price numeric(12,2) default 0            -- prix d'achat (pour la marge)
);

-- ---------- Compteurs de numérotation (sans trou, par an) ----------
create table if not exists counters (
  company_id uuid references companies(id) on delete cascade,
  kind text,          -- D (devis) | F (facture) | A (avoir)
  year int,
  value int default 0,
  primary key (company_id, kind, year)
);

create or replace function next_number(p_kind text) returns text
language plpgsql security definer set search_path = public as $$
declare cid uuid := my_company_id(); y int := extract(year from now()); v int;
begin
  if cid is null then raise exception 'not authenticated'; end if;
  insert into counters (company_id, kind, year, value) values (cid, p_kind, y, 1)
    on conflict (company_id, kind, year) do update set value = counters.value + 1
    returning value into v;
  return p_kind || '-' || y || '-' || lpad(v::text, 4, '0');
end $$;

-- ---------- Documents (devis / factures / avoirs) ----------
create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default my_company_id() references companies(id) on delete cascade,
  created_at timestamptz default now(),
  kind text not null check (kind in ('quote','invoice','credit')),
  number text,                      -- attribué à la création (devis) ou à l'émission (facture)
  status text not null default 'draft',
  -- quote: draft | sent | signed | refused | invoiced
  -- invoice: draft | issued | paid | canceled
  client_id uuid references clients(id) on delete set null,
  client_snapshot jsonb,            -- copie figée du client au moment de l'émission
  title text,
  site_address text,                -- adresse du chantier
  issue_date date default current_date,
  due_date date,
  valid_until date,
  lines jsonb not null default '[]',-- [{label, description, qty, unit, unit_price, vat_rate}]
  discount_pct numeric(5,2) default 0,
  deposit_pct numeric(5,2) default 0, -- acompte demandé
  total_ht numeric(12,2) default 0,
  total_vat numeric(12,2) default 0,
  total_ttc numeric(12,2) default 0,
  notes text,
  -- signature
  public_token uuid default gen_random_uuid(),
  signed_at timestamptz,
  signer_name text,
  signature_data text,              -- image PNG base64
  signer_ip text,
  -- liens
  source_quote_id uuid references documents(id) on delete set null,
  paid_at timestamptz,
  payment_method text
);
create unique index if not exists documents_number_uniq on documents(company_id, number) where number is not null;

-- Une facture émise ne peut plus être modifiée (obligation légale) — seulement payée/annulée
create or replace function protect_issued_invoice() returns trigger
language plpgsql as $$
begin
  if old.kind in ('invoice','credit') and old.status <> 'draft' then
    if new.lines is distinct from old.lines
       or new.total_ttc is distinct from old.total_ttc
       or new.number is distinct from old.number
       or new.client_snapshot is distinct from old.client_snapshot then
      raise exception 'Facture émise : modification interdite. Faites un avoir.';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_protect_invoice on documents;
create trigger trg_protect_invoice before update on documents
  for each row execute function protect_issued_invoice();

create or replace function prevent_issued_delete() returns trigger
language plpgsql as $$
begin
  if old.kind in ('invoice','credit') and old.status <> 'draft' then
    raise exception 'Une facture émise ne peut pas être supprimée.';
  end if;
  return old;
end $$;
drop trigger if exists trg_prevent_delete on documents;
create trigger trg_prevent_delete before delete on documents
  for each row execute function prevent_issued_delete();

-- ---------- Interventions (planning) ----------
create table if not exists interventions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default my_company_id() references companies(id) on delete cascade,
  created_at timestamptz default now(),
  client_id uuid references clients(id) on delete set null,
  document_id uuid references documents(id) on delete set null,
  title text not null,
  address text,
  starts_at timestamptz not null,
  duration_min int default 120,
  technician text,
  status text default 'planned',    -- planned | done | canceled
  notes text,
  equipment jsonb                   -- infos plaque chaudière scannée
);

-- ---------- RLS ----------
alter table companies enable row level security;
alter table members enable row level security;
alter table clients enable row level security;
alter table catalog_items enable row level security;
alter table documents enable row level security;
alter table interventions enable row level security;
alter table counters enable row level security;

drop policy if exists company_rw on companies;
create policy company_rw on companies for all
  using (id = my_company_id()) with check (id = my_company_id());

drop policy if exists members_r on members;
create policy members_r on members for select using (company_id = my_company_id());

do $$ declare t text; begin
  foreach t in array array['clients','catalog_items','documents','interventions'] loop
    execute format('drop policy if exists tenant_rw on %I', t);
    execute format('create policy tenant_rw on %I for all using (company_id = my_company_id()) with check (company_id = my_company_id())', t);
  end loop;
end $$;

-- Empêche un utilisateur de s'attribuer lui-même l'abonnement "pro"
create or replace function protect_plan() returns trigger
language plpgsql as $$
begin
  if coalesce(nullif(current_setting('request.jwt.claims', true), '')::json->>'role',
              current_setting('request.jwt.claim.role', true)) = 'authenticated' then
    new.plan := old.plan;
    new.trial_ends_at := old.trial_ends_at;
    new.stripe_customer_id := old.stripe_customer_id;
    new.stripe_subscription_id := old.stripe_subscription_id;
  end if;
  return new;
end $$;
drop trigger if exists trg_protect_plan on companies;
create trigger trg_protect_plan before update on companies
  for each row execute function protect_plan();

-- ---------- Accès public pour la signature du devis (lien envoyé au client) ----------
create or replace function get_public_quote(p_token uuid) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'doc', to_json(d.*) ,
    'company', json_build_object('name', c.name, 'address', c.address, 'zip', c.zip, 'city', c.city,
       'phone', c.phone, 'email', c.email, 'siret', c.siret, 'vat_number', c.vat_number,
       'vat_exempt', c.vat_exempt, 'logo_url', c.logo_url, 'insurance', c.insurance,
       'legal_form', c.legal_form, 'rcs', c.rcs, 'capital', c.capital, 'iban', c.iban, 'bic', c.bic,
       'payment_terms_days', c.payment_terms_days, 'late_penalty_rate', c.late_penalty_rate, 'footer_note', c.footer_note)
  )
  from documents d join companies c on c.id = d.company_id
  where d.public_token = p_token and d.kind = 'quote'
$$;

create or replace function sign_public_quote(p_token uuid, p_name text, p_signature text, p_ip text default null)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update documents set status = 'signed', signed_at = now(), signer_name = p_name,
    signature_data = p_signature, signer_ip = p_ip
  where public_token = p_token and kind = 'quote' and status in ('draft','sent');
  return found;
end $$;

grant execute on function get_public_quote(uuid) to anon, authenticated;
grant execute on function sign_public_quote(uuid, text, text, text) to anon, authenticated;
grant execute on function next_number(text) to authenticated;

-- ---------- Stockage des logos ----------
insert into storage.buckets (id, name, public) values ('logos', 'logos', true)
  on conflict (id) do nothing;
drop policy if exists logos_upload on storage.objects;
create policy logos_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'logos' and (storage.foldername(name))[1] = my_company_id()::text);
drop policy if exists logos_update on storage.objects;
create policy logos_update on storage.objects for update to authenticated
  using (bucket_id = 'logos' and (storage.foldername(name))[1] = my_company_id()::text);

-- ---------- V1.1 : photo du signataire ----------
alter table documents add column if not exists signer_photo text;
create or replace function sign_public_quote(p_token uuid, p_name text, p_signature text, p_photo text, p_ip text default null)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update documents set status = 'signed', signed_at = now(), signer_name = p_name,
    signature_data = p_signature, signer_photo = p_photo, signer_ip = p_ip
  where public_token = p_token and kind = 'quote' and status in ('draft','sent');
  return found;
end $$;
grant execute on function sign_public_quote(uuid, text, text, text, text) to anon, authenticated;
