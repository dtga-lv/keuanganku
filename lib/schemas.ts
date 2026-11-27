import { z } from "zod";

export const txSchema = z.object({
  occurred_at: z.string().datetime({ offset: true }),
  type: z.enum(["pengeluaran", "pemasukan", "utang", "piutang"]).default("pengeluaran"),
  payment_method: z.string().trim().min(1).max(30).default("Cash"),
  category_id: z.string().uuid().nullable().default(null),
  amount: z.number().positive().max(1e15),
  currency: z.string().length(3).default("IDR"),
  note: z.string().max(4000).default(""),
  source: z.enum(["manual", "ocr"]).default("manual"),
});
export type TxInput = z.infer<typeof txSchema>;
