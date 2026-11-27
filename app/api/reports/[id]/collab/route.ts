import { NextResponse, type NextRequest } from "next/server";
import { randomBytes } from "crypto";
import { z } from "zod";
import { requireRole } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { sha256 } from "@/lib/crypto";
import { isUuid, q } from "@/lib/db";
import { HttpError, route } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route(async (_req: NextRequest, { params }: Ctx) => {
  const { id } = await params;
  const u = await requireUser();
  const role = await requireRole(u.id, id);
  const members = await q(
    `select us.id, us.name, us.email, us.avatar_url, c.role, c.joined_at
       from collaborators c join users us on us.id = c.user_id
      where c.report_id = $1 order by (c.role = 'owner') desc, c.joined_at`, [id]);
  const invites = role === "owner"
    ? await q(`select id, invited_email, expires_at, created_at from invitations
                where report_id = $1 and status = 'pending' and expires_at > now() order by created_at desc`, [id])
    : [];
  return NextResponse.json({ members, invites, selfId: u.id, role });
});

// Buat tautan undangan sekali pakai (hanya owner). Token tidak disimpan, hanya hash-nya.
export const POST = route(async (req: NextRequest, { params }: Ctx) => {
  const { id } = await params;
  const u = await requireUser();
  await requireRole(u.id, id, ["owner"]);
  const { email } = z.object({ email: z.string().trim().email().optional() }).parse(await req.json().catch(() => ({})));
  const token = randomBytes(24).toString("base64url");
  const [row] = await q<{ expires_at: string }>(
    `insert into invitations (report_id, invited_by, token_hash, invited_email, expires_at)
     values ($1,$2,$3,$4, now() + interval '7 days') returning expires_at`,
    [id, u.id, sha256(token), email?.toLowerCase() ?? null]);
  const base = process.env.NEXTAUTH_URL ?? req.nextUrl.origin;
  return NextResponse.json({ url: `${base}/undangan/${token}`, expires_at: row.expires_at }, { status: 201 });
});

// Owner: cabut kolaborator / batalkan undangan. Kolaborator: boleh keluar sendiri.
export const DELETE = route(async (req: NextRequest, { params }: Ctx) => {
  const { id } = await params;
  const u = await requireUser();
  const role = await requireRole(u.id, id);
  const userId = req.nextUrl.searchParams.get("userId");
  const inviteId = req.nextUrl.searchParams.get("inviteId");
  if (inviteId) {
    if (role !== "owner" || !isUuid(inviteId)) throw new HttpError(403, "Tidak diizinkan");
    await q(`update invitations set status = 'revoked' where id = $1 and report_id = $2 and status = 'pending'`, [inviteId, id]);
  } else if (userId && isUuid(userId)) {
    if (role !== "owner" && userId !== u.id) throw new HttpError(403, "Hanya pemilik yang dapat mencabut akses");
    await q(`delete from collaborators where report_id = $1 and user_id = $2 and role <> 'owner'`, [id, userId]);
  } else throw new HttpError(400, "Parameter tidak lengkap");
  return NextResponse.json({ ok: true });
});
