"use client";
import { MailCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useState } from "react";
import useSWR from "swr";
import { api, fetcher } from "@/lib/api";

interface Preview { reportName: string; inviter?: string | null; alreadyMember: boolean; reportId?: string }

export default function Undangan({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const router = useRouter();
  const { data, error } = useSWR<Preview>(`/api/invites/${token}`, fetcher, { shouldRetryOnError: false });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");

  async function accept() {
    setBusy(true); setErr("");
    try { const r = await api<{ reportId: string }>(`/api/invites/${token}`, { method: "POST" }); router.replace(`/laporan/${r.reportId}`); }
    catch (e) { setErr((e as Error).message); setBusy(false); }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-6">
      {!data && !error && <p className="text-center text-muted">Memeriksa undangan…</p>}
      {error && (<><p role="alert" className="rounded-xl bg-out/10 p-4 text-out">{(error as Error).message}</p><Link href="/" className="btn-ghost">Ke beranda</Link></>)}
      {data?.alreadyMember && (<><p className="text-center font-semibold">Anda sudah menjadi anggota “{data.reportName}”.</p><Link href={`/laporan/${data.reportId}`} className="btn-primary">Buka laporan</Link></>)}
      {data && !data.alreadyMember && (
        <>
          <div className="grid h-16 w-16 place-items-center rounded-2xl bg-brand-soft text-brand"><MailCheck size={32} /></div>
          <div>
            <h1 className="text-2xl font-extrabold">Gabung ke “{data.reportName}”?</h1>
            <p className="mt-2 text-muted">{data.inviter ?? "Pemilik laporan"} mengundang Anda. Setelah bergabung, Anda dapat menambah, mengubah, dan menghapus transaksi di laporan ini. Laporan Anda yang lain tidak terpengaruh.</p>
          </div>
          {err && <p role="alert" className="rounded-xl bg-out/10 p-3 text-sm text-out">{err}</p>}
          <div className="space-y-2">
            <button className="btn-primary w-full" disabled={busy} onClick={accept}>Terima undangan</button>
            <Link href="/" className="btn-ghost w-full">Tolak</Link>
          </div>
        </>
      )}
    </main>
  );
}
