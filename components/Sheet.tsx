"use client";
import { X } from "lucide-react";
import { useEffect } from "react";

/** Bottom sheet khusus HP. */
export default function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", esc); };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}
        className="max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-paper pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between bg-paper px-5 pb-2 pt-4">
          <h2 className="text-lg font-bold">{title}</h2>
          <button aria-label="Tutup" onClick={onClose} className="grid h-10 w-10 place-items-center rounded-full bg-white"><X size={20} /></button>
        </div>
        <div className="px-5 pb-2">{children}</div>
      </div>
    </div>
  );
}
