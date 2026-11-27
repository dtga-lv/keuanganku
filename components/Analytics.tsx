"use client";
import { RefreshCw } from "lucide-react";
import { useState } from "react";
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import useSWR from "swr";
import { fetcher } from "@/lib/api";
import { rupiah } from "@/lib/format";
import { PRESETS, presetRange } from "@/lib/range";
import type { Analytics as A, Slice } from "@/lib/types";

const PALETTE = ["#0b6e6e", "#d2551f", "#b7791f", "#4f46e5", "#1f8a4c", "#a23b72", "#2b7bb9", "#7a8b2e", "#8a5a44"];

function Section({ title, color, slices, series, total, max, min }: {
  title: string; color: string; slices: Slice[]; series: { label: string; v: number }[]; total: number; max?: Slice; min?: Slice;
}) {
  if (!slices.length) return (
    <section className="rounded-2xl bg-white p-4"><h3 className="font-bold">{title}</h3><p className="mt-2 text-sm text-muted">Belum ada data pada rentang ini.</p></section>
  );
  return (
    <section className="space-y-3 rounded-2xl bg-white p-4">
      <div><h3 className="font-bold">{title}</h3><p className="num text-2xl font-extrabold" style={{ color }}>{rupiah(total)}</p></div>

      <div className="grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-xl bg-paper p-3"><p className="text-muted">Terbesar</p><p className="font-semibold">{max?.name}</p><p className="num">{max && rupiah(max.total)}</p></div>
        <div className="rounded-xl bg-paper p-3"><p className="text-muted">Terkecil</p><p className="font-semibold">{min?.name ?? "—"}</p><p className="num">{min ? rupiah(min.total) : ""}</p></div>
      </div>

      <div aria-label={`Donut ${title}`}>
        <ResponsiveContainer width="100%" height={210}>
          <PieChart>
            <Pie data={slices} dataKey="total" nameKey="name" innerRadius={58} outerRadius={92} paddingAngle={2} stroke="none">
              {slices.map((s, i) => <Cell key={s.name} fill={PALETTE[i % PALETTE.length]} />)}
            </Pie>
            <Tooltip formatter={(v) => rupiah(Number(v))} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="space-y-1.5 text-sm">
        {slices.map((s, i) => (
          <li key={s.name} className="flex items-center gap-2">
            <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: PALETTE[i % PALETTE.length] }} />
            <span className="flex-1 truncate">{s.name}</span>
            <span className="num text-muted">{Math.round((s.total / total) * 100)}%</span>
            <span className="num w-28 text-right font-semibold">{rupiah(s.total)}</span>
          </li>
        ))}
      </ul>

      <div aria-label={`Bar ${title}`}>
        <ResponsiveContainer width="100%" height={170}>
          <BarChart data={series} margin={{ top: 8, right: 0, left: 0, bottom: 0 }}>
            <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" tickLine={false} />
            <YAxis hide />
            <Tooltip formatter={(v) => rupiah(Number(v))} />
            <Bar dataKey="v" name={title} fill={color} radius={[5, 5, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

export default function Analytics({ reportId, hasSheet }: { reportId: string; hasSheet: boolean }) {
  const [preset, setPreset] = useState<string>("1m");
  const [custom, setCustom] = useState({ from: "", to: "" });
  const range = preset === "custom" ? custom : presetRange(preset);
  const label = PRESETS.find((p) => p.key === preset)?.label ?? "Custom";
  const ready = range.from && range.to && range.from <= range.to;
  // sync=1: setiap grafik ditampilkan/diubah, tab "Laporan" di Google Sheet ikut diperbarui.
  const key = ready ? `/api/reports/${reportId}/analytics?from=${range.from}&to=${range.to}&label=${encodeURIComponent(label)}${hasSheet ? "&sync=1" : ""}` : null;
  const { data, error, isLoading } = useSWR<A>(key, fetcher, { revalidateOnFocus: true });

  return (
    <div className="space-y-4">
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {PRESETS.map((p) => <button key={p.key} className="chip shrink-0" aria-pressed={preset === p.key} onClick={() => setPreset(p.key)}>{p.label}</button>)}
      </div>
      {preset === "custom" && (
        <div className="grid grid-cols-2 gap-2">
          <label className="text-sm font-semibold">Dari<input type="date" className="field mt-1" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} /></label>
          <label className="text-sm font-semibold">Sampai<input type="date" className="field mt-1" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} /></label>
        </div>
      )}
      {!ready && <p className="text-sm text-muted">Pilih tanggal awal dan akhir yang valid.</p>}
      {error && <p role="alert" className="rounded-xl bg-out/10 p-3 text-sm text-out">{(error as Error).message}</p>}
      {isLoading && <p className="py-8 text-center text-muted">Memuat grafik…</p>}
      {data && (
        <>
          {hasSheet && <p className="flex items-center gap-1.5 text-xs text-muted"><RefreshCw size={12} />Grafik di tab “Laporan” Google Sheet diperbarui mengikuti tampilan ini.</p>}
          <Section title="Pengeluaran" color="#d2551f" slices={data.expense} series={data.series.map((s) => ({ label: s.label, v: s.expense }))} total={data.totals.expense} max={data.insight.maxExpense} min={data.insight.minExpense} />
          <Section title="Pemasukan" color="#1f8a4c" slices={data.income} series={data.series.map((s) => ({ label: s.label, v: s.income }))} total={data.totals.income} max={data.insight.maxIncome} min={data.insight.minIncome} />
        </>
      )}
    </div>
  );
}
