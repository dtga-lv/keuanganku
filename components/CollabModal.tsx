"use client";
import { Check, Copy, Link2, Share2, UserMinus, X } from "lucide-react";
import { useState } from "react";
import useSWR from "swr";
import { api, fetcher } from "@/lib/api";
import Sheet from "./Sheet";

interface Member { id: string; name: string | null; email: string; role: "owner" | "editor" }
interface Invite { id: string; invited_email: string | null; expires_at: string }
interface Data { members: Member[]; invites: Invite[]; selfId: string; role: "owner" | "editor" }

export default function CollabModal({ reportId, onClose, onLeft }: { reportId: string; onClose: () => void; onLeft: () => void }) {
  // Polling ringan agar daftar anggota terasa real-time. Untuk push sungguhan, pakai Supabase Realtime.
  const { data, mutate } = useSWR<Data>(`/api/reports/${reportId}/collab`, fetcher, { refreshInterval: 8000 });
  const [email, setEmail] = useState("");
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const isOwner = data?.role === "owner";

  async function createInvite() {
    setBusy(true); setError(""); setCopied(false);
    try {
      const r = await api<{ url: string }>(`/api/reports/${reportId}/collab`, { method: "POST", body: JSON.stringify(email ? { email } : {}) });
      setLink(r.url); setEmail(""); mutate();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function del(qs: string, confirmMsg?: string) {
    if (confirmMsg && !confirm(confirmMsg)) return;
    try { await api(`/api/reports/${reportId}/collab?${qs}`, { method: "DELETE" }); mutate(); } catch (e) { setError((e as Error).message); }
  }
  async function copy() {
    if (!link) return;
    await navigator.clipboard.writeText(link); setCopied(true);
  }

  return (
    <Sheet title="Kolaborasi" onClose={onClose}>
      <div className="space-y-5 pb-4">
        <p className="text-sm text-muted">Kolaborator yang sudah menerima undangan dapat menambah, mengubah, dan menghapus transaksi di laporan ini saja.</p>

        {isOwner && (
          <section className="space-y-3 rounded-2xl bg-white p-4">
            <h3 className="font-bold">Undang lewat tautan</h3>
            <label className="block text-sm font-semibold" htmlFor="inv-email">Batasi untuk Gmail tertentu (opsional)</label>
            <input id="inv-email" type="email" inputMode="email" className="field" placeholder="nama@gmail.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            <button className="btn-primary w-full" disabled={busy} onClick={createInvite}><Link2 size={20} />Buat tautan undangan</button>
            {link && (
              <div className="space-y-2 rounded-xl bg-brand-soft p-3">
                <p className="break-all text-sm">{link}</p>
                <p className="text-xs text-muted">Sekali pakai, berlaku 7 hari. Tautan ini hanya ditampilkan sekarang.</p>
                <div className="flex gap-2">
                  <button className="btn-ghost flex-1" onClick={copy}>{copied ? <Check size={18} /> : <Copy size={18} />}{copied ? "Tersalin" : "Salin"}</button>
                  {typeof navigator !== "undefined" && "share" in navigator && (
                    <button className="btn-ghost flex-1" onClick={() => navigator.share({ title: "Undangan KeuanganKu", url: link }).catch(() => undefined)}><Share2 size={18} />Bagikan</button>
                  )}
                </div>
              </div>
            )}
          </section>
        )}

        <section>
          <h3 className="mb-2 font-bold">Anggota</h3>
          <ul className="divide-y divide-line overflow-hidden rounded-2xl bg-white">
            {data?.members.map((m) => (
              <li key={m.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{m.name ?? m.email}{m.id === data.selfId && " (Anda)"}</p>
                  <p className="truncate text-sm text-muted">{m.email}</p>
                </div>
                <span className="rounded-full bg-paper px-2.5 py-1 text-xs font-semibold">{m.role === "owner" ? "Pemilik" : "Kolaborator"}</span>
                {isOwner && m.role !== "owner" && (
                  <button aria-label={`Cabut akses ${m.name ?? m.email}`} className="grid h-10 w-10 place-items-center rounded-full text-out" onClick={() => del(`userId=${m.id}`, `Cabut akses ${m.name ?? m.email}?`)}><UserMinus size={20} /></button>
                )}
              </li>
            ))}
          </ul>
        </section>

        {isOwner && !!data?.invites.length && (
          <section>
            <h3 className="mb-2 font-bold">Undangan menunggu</h3>
            <ul className="divide-y divide-line overflow-hidden rounded-2xl bg-white">
              {data.invites.map((i) => (
                <li key={i.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                  <div className="flex-1"><p className="font-semibold">{i.invited_email ?? "Siapa saja yang punya tautan"}</p><p className="text-muted">Berlaku sampai {new Date(i.expires_at).toLocaleDateString("id-ID")}</p></div>
                  <button aria-label="Batalkan undangan" className="grid h-10 w-10 place-items-center rounded-full text-out" onClick={() => del(`inviteId=${i.id}`)}><X size={20} /></button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {data && !isOwner && (
          <button className="btn-ghost w-full text-out" onClick={async () => { if (confirm("Keluar dari laporan ini?")) { await api(`/api/reports/${reportId}/collab?userId=${data.selfId}`, { method: "DELETE" }); onLeft(); } }}>Keluar dari laporan</button>
        )}
        {error && <p role="alert" className="rounded-xl bg-out/10 p-3 text-sm text-out">{error}</p>}
      </div>
    </Sheet>
  );
}
