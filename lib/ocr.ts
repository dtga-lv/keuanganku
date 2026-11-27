import path from "path";
import sharp from "sharp";
import { createWorker, type Worker } from "tesseract.js";
import { rupiah } from "./format";
import type { OcrResult } from "./types";

// Foto struk HANYA diproses di memori (Buffer). Tidak ada penulisan ke disk/DB/storage.
let workerP: Promise<Worker> | null = null;
let chain: Promise<unknown> = Promise.resolve();

function getWorker() {
  workerP ??= createWorker(["ind", "eng"], 1, process.env.TESSDATA_PATH
    ? { langPath: path.resolve(process.env.TESSDATA_PATH), gzip: false }
    : {});
  return workerP;
}

async function viaVision(img: Buffer): Promise<{ text: string; confidence: number }> {
  const res = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${process.env.GOOGLE_VISION_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requests: [{ image: { content: img.toString("base64") }, features: [{ type: "DOCUMENT_TEXT_DETECTION" }], imageContext: { languageHints: ["id", "en"] } }] }),
  });
  const j = await res.json();
  return { text: j?.responses?.[0]?.fullTextAnnotation?.text ?? "", confidence: 90 };
}

export async function readReceiptText(raw: Buffer): Promise<{ text: string; confidence: number }> {
  const img = await sharp(raw).rotate().resize({ width: 1800, withoutEnlargement: true }).grayscale().normalize().sharpen().png().toBuffer();
  if (process.env.OCR_ENGINE === "vision") return viaVision(img);
  const run = chain.then(async () => {
    const w = await getWorker();
    const { data } = await w.recognize(img);
    return { text: data.text, confidence: data.confidence };
  });
  chain = run.catch(() => undefined); // antre: satu worker, satu proses pada satu waktu
  return run;
}

// ---------------------------------------------------------------------------
const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, mei: 5, may: 5, jun: 6, jul: 7, agu: 8, agt: 8, aug: 8, sep: 9, okt: 10, oct: 10, nov: 11, des: 12, dec: 12 };
const p2 = (n: number) => String(n).padStart(2, "0");
const okDate = (y: number, m: number, d: number) => y >= 2000 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31;
const yy = (s: string) => (s.length === 2 ? 2000 + Number(s) : Number(s));

function findDate(lines: string[]): { date: string | null; idx: number } {
  const ymd = /(?<!\d)(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})(?!\d)/;
  const dmy = /(?<!\d)(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4}|\d{2})(?!\d)/;
  const dMon = /(?<!\d)(\d{1,2})\s*[-\/ ]?\s*(jan|feb|mar|apr|mei|may|jun|jul|agu|agt|aug|sep|okt|oct|nov|des|dec)[a-z]*\.?\s*[-\/ ]?\s*(\d{4}|\d{2})(?!\d)/i;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    let m = l.match(ymd);
    if (m && okDate(+m[1], +m[2], +m[3])) return { date: `${m[1]}-${p2(+m[2])}-${p2(+m[3])}`, idx: i };
    m = l.match(dmy); // format Indonesia: hari-bulan-tahun
    if (m && okDate(yy(m[3]), +m[2], +m[1])) return { date: `${yy(m[3])}-${p2(+m[2])}-${p2(+m[1])}`, idx: i };
    m = l.match(dMon);
    if (m && okDate(yy(m[3]), MONTHS[m[2].toLowerCase()], +m[1])) return { date: `${yy(m[3])}-${p2(MONTHS[m[2].toLowerCase()])}-${p2(+m[1])}`, idx: i };
  }
  return { date: null, idx: -1 };
}

function findTime(lines: string[], dateIdx: number): string | null {
  for (const l of lines) {
    const m = l.match(/(?<!\d)([01]?\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?(?!\d)/);
    if (m) return `${p2(+m[1])}:${m[2]}`;
  }
  if (dateIdx >= 0) {
    const m = lines[dateIdx].match(/(?<![\d.])([01]?\d|2[0-3])\.([0-5]\d)(?![\d.])/);
    if (m) return `${p2(+m[1])}:${m[2]}`;
  }
  return null;
}

/** Format angka Indonesia: titik = ribuan, koma = desimal. */
function toNumber(tok: string): number | null {
  let s = tok.replace(/[^\d.,]/g, "");
  if (!s) return null;
  const dot = s.includes("."), comma = s.includes(",");
  if (dot && comma) {
    const dec = s.lastIndexOf(".") > s.lastIndexOf(",") ? "." : ",";
    s = s.split(dec === "." ? "," : ".").join("").replace(dec, ".");
  } else if (dot || comma) {
    const sep = dot ? "." : ",";
    const parts = s.split(sep);
    s = parts.length > 2 || parts[parts.length - 1].length === 3 ? parts.join("") : parts.join(".");
  }
  const n = parseFloat(s);
  return Number.isFinite(n) ? Math.round(n) : null;
}
const numbersIn = (l: string) => (l.match(/\d[\d.,]*\d|\d/g) ?? []).map(toNumber).filter((n): n is number => n !== null);

const STRONG = /(grand\s*total|total\s*(bayar|tagihan|belanja|akhir|pembayaran|rp|idr)|amount\s*due|jumlah\s*(bayar|tagihan)|net\s*total)/i;
const WEAK = /\b(total|jumlah|tagihan)\b/i;
const NOT_TOTAL = /(sub\s*-?\s*total|qty|item|kembali|change)/i;
const NOT_PAID = /(tunai|cash|kembali|change|debit|kartu|card|tel|npwp|nomor|ref)/i;

function findTotal(lines: string[], dateIdx: number): number | null {
  let best: { score: number; idx: number; val: number } | null = null;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const score = STRONG.test(l) && !/kembali|change/i.test(l) ? 3 : WEAK.test(l) && !NOT_TOTAL.test(l) ? 2 : 0;
    if (!score) continue;
    let nums = numbersIn(l);
    if (!nums.length && lines[i + 1]) nums = numbersIn(lines[i + 1]);
    const val = nums.filter((n) => n >= 100).pop();
    if (val == null) continue;
    if (!best || score > best.score || (score === best.score && i >= best.idx)) best = { score, idx: i, val };
  }
  if (best) return best.val;
  let max = 0; // cadangan: angka terbesar yang bukan uang tunai/kembalian
  lines.forEach((l, i) => {
    if (i === dateIdx || NOT_PAID.test(l)) return;
    for (const n of numbersIn(l)) if (n >= 1000 && n < 1e9 && n > max) max = n;
  });
  return max || null;
}

const SKIP = /(total|tunai|cash|kembali|change|ppn|pajak|tax|diskon|disc|kasir|cashier|struk|invoice|no\.|npwp|telp|alamat|terima kasih|thank|www\.|\.com|member|poin|point|debit|kredit|kartu|card|qris|ovo|gopay|dana|shopee)/i;

export function parseReceipt(text: string): Omit<OcrResult, "confidence"> {
  const lines = text.split(/\r?\n/).map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
  const { date, idx } = findDate(lines);
  const time = findTime(lines, idx);
  const amount = findTotal(lines, idx);

  const merchant = lines.slice(0, 6).find((l) => /[A-Za-z]{3,}/.test(l) && !/\d{4,}/.test(l) && !SKIP.test(l))?.slice(0, 40) ?? null;
  const items: string[] = [];
  lines.forEach((l, i) => {
    if (i === idx || SKIP.test(l)) return;
    const m = l.match(/^(.*?[A-Za-z]{2,}.*?)\s+(\d{1,3}(?:[.,]\d{3})+|\d{4,})\s*[A-Za-z]?$/);
    const price = m ? toNumber(m[2]) : null;
    if (m && price) items.push(`- ${m[1].trim()} (${rupiah(price)})`);
  });
  const note = [merchant ? `Struk: ${merchant}` : "", items.length ? "Barang:" : "", ...items].filter(Boolean).join("\n");
  return { date, time, amount, note, merchant };
}
