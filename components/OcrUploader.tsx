"use client";
import { Camera, Loader2, ShieldCheck } from "lucide-react";
import { useRef, useState } from "react";
import type { OcrResult } from "@/lib/types";

/** Perkecil foto di perangkat sebelum diunggah (hemat kuota, OCR lebih cepat). */
async function shrink(file: File, max = 1800): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
    return await new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej()), "image/jpeg", 0.88));
  } catch { return file; }
}

export default function OcrUploader({ onResult }: { onResult: (r: OcrResult) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function pick(file?: File) {
    if (!file) return;
    setBusy(true); setMsg(null);
    try {
      const fd = new FormData();
      fd.append("image", await shrink(file), "struk.jpg");
      const res = await fetch("/api/ocr", { method: "POST", body: fd });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Gagal membaca struk");
      onResult(j as OcrResult);
      setMsg({ ok: true, text: "Struk terbaca. Periksa tanggal, jam, dan nominal sebelum menyimpan." });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="rounded-2xl border border-dashed border-brand/50 bg-brand-soft/60 p-3">
      <input ref={input} type="file" accept="image/*" capture="environment" hidden onChange={(e) => pick(e.target.files?.[0])} />
      <button type="button" className="btn-primary w-full" disabled={busy} onClick={() => input.current?.click()}>
        {busy ? <Loader2 className="animate-spin" size={20} /> : <Camera size={20} />}
        {busy ? "Membaca struk…" : "Scan foto struk"}
      </button>
      <p className="mt-2 flex items-center gap-1.5 text-xs text-muted"><ShieldCheck size={14} />Foto hanya diproses sesaat dan tidak disimpan.</p>
      {msg && <p role="status" className={`mt-2 text-sm ${msg.ok ? "text-brand" : "text-out"}`}>{msg.text}</p>}
    </div>
  );
}
