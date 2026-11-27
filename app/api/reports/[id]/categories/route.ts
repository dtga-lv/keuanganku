import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { q } from "@/lib/db";
import { route } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route(async (_req: NextRequest, { params }: Ctx) => {
  const { id } = await params;
  const u = await requireUser();
  await requireRole(u.id, id);
  const categories = await q(`select id, kind, name from categories where report_id = $1 order by name`, [id]);
  const pm = await q<{ name: string }>(`select name from payment_methods where report_id = $1 order by name`, [id]);
  return NextResponse.json({ categories, paymentMethods: pm.map((x) => x.name) });
});

const schema = z.object({ kind: z.enum(["pengeluaran", "pemasukan", "payment"]), name: z.string().trim().min(1).max(40) });

export const POST = route(async (req: NextRequest, { params }: Ctx) => {
  const { id } = await params;
  const u = await requireUser();
  await requireRole(u.id, id);
  const b = schema.parse(await req.json());
  if (b.kind === "payment") {
    await q(`insert into payment_methods (report_id, name) values ($1,$2) on conflict do nothing`, [id, b.name]);
    return NextResponse.json({ name: b.name }, { status: 201 });
  }
  await q(`insert into categories (report_id, kind, name) values ($1,$2,$3) on conflict do nothing`, [id, b.kind, b.name]);
  const [row] = await q(`select id, kind, name from categories where report_id=$1 and kind=$2 and lower(name)=lower($3)`, [id, b.kind, b.name]);
  return NextResponse.json(row, { status: 201 });
});
