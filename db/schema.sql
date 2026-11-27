-- KeuanganKu — skema PostgreSQL (Supabase kompatibel)
create extension if not exists "pgcrypto";

create type tx_type as enum ('pengeluaran', 'pemasukan', 'utang', 'piutang');

-- 1. USERS -------------------------------------------------------------
create table users (
  id                       uuid primary key default gen_random_uuid(),
  google_sub               text not null unique,
  email                    text not null unique,
  name                     text,
  avatar_url               text,
  google_refresh_token_enc text,             -- AES-256-GCM, dipakai untuk menulis ke Google Sheet milik user
  created_at               timestamptz not null default now()
);

-- 2. REPORTS (laporan keuangan / ledger) -------------------------------
create table reports (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references users(id) on delete cascade,
  name            text not null check (char_length(name) between 1 and 80),
  currency        char(3) not null default 'IDR',
  spreadsheet_id  text,                      -- ID Google Sheet milik owner (opsional)
  last_sync_at    timestamptz,
  last_sync_error text,
  created_at      timestamptz not null default now()
);
create index on reports(owner_id);

-- 3. COLLABORATORS (akses per laporan) ----------------------------------
create table collaborators (
  report_id  uuid not null references reports(id) on delete cascade,
  user_id    uuid not null references users(id) on delete cascade,
  role       text not null check (role in ('owner', 'editor')),
  joined_at  timestamptz not null default now(),
  primary key (report_id, user_id)
);
create index on collaborators(user_id);

-- 3b. INVITATIONS (tautan undangan sekali pakai; token disimpan sebagai hash) --
create table invitations (
  id             uuid primary key default gen_random_uuid(),
  report_id      uuid not null references reports(id) on delete cascade,
  invited_by     uuid not null references users(id) on delete cascade,
  token_hash     text not null unique,
  invited_email  text,                       -- jika diisi, hanya akun Gmail ini yang bisa menerima
  status         text not null default 'pending' check (status in ('pending', 'accepted', 'revoked')),
  expires_at     timestamptz not null,
  accepted_by    uuid references users(id),
  accepted_at    timestamptz,
  created_at     timestamptz not null default now()
);
create index on invitations(report_id);

-- 4. CATEGORIES (custom per laporan) -----------------------------------
create table categories (
  id         uuid primary key default gen_random_uuid(),
  report_id  uuid not null references reports(id) on delete cascade,
  kind       text not null check (kind in ('pengeluaran', 'pemasukan')),
  name       text not null check (char_length(name) between 1 and 40),
  created_at timestamptz not null default now()
);
create unique index categories_uq on categories (report_id, kind, lower(name));

-- 4b. PAYMENT_METHODS custom (Cash/Kredit/Debit/Transfer/E-Wallet adalah bawaan di aplikasi)
create table payment_methods (
  id         uuid primary key default gen_random_uuid(),
  report_id  uuid not null references reports(id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 30)
);
create unique index payment_methods_uq on payment_methods (report_id, lower(name));

-- 5. TRANSACTIONS -------------------------------------------------------
create table transactions (
  id              uuid primary key default gen_random_uuid(),
  report_id       uuid not null references reports(id) on delete cascade,
  created_by      uuid references users(id) on delete set null,
  updated_by      uuid references users(id) on delete set null,
  occurred_at     timestamptz not null default now(),
  type            tx_type not null default 'pengeluaran',
  payment_method  text not null default 'Cash',
  category_id     uuid references categories(id) on delete set null,
  amount          numeric(18,2) not null check (amount > 0),
  currency        char(3) not null default 'IDR',
  note            text not null default '',
  source          text not null default 'manual' check (source in ('manual', 'ocr')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index on transactions (report_id, occurred_at desc);
create index on transactions (report_id, type, occurred_at);

-- Catatan keamanan:
-- Semua akses lewat API server (Next.js) yang memeriksa tabel collaborators.
-- Jika Anda juga memakai Supabase client dari browser, aktifkan RLS dan buat policy:
--   using (exists (select 1 from collaborators c where c.report_id = <tabel>.report_id and c.user_id = auth.uid()))
