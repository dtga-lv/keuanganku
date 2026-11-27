"use client";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { api } from "@/lib/api";
import { toLocalInput } from "@/lib/format";
import type { Category, Meta, OcrResult, Tx, TxType } from "@/lib/types";
import OcrUploader from "./OcrUploader";

const TYPES: { key: TxType; label: string }[] = [
  { key: "pengeluaran", label: "Pengeluaran" },
  { key: "pemasukan", label: "Pemasukan" },
  { key: "utang", label: "Utang" },
  { key: "piutang", label: "Piutang" },
];
const DEFAULT_PAY = ["Cash", "Kredit", "Debit", "Transfer", "E-Wallet"];
// Utang (kita berutang) memakai kategori pengeluaran; piutang (orang berutang ke kita) memakai kategori pemasukan.
const kindOf = (t: TxType): Category["kind"] => (t === "pemasukan" || t === "piutang" ? "pemasukan" : "pengeluaran");

interface Props {
  reportId: string; tx?: Tx; meta?: Meta;
  onSaved: () => void; onMetaChange: () => void; onClose: () => void;
}

export default function TransactionForm({ reportId, tx, meta, onSaved, onMetaChange, onClose }: Props) {
  const [type, setType] = useState<TxType>(tx?.type ?? "pengeluaran");        // default: Pengeluaran
  const [amount, setAmount] = useState(tx ? String(Math.round(tx.amount)) : "");
  const [when, setWhen] = useState(toLocalInput(tx ? new Date(tx.occurred_at) : new Date())); // default: sekarang
  const [categoryId, setCategoryId] = useState<string | null>(tx?.category_id ?? null);
  const [pay, setPay] = useState(tx?.payment_method ?? "Cash");                // default: Cash
  const [note, setNote] = useState(tx?.note ?? "");
  const [source, setSource] = useState<"manual" | "ocr">(tx?.source ?? "manual");
  const [newCat, setNewCat] = useState<string | null>(null);
  const [newPay, setNewPay] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const cats = (meta?.categories ?? []).filter((c) => c.kind === kindOf(type));
  const pays = [...DEFAULT_PAY, ...(meta?.paymentMethods ?? []).filter((p) => !DEFAULT_PAY.includes(p))];
  if (!pays.includes(pay)) pays.push(pay);

  function applyOcr(r: OcrResult) {
    setType("pengeluaran"); setSource("ocr");
    if (r.amount) setAmount(String(r.amount));
    const [d0, t0] = when.split("T");
    setWhen(`${r.date ?? d0}T${r.time ?? t0}`);
    if (r.note) setNote(r.note);
  }

  async function addCategory() {
    if (!newCat?.trim()) return;
    try {
      const c = await api<Category>(`/api/reports/${reportId}/categories`, { method: "POST", body: JSON.stringify({ kind: kindOf(type), name: newCat }) });
      setCategoryId(c.id); setNewCat(null); onMetaChange();
    } catch (e) { setError((e as Error).message); }
  }
  async function addPay() {
    if (!newPay?.trim()) return;
    try {
      await api(`/api/reports/${reportId}/categories`, { method: "POST", body: JSON.stringify({ kind: "payment", name: newPay }) });
      setPay(newPay.trim()); setNewPay(null); onMetaChange();
    } catch (e) { setError((e as Error).message); }
  }

  async function save() {
    setError("");
    const n = Number(amount);
    if (!n || n <= 0) return setError("Isi nominal lebih dari 0.");
    setBusy(true);
    try {
      const body = { occurred_at: new Date(when).toISOString(), type, payment_method: pay, category_id: categoryId, amount: n, currency: "IDR", note, source };
      await api(tx ? `/api/transactions/${tx.id}` : `/api/reports/${reportId}/transactions`, { method: tx ? "PATCH" : "POST", body: JSON.stringify(body) });
      onSaved();
    } catch (e) { setError((e as Error).message); setBusy(false); }
  }
  async function remove() {
    if (!tx || !confirm("Hapus transaksi ini? Baris di Google Sheet juga ikut terhapus.")) return;
    setBusy(true);
    try { await api(`/api/transactions/${tx.id}`, { method: "DELETE" }); onSaved(); }
    catch (e) { setError((e as Error).message); setBusy(false); }
  }

  const label = "mb-1.5 block text-sm font-semibold";
  return (
    <div className="space-y-5 pb-4">
      {!tx && <OcrUploader onResult={applyOcr} />}

      <div role="group" aria-label="Jenis transaksi" className="grid grid-cols-4 gap-1 rounded-xl bg-white p-1">
        {TYPES.map((t) => (
          <button key={t.key} type="button" aria-pressed={type === t.key} onClick={() => { setType(t.key); setCategoryId(null); }}
            className={`min-h-11 rounded-lg text-xs font-semibold ${type === t.key ? "bg-brand text-white" : "text-muted"}`}>{t.label}</button>
        ))}
      </div>

      <div>
        <label className={label} htmlFor="nominal">Nominal (IDR)</label>
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold text-muted">Rp</span>
          <input id="nominal" className="field num text-2xl font-bold" inputMode="numeric" placeholder="0"
            value={amount ? new Intl.NumberFormat("id-ID").format(Number(amount)) : ""}
            onChange={(e) => setAmount(e.target.value.replace(/\D/g, "").slice(0, 15))} />
        </div>
      </div>

      <div>
        <label className={label} htmlFor="waktu">Tanggal & jam</label>
        <input id="waktu" type="datetime-local" className="field" value={when} onChange={(e) => setWhen(e.target.value)} />
      </div>

      <div>
        <span className={label}>Kategori</span>
        <div className="flex flex-wrap gap-2">
          {cats.map((c) => <button key={c.id} type="button" className="chip" aria-pressed={categoryId === c.id} onClick={() => setCategoryId(categoryId === c.id ? null : c.id)}>{c.name}</button>)}
          <button type="button" className="chip inline-flex items-center gap-1 text-brand" onClick={() => setNewCat("")}><Plus size={14} />Baru</button>
        </div>
        {newCat !== null && (
          <div className="mt-2 flex gap-2">
            <input className="field" autoFocus placeholder="Nama kategori" value={newCat} onChange={(e) => setNewCat(e.target.value)} />
            <button type="button" className="btn-primary" onClick={addCategory}>Tambah</button>
          </div>
        )}
      </div>

      <div>
        <span className={label}>Cara pembayaran</span>
        <div className="flex flex-wrap gap-2">
          {pays.map((p) => <button key={p} type="button" className="chip" aria-pressed={pay === p} onClick={() => setPay(p)}>{p}</button>)}
          <button type="button" className="chip inline-flex items-center gap-1 text-brand" onClick={() => setNewPay("")}><Plus size={14} />Lainnya</button>
        </div>
        {newPay !== null && (
          <div className="mt-2 flex gap-2">
            <input className="field" autoFocus placeholder="mis. QRIS, Gopay" value={newPay} onChange={(e) => setNewPay(e.target.value)} />
            <button type="button" className="btn-primary" onClick={addPay}>Tambah</button>
          </div>
        )}
      </div>

      <div>
        <label className={label} htmlFor="catatan">Catatan</label>
        <textarea id="catatan" className="field min-h-24" rows={4} placeholder="Keterangan transaksi" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>

      {error && <p role="alert" className="rounded-xl bg-out/10 p-3 text-sm text-out">{error}</p>}

      <div className="flex gap-2">
        {tx && <button type="button" className="btn-ghost text-out" aria-label="Hapus transaksi" disabled={busy} onClick={remove}><Trash2 size={20} /></button>}
        <button type="button" className="btn-primary flex-1" disabled={busy} onClick={save}>
          {busy && <Loader2 className="animate-spin" size={20} />}{tx ? "Simpan perubahan" : "Simpan transaksi"}
        </button>
      </div>
      <button type="button" className="w-full text-sm text-muted" onClick={onClose}>Batal</button>
    </div>
  );
}
