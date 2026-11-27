"use client";
import { ChevronLeft, ExternalLink, Settings, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useState } from "react";
import useSWR from "swr";
import Analytics from "@/components/Analytics";
import BottomNav, { type Tab } from "@/components/BottomNav";
import CollabModal from "@/components/CollabModal";
import SettingsSheet from "@/components/SettingsSheet";
import Sheet from "@/components/Sheet";
import TransactionForm from "@/components/TransactionForm";
import TransactionList from "@/components/TransactionList";
import { fetcher } from "@/lib/api";
import type { Meta, ReportSummary, Tx } from "@/lib/types";

export default function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("transaksi");
  const [form, setForm] = useState<{ tx?: Tx } | null>(null);
  const [collab, setCollab] = useState(false);
  const [settings, setSettings] = useState(false);

  const { data: report, error, mutate: mutateReport } = useSWR<ReportSummary>(`/api/reports/${id}`, fetcher);
  // Polling 5 dtk + revalidasi saat fokus: perubahan kolaborator muncul hampir real-time.
  const { data: txs, mutate: mutateTx } = useSWR<Tx[]>(`/api/reports/${id}/transactions`, fetcher, { refreshInterval: 5000 });
  const { data: meta, mutate: mutateMeta } = useSWR<Meta>(`/api/reports/${id}/categories`, fetcher);

  if (error) return (
    <main className="mx-auto max-w-md p-6 text-center">
      <p className="font-semibold">{(error as Error).message}</p>
      <Link href="/" className="btn-primary mt-4">Kembali</Link>
    </main>
  );

  return (
    <div className="mx-auto min-h-dvh max-w-md px-4 pb-32">
      <header className="sticky top-0 z-20 -mx-4 flex items-center gap-2 bg-paper/95 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur">
        <Link href="/" aria-label="Kembali" className="grid h-11 w-11 place-items-center rounded-full bg-white"><ChevronLeft size={22} /></Link>
        <h1 className="min-w-0 flex-1 truncate text-xl font-extrabold">{report?.name ?? "…"}</h1>
        {report?.spreadsheet_id && (
          <a aria-label="Buka Google Sheet" target="_blank" rel="noreferrer" href={`https://docs.google.com/spreadsheets/d/${report.spreadsheet_id}`} className="grid h-11 w-11 place-items-center rounded-full bg-white text-brand"><ExternalLink size={20} /></a>
        )}
        <button aria-label="Pengaturan" className="grid h-11 w-11 place-items-center rounded-full bg-white" onClick={() => setSettings(true)}><Settings size={20} /></button>
      </header>

      {report?.last_sync_error && (
        <button onClick={() => setSettings(true)} className="mb-3 flex w-full items-start gap-2 rounded-xl bg-warn/10 p-3 text-left text-sm text-warn">
          <TriangleAlert size={18} className="mt-0.5 shrink-0" />Sinkronisasi ke Google Sheet gagal. Ketuk untuk melihat detail.
        </button>
      )}

      <main>
        {tab === "transaksi"
          ? <TransactionList txs={txs} onEdit={(tx) => setForm({ tx })} />
          : <Analytics reportId={id} hasSheet={!!report?.spreadsheet_id} />}
      </main>

      <BottomNav tab={tab} onTab={setTab} onAdd={() => setForm({})} onCollab={() => setCollab(true)} />

      {form && (
        <Sheet title={form.tx ? "Ubah transaksi" : "Transaksi baru"} onClose={() => setForm(null)}>
          <TransactionForm reportId={id} tx={form.tx} meta={meta}
            onMetaChange={() => mutateMeta()} onClose={() => setForm(null)}
            onSaved={() => { setForm(null); mutateTx(); mutateReport(); }} />
        </Sheet>
      )}
      {collab && <CollabModal reportId={id} onClose={() => setCollab(false)} onLeft={() => router.replace("/")} />}
      {settings && report && <SettingsSheet report={report} onClose={() => setSettings(false)} onChanged={() => mutateReport()} onDeleted={() => router.replace("/")} />}
    </div>
  );
}
