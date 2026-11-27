import { NextResponse, after, type NextRequest } from "next/server";
import { requireRole } from "@/lib/access";
import { computeAnalytics } from "@/lib/analytics";
import { requireUser } from "@/lib/auth";
import { HttpError, route } from "@/lib/http";
import { syncCharts } from "@/lib/sheets";

const D = /^\d{4}-\d{2}-\d{2}$/;

export const GET = route(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const u = await requireUser();
  await requireRole(u.id, id);
  const sp = req.nextUrl.searchParams;
  const from = sp.get("from") ?? "", to = sp.get("to") ?? "";
  if (!D.test(from) || !D.test(to) || from > to) throw new HttpError(400, "Rentang tanggal tidak valid");
  const data = await computeAnalytics(id, from, to);
  // Grafik di tab "Laporan" Google Sheet mengikuti tampilan terakhir di aplikasi.
  if (sp.get("sync") === "1") {
    const label = (sp.get("label") ?? "Custom").slice(0, 40);
    after(() => syncCharts(id, from, to, label).catch((e) => console.error("sync grafik gagal", e)));
  }
  return NextResponse.json(data);
});
