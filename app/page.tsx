"use client";
import { ChevronRight, LogOut, Plus, Users, Wallet } from "lucide-react";
import { signOut } from "next-auth/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import useSWR from "swr";
import Sheet from "@/components/Sheet";
import { api, fetcher } from "@/lib/api";
import type { ReportSummary } from "@/lib/types";

export default function Home() {
  const router = useRouter();
  const { data, error } = useSWR<ReportSummary[]>("/api/reports", fetcher);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(""); const [sheet, setSheet] = useState("");
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");

  async function create() {
    setBusy(true); setErr("");
    try {
      const r = await api<{ id: string }>("/api/reports", { method: "POST", body: JSON.stringify({ name, spreadsheet: sheet || undefined }) });
      router.push(`/laporan/${r.id}`);
    } catch (e) { setErr((e as Error).message); setBusy(false); }
  }

  return (
    <main className="mx-auto min-h-dvh max-w-md px-4 pb-28 pt-[max(1.5rem,env(safe-area-inset-top))]">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold tracking-tight">Laporan keuangan</h1>
        <button aria-label="Keluar" className="grid h-11 w-11 place-items-center rounded-full bg-white" onClick={() => signOut({ callbackUrl: "/login" })}><LogOut size={20} /></button>
      </header>

      {error && <p role="alert" className="rounded-xl bg-out/10 p-3 text-sm text-out">{(error as Error).message}</p>}
      {data && data.length === 0 && (
        <div className="py-16 text-center text-muted">
          <Wallet className="mx-auto mb-3" size={40} />
          <p className="font-semibold text-ink">Belum ada laporan</p>
          <p className="text-sm">Buat laporan pertama, misalnya “Keuangan Pribadi” atau “Kas Liburan”.</p>
        </div>
      )}
      <ul className="space-y-3">
        {data?.map((r) => (
          <li key={r.id}>
            <Link href={`/laporan/${r.id}`} className="flex items-center gap-3 rounded-2xl bg-white p-4 active:bg-paper">
              <div className="grid h-12 w-12 place-items-center rounded-xl bg-brand-soft text-brand"><Wallet size={24} /></div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">{r.name}</p>
                <p className="flex items-center gap-1.5 text-sm text-muted">
                  {r.role === "owner" ? "Pemilik" : "Kolaborator"}
                  {(r.member_count ?? 1) > 1 && <><Users size={13} />{r.member_count}</>}
                  {r.spreadsheet_id && <span>· Tersambung ke Sheet</span>}
                </p>
              </div>
              <ChevronRight className="text-muted" size={20} />
            </Link>
          </li>
        ))}
      </ul>

      <button aria-label="Buat laporan baru" onClick={() => setOpen(true)}
        className="fixed bottom-[max(1.5rem,env(safe-area-inset-bottom))] right-5 grid h-14 w-14 place-items-center rounded-full bg-brand text-white shadow-lg active:scale-95"><Plus size={28} /></button>

      {open && (
        <Sheet title="Laporan baru" onClose={() => setOpen(false)}>
          <div className="space-y-4 pb-4">
            <div><label htmlFor="n" className="mb-1.5 block text-sm font-semibold">Nama laporan</label>
              <input id="n" className="field" autoFocus placeholder="mis. Keuangan Pribadi" value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div><label htmlFor="s" className="mb-1.5 block text-sm font-semibold">Tautan atau ID Google Sheet (opsional)</label>
              <input id="s" className="field" placeholder="https://docs.google.com/spreadsheets/d/…" value={sheet} onChange={(e) => setSheet(e.target.value)} />
              <p className="mt-1 text-xs text-muted">Bisa ditautkan nanti dari Pengaturan.</p></div>
            {err && <p role="alert" className="rounded-xl bg-out/10 p-3 text-sm text-out">{err}</p>}
            <button className="btn-primary w-full" disabled={busy || !name.trim()} onClick={create}>Buat laporan</button>
          </div>
        </Sheet>
      )}
    </main>
  );
}
