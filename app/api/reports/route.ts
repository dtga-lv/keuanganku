import { NextResponse, type NextRequest } from "next/server";
import { after } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { q, withTx } from "@/lib/db";
import { HttpError, route } from "@/lib/http";
import { extractSpreadsheetId, scheduleSync, verifySpreadsheet } from "@/lib/sheets";

const EXPENSE = ["Makanan", "Transportasi", "Belanja", "Tagihan", "Kesehatan", "Hiburan", "Lainnya"];
const INCOME = ["Gaji", "Usaha", "Bonus", "Lainnya"];

export const GET = route(async () => {
  const u = await requireUser();
  const rows = await q(
    `select r.id, r.name, c.role, r.spreadsheet_id, r.last_sync_at, r.last_sync_error,
            (select count(*) from collaborators x where x.report_id = r.id)::int as member_count
       from reports r join collaborators c on c.report_id = r.id and c.user_id = $1
      order by r.created_at`, [u.id]);
  return NextResponse.json(rows);
});

const schema = z.object({ name: z.string().trim().min(1).max(80), spreadsheet: z.string().trim().optional() });

export const POST = route(async (req: NextRequest) => {
  const u = await requireUser();
  const body = schema.parse(await req.json());
  let spreadsheetId: string | null = null;
  if (body.spreadsheet) {
    spreadsheetId = extractSpreadsheetId(body.spreadsheet);
    if (!spreadsheetId) throw new HttpError(400, "Tautan atau ID Google Sheet tidak valid");
    await verifySpreadsheet(u.id, spreadsheetId);
  }
  const id = await withTx(async (c) => {
    const { rows } = await c.query(`insert into reports (owner_id, name, spreadsheet_id) values ($1,$2,$3) returning id`, [u.id, body.name, spreadsheetId]);
    const rid: string = rows[0].id;
    await c.query(`insert into collaborators (report_id, user_id, role) values ($1,$2,'owner')`, [rid, u.id]);
    for (const n of EXPENSE) await c.query(`insert into categories (report_id, kind, name) values ($1,'pengeluaran',$2)`, [rid, n]);
    for (const n of INCOME) await c.query(`insert into categories (report_id, kind, name) values ($1,'pemasukan',$2)`, [rid, n]);
    return rid;
  });
  if (spreadsheetId) after(() => scheduleSync(id));
  return NextResponse.json({ id }, { status: 201 });
});
