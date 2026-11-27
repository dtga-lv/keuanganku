export type TxType = "pengeluaran" | "pemasukan" | "utang" | "piutang";
export type Role = "owner" | "editor";

export interface Tx {
  id: string;
  occurred_at: string;
  type: TxType;
  payment_method: string;
  category_id: string | null;
  category_name: string | null;
  amount: number;
  currency: string;
  note: string;
  source: "manual" | "ocr";
  created_by_name: string | null;
}
export interface Category { id: string; kind: "pengeluaran" | "pemasukan"; name: string }
export interface Meta { categories: Category[]; paymentMethods: string[] }
export interface ReportSummary {
  id: string; name: string; role: Role; spreadsheet_id: string | null;
  last_sync_at: string | null; last_sync_error: string | null; member_count?: number;
}
export interface Slice { name: string; total: number }
export interface Analytics {
  from: string; to: string; unit: "day" | "week" | "month";
  expense: Slice[]; income: Slice[];
  series: { label: string; expense: number; income: number }[];
  totals: { expense: number; income: number };
  insight: { maxExpense?: Slice; minExpense?: Slice; maxIncome?: Slice; minIncome?: Slice };
}
export interface OcrResult {
  date: string | null; time: string | null; amount: number | null;
  note: string; merchant: string | null; confidence: number;
}
