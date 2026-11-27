import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { HttpError, route } from "@/lib/http";
import { parseReceipt, readReceiptText } from "@/lib/ocr";

export const runtime = "nodejs";
export const maxDuration = 60;

export const POST = route(async (req: NextRequest) => {
  await requireUser();
  const form = await req.formData();
  const file = form.get("image");
  if (!(file instanceof File)) throw new HttpError(400, "Foto struk tidak ditemukan");
  if (!file.type.startsWith("image/")) throw new HttpError(400, "File harus berupa gambar");
  if (file.size > 8 * 1024 * 1024) throw new HttpError(413, "Ukuran foto maksimal 8 MB");

  // Hanya di memori: tidak disimpan ke disk, database, maupun storage.
  const { text, confidence } = await readReceiptText(Buffer.from(await file.arrayBuffer()));
  if (!text.trim()) throw new HttpError(422, "Teks pada struk tidak terbaca. Coba foto lebih terang dan lurus.");
  return NextResponse.json({ ...parseReceipt(text), confidence: Math.round(confidence) });
});
