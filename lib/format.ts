export const rupiah = (n: number) => "Rp" + new Intl.NumberFormat("id-ID").format(Math.round(n));

const p2 = (n: number) => String(n).padStart(2, "0");

/** Nilai untuk <input type="datetime-local"> dari Date lokal. */
export const toLocalInput = (d: Date) =>
  `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}`;

export const tanggalPanjang = (iso: string) =>
  new Date(iso).toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

export const jam = (iso: string) =>
  new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", hour12: false }).replace(".", ":");
