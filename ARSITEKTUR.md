# KeuanganKu — Arsitektur & Panduan Pemasangan

PWA manajemen keuangan multi-laporan, mobile-first, berbahasa Indonesia.
Stack: Next.js 15 (App Router) · Tailwind 4 · Recharts · Lucide · NextAuth (Google) · PostgreSQL/Supabase · Tesseract.js · Google Sheets API.

## 1. Arsitektur

```
 HP (PWA)                      Next.js server                     Layanan luar
┌──────────────┐  fetch/SWR  ┌──────────────────────────┐
│ React UI     │────────────▶│ /api/auth  (NextAuth)    │──▶ Google OAuth 2.0
│ bottom nav   │             │ /api/reports/*           │──▶ PostgreSQL / Supabase
│ form, grafik │◀────────────│ /api/transactions/*      │
│ OCR uploader │  polling 5s │ /api/ocr  (RAM saja)     │──▶ Tesseract.js / Vision
└──────────────┘             │ lib/sheets (antrean sync)│──▶ Google Sheets API
                             └──────────────────────────┘      (token OWNER laporan)
```

Keputusan kunci:

| Topik | Keputusan | Alasan |
|---|---|---|
| Login | Google OAuth (NextAuth, JWT session) | Sesuai spesifikasi Gmail |
| Akses Sheet | OAuth refresh token **pemilik laporan** (terenkripsi AES-256-GCM) | Sheet milik user; kolaborator tidak perlu akses ke Sheet. Service Account tidak dipakai karena user harus membagikan Sheet ke email SA. |
| Otorisasi | Tabel `collaborators` diperiksa di setiap API (`requireRole`) | Privasi per laporan; akses granular |
| Undangan | Token acak 192-bit, hanya hash SHA-256 disimpan, sekali pakai, 7 hari, opsional dikunci ke email tertentu, harus ditekan “Terima” | “Verifikasi” sebelum bergabung |
| Sync transaksi | Setelah create/edit/delete, `after()` memanggil `scheduleSync` yang **menulis ulang tab dari DB** terurut `occurred_at` | Selalu konsisten & kronologis; tidak perlu melacak nomor baris |
| Sync grafik | `GET /analytics?sync=1` → `after(syncCharts)` memperbarui tab “Laporan” (tabel + 4 grafik native) | Grafik Sheet mengikuti tampilan terakhir di aplikasi |
| OCR | Foto → `Buffer` → sharp → Tesseract → dibuang | Foto tidak pernah disimpan |
| Real-time | SWR polling 5 dtk + revalidasi saat fokus | Sederhana; naik kelas ke Supabase Realtime bila perlu |
| Zona waktu | `APP_TZ=Asia/Jakarta` untuk Sheet & agregasi | Konsisten untuk semua kolaborator |

## 2. Skema database
Lengkap di `db/schema.sql`. Ringkasan:

- **users** (id, google_sub, email, name, avatar_url, google_refresh_token_enc)
- **reports** (id, owner_id, name, currency, spreadsheet_id, last_sync_at, last_sync_error)
- **collaborators** (report_id, user_id, role `owner|editor`) — PK gabungan
- **invitations** (report_id, invited_by, token_hash, invited_email?, status, expires_at, accepted_by)
- **categories** (report_id, kind `pengeluaran|pemasukan`, name) — unik per laporan
- **payment_methods** (report_id, name) — hanya yang custom; Cash/Kredit/Debit/Transfer/E-Wallet bawaan UI
- **transactions** (report_id, created_by, updated_by, occurred_at, type `pengeluaran|pemasukan|utang|piutang`, payment_method, category_id, amount, currency, note, source `manual|ocr`)

## 3. Skema Google Sheets

**Tab `Data Transaksi`** (A–K, baris 1 = header dengan Auto-filter, dibekukan; kolom A disembunyikan):

| A | B | C | D | E | F | G | H | I | J | K |
|---|---|---|---|---|---|---|---|---|---|---|
| ID Transaksi | Tanggal | Jam | Jenis | Kategori | Cara Pembayaran | Nominal | Mata Uang | Catatan | Dicatat Oleh | Sumber |

Baris terurut Tanggal+Jam menaik. Sinkronisasi **satu arah** (aplikasi → Sheet); edit manual di Sheet akan tertimpa.

**Tab `Laporan`**: judul & rentang (A1:A3), insight terbesar/terkecil (A4:A7), tabel pengeluaran per kategori (A9), pemasukan per kategori (D9), ringkasan per periode (G9), lalu 4 grafik: donut & bar untuk pengeluaran dan pemasukan (mulai kolom K).

## 4. Pemasangan

1. **Google Cloud Console**: buat project → aktifkan *Google Sheets API* → OAuth consent screen → buat OAuth Client (Web). Redirect URI: `{NEXTAUTH_URL}/api/auth/callback/google`. Scope: `.../auth/spreadsheets`.
2. `cp .env.example .env.local`, isi semua nilai. Kunci enkripsi: `openssl rand -base64 32`.
3. `npm install` → `npm run db:init` (atau jalankan `db/schema.sql` di SQL Editor Supabase) → `npm run dev`.
4. Untuk OCR offline, taruh `ind.traineddata` dan `eng.traineddata` di satu folder dan isi `TESSDATA_PATH`.
5. Deploy: pakai **server Node persisten** (VPS, Railway, Fly, Render). Tesseract.js kurang cocok di serverless; di Vercel gunakan `OCR_ENGINE=vision`.
6. Ikon PWA: `public/icons/icon-192.png` dan `icon-512.png` (sumber `icon.svg`).

## 5. Catatan produksi

- Scope `spreadsheets` termasuk *sensitive scope*: aplikasi perlu **verifikasi Google** sebelum dipakai di luar mode Testing (maks. 100 test user). Alternatif lebih ringan: scope `drive.file` + Google Picker.
- Kuota Sheets API ±60 permintaan/menit/user. Antrean `scheduleSync` menggabungkan sync beruntun; untuk data besar ubah ke strategi append/update baris.
- Antrean sync berada di memori satu instance; jika multi-instance, tambahkan `pg_advisory_lock(report_id)`.
- Jika memakai Supabase client dari browser, aktifkan RLS (lihat komentar di akhir `schema.sql`).
- Akurasi OCR tergantung foto; selalu ditampilkan untuk dikoreksi sebelum disimpan.
- Utang/piutang tidak masuk grafik pemasukan/pengeluaran.
- Rate-limit `/api/ocr` & `/api/reports/*/collab` sebaiknya ditambahkan (mis. Upstash) sebelum publik.
- Belum dikompilasi di lingkungan ini (tanpa jaringan): jalankan `npm run build` dan perbaiki bila ada selisih versi paket.
