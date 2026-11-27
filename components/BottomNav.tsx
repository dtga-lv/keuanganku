"use client";
import { List, PieChart, Plus, Users } from "lucide-react";

export type Tab = "transaksi" | "grafik";

export default function BottomNav({ tab, onTab, onAdd, onCollab }: { tab: Tab; onTab: (t: Tab) => void; onAdd: () => void; onCollab: () => void }) {
  const item = (on: boolean) => `flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-xs ${on ? "font-semibold text-brand" : "text-muted"}`;
  return (
    <nav aria-label="Navigasi utama" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <div className="mx-auto flex max-w-md items-center px-2">
        <button className={item(tab === "transaksi")} onClick={() => onTab("transaksi")}><List size={22} />Transaksi</button>
        <button className={item(tab === "grafik")} onClick={() => onTab("grafik")}><PieChart size={22} />Grafik</button>
        <div className="flex flex-1 justify-center">
          <button aria-label="Tambah transaksi" onClick={onAdd} className="-mt-6 grid h-14 w-14 place-items-center rounded-full bg-brand text-white shadow-lg active:scale-95"><Plus size={28} /></button>
        </div>
        <button className={item(false)} onClick={onCollab}><Users size={22} />Kolaborasi</button>
      </div>
    </nav>
  );
}
