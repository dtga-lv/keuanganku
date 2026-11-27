import { NextResponse, after, type NextRequest } from "next/server";
import { requireRole } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { q } from "@/lib/db";
import { HttpError, route } from "@/lib/http";
import { txSchema } from "@/lib/schemas";
import { scheduleSync } from "@/lib/sheets";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route(async (req: NextRequest, { params }: Ctx) => {
  const { id } = await params;
  const u = await requireUser();
  await requireRole(u.id, id);
  const rows = await q(
    `select t.id, t.occurred_at, t.type::text as type, t.payment_method, t.category_id, c.name as category_name,
            t.amount::float8 as amount, t.currency, t.note, t.source, us.name as created_by_name
       from transactions t
       left join categories c on c.id = t.category_id
       left join users us on us.id = t.created_by
      where t.report_id = $1
      order by t.occurred_at desc, t.created_at desc limit 1000`, [id]);
  return NextResponse.json(rows);
});

export const POST = route(async (req: NextRequest, { params }: Ctx) => {
  const { id } = await params;
  const u = await requireUser();
  await requireRole(u.id, id); // owner atau kolaborator terverifikasi
  const b = txSchema.parse(await req.json());
  if (b.category_id) {
    const ok = await q(`select 1 from categories where id = $1 and report_id = $2`, [b.category_id, id]);
    if (!ok.length) throw new HttpError(400, "Kategori tidak ditemukan di laporan ini");
  }
  const [row] = await q<{ id: string }>(
    `insert into transactions (report_id, created_by, updated_by, occurred_at, type, payment_method, category_id, amount, currency, note, source)
     values ($1,$2,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id`,
    [id, u.id, b.occurred_at, b.type, b.payment_method, b.category_id, b.amount, b.currency, b.note, b.source]);
  after(() => scheduleSync(id)); // sync trigger -> Google Sheet
  return NextResponse.json(row, { status: 201 });
});
