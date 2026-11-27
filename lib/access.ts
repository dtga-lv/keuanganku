import { q, isUuid } from "./db";
import { HttpError } from "./http";

export type Role = "owner" | "editor";

/** Memastikan user adalah anggota laporan (owner / kolaborator terverifikasi). Akses bersifat per laporan. */
export async function requireRole(userId: string, reportId: string, allowed: Role[] = ["owner", "editor"]): Promise<Role> {
  if (!isUuid(reportId)) throw new HttpError(404, "Laporan tidak ditemukan");
  const [m] = await q<{ role: Role }>(`select role from collaborators where report_id = $1 and user_id = $2`, [reportId, userId]);
  if (!m) throw new HttpError(404, "Laporan tidak ditemukan");
  if (!allowed.includes(m.role)) throw new HttpError(403, "Hanya pemilik laporan yang dapat melakukan ini");
  return m.role;
}
