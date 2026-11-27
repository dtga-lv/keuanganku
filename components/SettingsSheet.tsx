"use client";
import { RefreshCw } from "lucide-react";
import { useState } from "react";
import { api } from "@/lib/api";
import type { ReportSummary } from "@/lib/types";
import Sheet from "./Sheet";

export default function SettingsSheet({ report, onClose, onChanged, onDeleted }: {
  report: ReportSummary; onClose: () => void; onChanged: () => void; onDeleted: () => void;
}) {
  const owner = report.role === "owner";
  const [name, setName] = useState(report.name);
  const [sheet, setSheet] = useState(report.spreadsheet_id ? `https://docs.google.com/spreadsheets/d/${report.spreadsheet_id}` : "");
  const [msg, setMsg] = useState(""); const [busy, setBusy] = useState(false); const [err, setErr] = useState("");

  async function save() {
    setBusy(true); setErr(""); setMsg("");
    try {
      await api(`/api/reports/${report.id}`, { method: "PATCH", body: JSON.stringify({ name, spreadsheet: sheet.trim() || null }) });
      setMsg("Tersimpan. Sinkronisasi ke Google Sheet berjalan."); onChanged();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  async function resync() {
    try { await api(`/api/reports/${report.id}/sync`, { method: "POST" }); setMsg("Sinkronisasi ulang dimulai."); setTimeout(onChanged, 4000); } catch (e) { setErr((e as Error).message); }
  }
  async function del() {
    if (!confirm(`Hapus laporan “${report.name}” beserta semua transaksinya? Data di Google Sheet tidak ikut dihapus.`)) return;
    try { await api(`/api/reports/${report.id}`, { method: "DELETE" }); onDeleted(); } catch (e) { setErr((e as Error).message); }
  }

  return (
    <Sheet title="Pengaturan laporan" onClose={onClose}>
      <div className="space-y-4 pb-4">
        <div><label className="mb-1.5 block text-sm font-semibold" htmlFor="rn">Nama laporan</label>
          <input id="rn" className="field" disabled={!owner} value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div><label className="mb-1.5 block text-sm font-semibold" htmlFor="rs">Tautan atau ID Google Sheet</label>
          <input id="rs" className="field" disabled={!owner} placeholder="https://docs.google.com/spreadsheets/d/…" value={sheet} onChange={(e) => setSheet(e.target.value)} />
          <p className="mt-1 text-xs text-muted">Sheet harus milik Anda. Tab “Data Transaksi” dan “Laporan” dibuat otomatis. Sinkronisasi satu arah: ubah data lewat aplikasi, bukan di Sheet.</p></div>
        {report.last_sync_error && <p role="alert" className="rounded-xl bg-out/10 p-3 text-sm text-out">Sinkron terakhir gagal: {report.last_sync_error}</p>}
        {report.last_sync_at && !report.last_sync_error && <p className="text-xs text-muted">Terakhir sinkron {new Date(report.last_sync_at).toLocaleString("id-ID")}</p>}
        {msg && <p role="status" className="text-sm text-brand">{msg}</p>}
        {err && <p role="alert" className="text-sm text-out">{err}</p>}
        {owner && <button className="btn-primary w-full" disabled={busy} onClick={save}>Simpan pengaturan</button>}
        {report.spreadsheet_id && <button className="btn-ghost w-full" onClick={resync}><RefreshCw size={18} />Sinkronkan ulang sekarang</button>}
        {owner && <button className="btn-ghost w-full text-out" onClick={del}>Hapus laporan</button>}
      </div>
    </Sheet>
  );
}
