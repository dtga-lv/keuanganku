"use client";
import { ReceiptText } from "lucide-react";
import { useMemo, useState } from "react";
import { jam, rupiah, tanggalPanjang } from "@/lib/format";
import type { Tx, TxType } from "@/lib/types";

const LABEL: Record<TxType, string> = { pengeluaran: "Pengeluaran", pemasukan: "Pemasukan", utang: "Utang", piutang: "Piutang" };
const COLOR: Record<TxType, string> = { pengeluaran: "text-out", pemasukan: "text-in", utang: "text-warn", piutang: "text-piutang" };

export default function TransactionList({ txs, onEdit }: { txs?: Tx[]; onEdit: (t: Tx) => void }) {
  const [filter, setFilter] = useState<TxType | "semua">("semua");

  const month = useMemo(() => {
    const now = new Date(); let inc = 0, exp = 0;
    for (const t of txs ?? []) {
      const d = new Date(t.occurred_at);
      if (d.getMonth() !== now.getMonth() || d.getFullYear() !== now.getFullYear()) continue;
      if (t.type === "pemasukan") inc += t.amount; else if (t.type === "pengeluaran") exp += t.amount;
    }
    return { inc, exp };
  }, [txs]);

  const groups = useMemo(() => {
    const g = new Map<string, Tx[]>();
    for (const t of (txs ?? []).filter((x) => filter === "semua" || x.type === filter)) {
      const k = tanggalPanjang(t.occurred_at);
      g.set(k, [...(g.get(k) ?? []), t]);
    }
    return [...g.entries()];
  }, [txs, filter]);

  if (!txs) return <p className="py-10 text-center text-muted">Memuat transaksi…</p>;

  return (
    <div className="space-y-4">
      <section aria-label="Ringkasan bulan ini" className="rounded-2xl bg-ink p-4 text-white">
        <p className="text-sm text-white/70">Selisih bulan ini</p>
        <p className="num text-3xl font-extrabold">{rupiah(month.inc - month.exp)}</p>
        <div className="mt-3 flex gap-6 text-sm">
          <div><p className="text-white/70">Pemasukan</p><p className="num font-semibold text-[#7be0a4]">{rupiah(month.inc)}</p></div>
          <div><p className="text-white/70">Pengeluaran</p><p className="num font-semibold text-[#ffb08a]">{rupiah(month.exp)}</p></div>
        </div>
      </section>

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {(["semua", "pengeluaran", "pemasukan", "utang", "piutang"] as const).map((f) => (
          <button key={f} className="chip shrink-0" aria-pressed={filter === f} onClick={() => setFilter(f)}>{f === "semua" ? "Semua" : LABEL[f]}</button>
        ))}
      </div>

      {groups.length === 0 && (
        <div className="py-12 text-center text-muted">
          <ReceiptText className="mx-auto mb-3" size={36} />
          <p className="font-semibold text-ink">Belum ada transaksi</p>
          <p className="text-sm">Ketuk tombol + untuk mencatat atau scan struk.</p>
        </div>
      )}

      {groups.map(([day, items]) => (
        <section key={day}>
          <h3 className="mb-2 text-sm font-semibold text-muted">{day}</h3>
          <ul className="divide-y divide-line overflow-hidden rounded-2xl bg-white">
            {items.map((t) => (
              <li key={t.id}>
                <button className="flex w-full items-start gap-3 px-4 py-3 text-left active:bg-paper" onClick={() => onEdit(t)}>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{t.category_name ?? LABEL[t.type]}</p>
                    <p className="truncate text-sm text-muted">{t.note.split("\n")[0] || t.payment_method}</p>
                    <p className="mt-0.5 text-xs text-muted">{jam(t.occurred_at)} · {t.payment_method}{t.created_by_name ? ` · ${t.created_by_name}` : ""}</p>
                  </div>
                  <div className="text-right">
                    <p className={`num font-bold ${COLOR[t.type]}`}>{t.type === "pemasukan" ? "+" : t.type === "pengeluaran" ? "−" : ""}{rupiah(t.amount)}</p>
                    {(t.type === "utang" || t.type === "piutang") && <p className={`text-xs ${COLOR[t.type]}`}>{LABEL[t.type]}</p>}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
