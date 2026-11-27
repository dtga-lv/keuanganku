import { NextResponse, after, type NextRequest } from "next/server";
import { requireRole } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { route } from "@/lib/http";
import { scheduleSync } from "@/lib/sheets";

export const POST = route(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const u = await requireUser();
  await requireRole(u.id, id);
  after(() => scheduleSync(id));
  return NextResponse.json({ ok: true });
});
