import { NextResponse, after, type NextRequest } from "next/server";
import { requireRole } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { isUuid, q } from "@/lib/db";
import { HttpError, route } from "@/lib/http";
import { txSchema } from "@/lib/schemas";
import { scheduleSync } from "@/lib/sheets";

type Ctx = { params: Promise<{ id: string }> };

async function load(id: string, userId: string) {
  if (!isUuid(id)) throw new HttpError(404, "Transaksi tidak ditemukan");
  const [t] = await q<{ report_id: string }>(`select report_id from transactions where id = $1`, [id]);
  if (!t) throw new HttpError(404, "Transaksi tidak ditemukan");
  await requireRole(userId, t.report_id);
  return t.report_id;
}

export const PATCH = route(async (req: NextRequest, { params }: Ctx) => {
  const { id } = await params;
  const u = await requireUser();
  const reportId = await load(id, u.id);
  const b = txSchema.parse(await req.json());
  if (b.category_id) {
    const ok = await q(`select 1 from categories where id = $1 and report_id = $2`, [b.category_id, reportId]);
    if (!ok.length) throw new HttpError(400, "Kategori tidak ditemukan di laporan ini");
  }
  await q(
    `update transactions set occurred_at=$2, type=$3, payment_method=$4, category_id=$5, amount=$6,
            currency=$7, note=$8, source=$9, updated_by=$10, updated_at=now() where id=$1`,
    [id, b.occurred_at, b.type, b.payment_method, b.category_id, b.amount, b.currency, b.note, b.source, u.id]);
  after(() => scheduleSync(reportId));
  return NextResponse.json({ ok: true });
});

export const DELETE = route(async (_req: NextRequest, { params }: Ctx) => {
  const { id } = await params;
  const u = await requireUser();
  const reportId = await load(id, u.id);
  await q(`delete from transactions where id = $1`, [id]);
  after(() => scheduleSync(reportId));
  return NextResponse.json({ ok: true });
});
