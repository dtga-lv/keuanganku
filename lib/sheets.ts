import { google, type sheets_v4 } from "googleapis";
import { q, TZ } from "./db";
import { decrypt } from "./crypto";
import { HttpError } from "./http";
import { computeAnalytics } from "./analytics";
import { rupiah } from "./format";

export const TAB_DATA = "Data Transaksi";
export const TAB_REPORT = "Laporan";

/** Skema kolom Google Sheet (tab "Data Transaksi"), A–K. Kolom A disembunyikan. */
export const SHEET_HEADERS = [
  "ID Transaksi", "Tanggal", "Jam", "Jenis", "Kategori", "Cara Pembayaran",
  "Nominal", "Mata Uang", "Catatan", "Dicatat Oleh", "Sumber",
];
const NCOL = SHEET_HEADERS.length;

export function extractSpreadsheetId(input: string): string | null {
  const s = input.trim();
  const m = s.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  return /^[a-zA-Z0-9_-]{20,}$/.test(s) ? s : null;
}

/** Semua penulisan ke Sheet memakai token OAuth PEMILIK laporan, termasuk untuk transaksi kolaborator. */
async function clientFor(ownerId: string): Promise<sheets_v4.Sheets> {
  const [u] = await q<{ google_refresh_token_enc: string | null }>(
    `select google_refresh_token_enc from users where id = $1`, [ownerId]);
  if (!u?.google_refresh_token_enc)
    throw new Error("Pemilik laporan belum memberi izin Google Sheets. Keluar lalu masuk lagi.");
  const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
  auth.setCredentials({ refresh_token: decrypt(u.google_refresh_token_enc) });
  return google.sheets({ version: "v4", auth });
}

async function tabIds(sheets: sheets_v4.Sheets, spreadsheetId: string) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets(properties(sheetId,title))" });
  const m = new Map((meta.data.sheets ?? []).map((s) => [s.properties!.title!, s.properties!.sheetId!]));
  return m;
}

/** Membuat tab "Data Transaksi" dan "Laporan" bila belum ada. */
export async function ensureTabs(sheets: sheets_v4.Sheets, spreadsheetId: string) {
  let m = await tabIds(sheets, spreadsheetId);
  const requests: sheets_v4.Schema$Request[] = [];
  for (const title of [TAB_DATA, TAB_REPORT]) if (!m.has(title)) requests.push({ addSheet: { properties: { title } } });
  if (requests.length) {
    await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } });
    m = await tabIds(sheets, spreadsheetId);
  }
  return { data: m.get(TAB_DATA)!, report: m.get(TAB_REPORT)! };
}

export async function verifySpreadsheet(ownerId: string, spreadsheetId: string) {
  try {
    const sheets = await clientFor(ownerId);
    await ensureTabs(sheets, spreadsheetId);
  } catch (e) {
    const code = (e as { code?: number }).code;
    if (code === 403 || code === 404)
      throw new HttpError(400, "Google Sheet tidak bisa diakses. Pastikan Sheet itu milik akun Google Anda atau dibagikan sebagai Editor.");
    throw new HttpError(400, (e as Error).message || "Gagal terhubung ke Google Sheets");
  }
}

// ---------------------------------------------------------------------------
// Sinkronisasi transaksi (App -> Sheet, satu arah). Tab ditulis ulang dari DB,
// selalu terurut kronologis (Tanggal+Jam) dan konsisten walau ada edit/hapus.
// ---------------------------------------------------------------------------
const JENIS: Record<string, string> = { pengeluaran: "Pengeluaran", pemasukan: "Pemasukan", utang: "Utang", piutang: "Piutang" };

async function syncTransactions(reportId: string) {
  const [r] = await q<{ owner_id: string; spreadsheet_id: string | null }>(
    `select owner_id, spreadsheet_id from reports where id = $1`, [reportId]);
  if (!r?.spreadsheet_id) return;
  const spreadsheetId = r.spreadsheet_id;
  try {
    const sheets = await clientFor(r.owner_id);
    const tabs = await ensureTabs(sheets, spreadsheetId);

    const rows = await q<{
      id: string; d: string; t: string; type: string; category: string | null; payment_method: string;
      amount: number; currency: string; note: string; uname: string | null; source: string;
    }>(
      `select t.id,
              to_char(t.occurred_at at time zone $2, 'YYYY-MM-DD') as d,
              to_char(t.occurred_at at time zone $2, 'HH24:MI:SS') as t,
              t.type::text, c.name as category, t.payment_method, t.amount::float8 as amount,
              t.currency, t.note, u.name as uname, t.source
         from transactions t
         left join categories c on c.id = t.category_id
         left join users u on u.id = t.created_by
        where t.report_id = $1
        order by t.occurred_at asc, t.created_at asc`,
      [reportId, TZ]
    );
    const values = [
      SHEET_HEADERS,
      ...rows.map((x) => [x.id, x.d, x.t, JENIS[x.type], x.category ?? "", x.payment_method, x.amount,
        x.currency, x.note, x.uname ?? "", x.source === "ocr" ? "Scan struk" : "Manual"]),
    ];

    const range = (c0: number, c1: number, r0 = 1) => ({ sheetId: tabs.data, startRowIndex: r0, startColumnIndex: c0, endColumnIndex: c1 });
    await sheets.spreadsheets.values.clear({ spreadsheetId, range: `'${TAB_DATA}'!A:K` });
    await sheets.spreadsheets.values.update({
      spreadsheetId, range: `'${TAB_DATA}'!A1`, valueInputOption: "USER_ENTERED", requestBody: { values },
    });
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          // Auto-filter pada semua kolom header
          { setBasicFilter: { filter: { range: { sheetId: tabs.data, startRowIndex: 0, startColumnIndex: 0, endColumnIndex: NCOL } } } },
          { updateSheetProperties: { properties: { sheetId: tabs.data, gridProperties: { frozenRowCount: 1 } }, fields: "gridProperties.frozenRowCount" } },
          { repeatCell: {
              range: { sheetId: tabs.data, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: NCOL },
              cell: { userEnteredFormat: { textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } }, backgroundColor: { red: 0.04, green: 0.43, blue: 0.43 } } },
              fields: "userEnteredFormat(textFormat,backgroundColor)" } },
          { updateDimensionProperties: { range: { sheetId: tabs.data, dimension: "COLUMNS", startIndex: 0, endIndex: 1 }, properties: { hiddenByUser: true }, fields: "hiddenByUser" } },
          { repeatCell: { range: range(1, 2), cell: { userEnteredFormat: { numberFormat: { type: "DATE", pattern: "dd/mm/yyyy" } } }, fields: "userEnteredFormat.numberFormat" } },
          { repeatCell: { range: range(2, 3), cell: { userEnteredFormat: { numberFormat: { type: "TIME", pattern: "HH:mm" } } }, fields: "userEnteredFormat.numberFormat" } },
          { repeatCell: { range: range(6, 7), cell: { userEnteredFormat: { numberFormat: { type: "NUMBER", pattern: "#,##0" } } }, fields: "userEnteredFormat.numberFormat" } },
          { repeatCell: { range: range(8, 9), cell: { userEnteredFormat: { wrapStrategy: "WRAP" } }, fields: "userEnteredFormat.wrapStrategy" } },
          { autoResizeDimensions: { dimensions: { sheetId: tabs.data, dimension: "COLUMNS", startIndex: 1, endIndex: 8 } } },
        ],
      },
    });
    await q(`update reports set last_sync_at = now(), last_sync_error = null where id = $1`, [reportId]);
  } catch (e) {
    await q(`update reports set last_sync_error = $2 where id = $1`, [reportId, ((e as Error).message ?? "Gagal sinkron").slice(0, 300)]);
    throw e;
  }
}

// Antrean per laporan: sinkron yang menumpuk digabung jadi satu putaran tambahan.
// (Jika deploy multi-instance/serverless, tambahkan pg_advisory_lock per report_id.)
const state = new Map<string, { running: boolean; pending: boolean }>();

export async function scheduleSync(reportId: string) {
  const s = state.get(reportId) ?? { running: false, pending: false };
  state.set(reportId, s);
  if (s.running) { s.pending = true; return; }
  s.running = true;
  try {
    do {
      s.pending = false;
      await syncTransactions(reportId).catch((e) => console.error("sync gagal", reportId, e));
    } while (s.pending);
  } finally {
    s.running = false;
  }
}

// ---------------------------------------------------------------------------
// Sinkronisasi grafik ke tab "Laporan": tabel ringkasan + 4 grafik native Sheets.
// ---------------------------------------------------------------------------
export async function syncCharts(reportId: string, from: string, to: string, rangeLabel: string) {
  const [r] = await q<{ owner_id: string; spreadsheet_id: string | null }>(
    `select owner_id, spreadsheet_id from reports where id = $1`, [reportId]);
  if (!r?.spreadsheet_id) return;
  const spreadsheetId = r.spreadsheet_id;
  const sheets = await clientFor(r.owner_id);
  const tabs = await ensureTabs(sheets, spreadsheetId);
  const a = await computeAnalytics(reportId, from, to);

  const line = (t: string, s?: { name: string; total: number }) => [s ? `${t}: ${s.name} (${rupiah(s.total)})` : `${t}: -`];
  const T = `'${TAB_REPORT}'`;
  await sheets.spreadsheets.values.clear({ spreadsheetId, range: `${T}!A:Z` });
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: "RAW",
      data: [
        { range: `${T}!A1`, values: [["Laporan Keuangan"], [`Rentang: ${rangeLabel} (${from} s.d. ${to})`], [`Total pemasukan: ${rupiah(a.totals.income)} | Total pengeluaran: ${rupiah(a.totals.expense)}`]] },
        { range: `${T}!A4`, values: [
            line("Pengeluaran terbesar", a.insight.maxExpense), line("Pengeluaran terkecil", a.insight.minExpense),
            line("Pemasukan terbesar", a.insight.maxIncome), line("Pemasukan terkecil", a.insight.minIncome)] },
        { range: `${T}!A9`, values: [["Kategori", "Pengeluaran"], ...a.expense.map((x) => [x.name, x.total])] },
        { range: `${T}!D9`, values: [["Kategori", "Pemasukan"], ...a.income.map((x) => [x.name, x.total])] },
        { range: `${T}!G9`, values: [["Periode", "Pengeluaran", "Pemasukan"], ...a.series.map((x) => [x.label, x.expense, x.income])] },
      ],
    },
  });

  const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets(properties(sheetId),charts(chartId))" });
  const old = meta.data.sheets?.find((s) => s.properties?.sheetId === tabs.report)?.charts ?? [];

  const H = 8; // indeks baris header tabel (baris 9)
  const gr = (c0: number, c1: number, r0: number, r1: number) => ({ sheetId: tabs.report, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 });
  const src = (g: ReturnType<typeof gr>) => ({ sourceRange: { sources: [g] } });
  const ex = a.expense.length, inc = a.income.length, ps = a.series.length;

  const place = (row: number, col: number) => ({ overlayPosition: { anchorCell: { sheetId: tabs.report, rowIndex: row, columnIndex: col }, widthPixels: 460, heightPixels: 290 } });
  const donut = (title: string, nameCol: number, valCol: number, n: number, row: number, col: number): sheets_v4.Schema$Request => ({
    addChart: { chart: { spec: { title, pieChart: { legendPosition: "RIGHT_LEGEND", pieHole: 0.5, domain: src(gr(nameCol, nameCol + 1, H + 1, H + 1 + n)), series: src(gr(valCol, valCol + 1, H + 1, H + 1 + n)) } }, position: place(row, col) } },
  });
  const bar = (title: string, valCol: number, rgb: { red: number; green: number; blue: number }, row: number, col: number): sheets_v4.Schema$Request => ({
    addChart: { chart: { spec: { title, basicChart: {
      chartType: "COLUMN", legendPosition: "NO_LEGEND", headerCount: 1,
      axis: [{ position: "BOTTOM_AXIS", title: "Periode" }, { position: "LEFT_AXIS", title: "Rupiah" }],
      domains: [{ domain: src(gr(6, 7, H, H + 1 + ps)) }],
      series: [{ series: src(gr(valCol, valCol + 1, H, H + 1 + ps)), targetAxis: "LEFT_AXIS", colorStyle: { rgbColor: rgb } }],
    } }, position: place(row, col) } },
  });

  const requests: sheets_v4.Schema$Request[] = [
    ...old.map((c) => ({ deleteEmbeddedObject: { objectId: c.chartId! } })),
    { repeatCell: { range: gr(0, 9, H, H + 1), cell: { userEnteredFormat: { textFormat: { bold: true } } }, fields: "userEnteredFormat.textFormat.bold" } },
    { repeatCell: { range: gr(0, 1, 0, 1), cell: { userEnteredFormat: { textFormat: { bold: true, fontSize: 14 } } }, fields: "userEnteredFormat.textFormat(bold,fontSize)" } },
  ];
  if (ex) requests.push(donut("Pengeluaran per kategori", 0, 1, ex, 2, 10));
  if (ps && ex) requests.push(bar("Pengeluaran per periode", 7, { red: 0.82, green: 0.33, blue: 0.12 }, 2, 18));
  if (inc) requests.push(donut("Pemasukan per kategori", 3, 4, inc, 18, 10));
  if (ps && inc) requests.push(bar("Pemasukan per periode", 8, { red: 0.12, green: 0.54, blue: 0.3 }, 18, 18));
  await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } });
}
