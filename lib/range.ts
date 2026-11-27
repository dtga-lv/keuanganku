export const PRESETS = [
  { key: "7d", label: "1 Minggu" },
  { key: "1m", label: "1 Bulan" },
  { key: "3m", label: "3 Bulan" },
  { key: "6m", label: "6 Bulan" },
  { key: "1y", label: "1 Tahun" },
  { key: "custom", label: "Custom" },
] as const;

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Rentang "N terakhir" sampai hari ini (tanggal lokal perangkat). */
export function presetRange(key: string): { from: string; to: string } {
  const end = new Date();
  const start = new Date();
  if (key === "7d") start.setDate(end.getDate() - 6);
  else if (key === "1m") start.setMonth(end.getMonth() - 1);
  else if (key === "3m") start.setMonth(end.getMonth() - 3);
  else if (key === "6m") start.setMonth(end.getMonth() - 6);
  else if (key === "1y") start.setFullYear(end.getFullYear() - 1);
  return { from: iso(start), to: iso(end) };
}
