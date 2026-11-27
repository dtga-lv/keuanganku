import { NextResponse, after, type NextRequest } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { q } from "@/lib/db";
import { HttpError, route } from "@/lib/http";
import { extractSpreadsheetId, scheduleSync, verifySpreadsheet } from "@/lib/sheets";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route(async (_req: NextRequest, { params }: Ctx) => {
  const { id } = await params;
  const u = await requireUser();
  const role = await requireRole(u.id, id);
  const [r] = await q(`select id, name, spreadsheet_id, last_sync_at, last_sync_error from reports where id = $1`, [id]);
  return NextResponse.json({ ...r, role });
});

const patch = z.object({ name: z.string().trim().min(1).max(80).optional(), spreadsheet: z.string().trim().nullable().optional() });

export const PATCH = route(async (req: NextRequest, { params }: Ctx) => {
  const { id } = await params;
  const u = await requireUser();
  await requireRole(u.id, id, ["owner"]);
  const b = patch.parse(await req.json());
  if (b.name) await q(`update reports set name = $2 where id = $1`, [id, b.name]);
  if (b.spreadsheet !== undefined) {
    if (!b.spreadsheet) {
      await q(`update reports set spreadsheet_id = null, last_sync_error = null where id = $1`, [id]);
    } else {
      const sid = extractSpreadsheetId(b.spreadsheet);
      if (!sid) throw new HttpError(400, "Tautan atau ID Google Sheet tidak valid");
      await verifySpreadsheet(u.id, sid);
      await q(`update reports set spreadsheet_id = $2, last_sync_error = null where id = $1`, [id, sid]);
      after(() => scheduleSync(id));
    }
  }
  return NextResponse.json({ ok: true });
});

export const DELETE = route(async (_req: NextRequest, { params }: Ctx) => {
  const { id } = await params;
  const u = await requireUser();
  await requireRole(u.id, id, ["owner"]);
  await q(`delete from reports where id = $1`, [id]);
  return NextResponse.json({ ok: true });
});
