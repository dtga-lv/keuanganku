import { Wallet } from "lucide-react";
import GoogleButton from "@/components/GoogleButton";

export default async function Login({ searchParams }: { searchParams: Promise<{ callbackUrl?: string }> }) {
  const { callbackUrl } = await searchParams;
  const safe = callbackUrl && callbackUrl.startsWith("/") ? callbackUrl : "/";
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-8 px-6 pb-[env(safe-area-inset-bottom)]">
      <div className="grid h-16 w-16 place-items-center rounded-2xl bg-brand text-white"><Wallet size={32} /></div>
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">KeuanganKu</h1>
        <p className="mt-2 text-muted">Catat pemasukan dan pengeluaran, scan struk, dan simpan otomatis ke Google Sheet Anda. Bisa dikelola bersama keluarga atau tim.</p>
      </div>
      <div className="space-y-3">
        <GoogleButton callbackUrl={safe} />
        <p className="text-sm text-muted">Aplikasi meminta izin Google Sheets agar bisa menulis transaksi ke Sheet yang Anda tautkan. Foto struk tidak pernah disimpan.</p>
      </div>
    </main>
  );
}
