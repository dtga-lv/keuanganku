import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { sha256 } from "@/lib/crypto";
import { q, withTx } from "@/lib/db";
import { HttpError, route } from "@/lib/http";

type Ctx = { params: Promise<{ token: string }> };
type Inv = { id: string; report_id: string; status: string; expires_at: string; invited_email: string | null; report_name: string; inviter: string | null };

async function lookup(token: string): Promise<Inv> {
  const [inv] = await q<Inv>(
    `select i.id, i.report_id, i.status, i.expires_at, i.invited_email, r.name as report_name, u.name as inviter
       from invitations i join reports r on r.id = i.report_id join users u on u.id = i.invited_by
      where i.token_hash = $1`, [sha256(token)]);
  if (!inv) throw new HttpError(404, "Undangan tidak ditemukan");
  return inv;
}
function check(inv: Inv, email: string) {
  if (inv.status !== "pending" || new Date(inv.expires_at) < new Date()) throw new HttpError(410, "Undangan sudah tidak berlaku");
  if (inv.invited_email && inv.invited_email.toLowerCase() !== email.toLowerCase())
    throw new HttpError(403, "Undangan ini ditujukan untuk akun Gmail lain. Masuk dengan akun yang diundang.");
}

export const GET = route(async (_req: NextRequest, { params }: Ctx) => {
  const { token } = await params;
  const u = await requireUser();
  const inv = await lookup(token);
  const [m] = await q(`select 1 from collaborators where report_id = $1 and user_id = $2`, [inv.report_id, u.id]);
  if (m) return NextResponse.json({ alreadyMember: true, reportId: inv.report_id, reportName: inv.report_name });
  check(inv, u.email);
  return NextResponse.json({ reportName: inv.report_name, inviter: inv.inviter, alreadyMember: false });
});

// Verifikasi: user harus login dengan akun Gmail-nya lalu menekan "Terima".
export const POST = route(async (_req: NextRequest, { params }: Ctx) => {
  const { token } = await params;
  const u = await requireUser();
  const reportId = await withTx(async (c) => {
    const { rows } = await c.query(`select id, report_id, status, expires_at, invited_email from invitations where token_hash = $1 for update`, [sha256(token)]);
    const inv = rows[0];
    if (!inv) throw new HttpError(404, "Undangan tidak ditemukan");
    check({ ...inv, report_name: "", inviter: null }, u.email);
    await c.query(`insert into collaborators (report_id, user_id, role) values ($1,$2,'editor') on conflict do nothing`, [inv.report_id, u.id]);
    await c.query(`update invitations set status='accepted', accepted_by=$2, accepted_at=now() where id=$1`, [inv.id, u.id]);
    return inv.report_id as string;
  });
  return NextResponse.json({ reportId });
});
