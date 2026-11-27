import { q, TZ } from "./db";
import type { Analytics, Slice } from "./types";

const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const p2 = (n: number) => String(n).padStart(2, "0");
const key = (d: Date) => `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}`;
const parse = (s: string) => new Date(`${s}T00:00:00Z`);

function startOf(unit: "day" | "week" | "month", d: Date): Date {
  const x = new Date(d);
  if (unit === "week") x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7)); // Senin (sama dgn date_trunc('week'))
  if (unit === "month") x.setUTCDate(1);
  return x;
}
function next(unit: "day" | "week" | "month", d: Date): Date {
  const x = new Date(d);
  if (unit === "day") x.setUTCDate(x.getUTCDate() + 1);
  else if (unit === "week") x.setUTCDate(x.getUTCDate() + 7);
  else x.setUTCMonth(x.getUTCMonth() + 1, 1);
  return x;
}
const label = (unit: "day" | "week" | "month", d: Date) =>
  unit === "month"
    ? `${BULAN[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(2)}`
    : `${p2(d.getUTCDate())} ${BULAN[d.getUTCMonth()]}`;

/** from/to: 'YYYY-MM-DD' (inklusif, zona waktu APP_TZ). Hanya pemasukan & pengeluaran yang digrafikkan. */
export async function computeAnalytics(reportId: string, from: string, to: string): Promise<Analytics> {
  const days = Math.max(1, Math.round((parse(to).getTime() - parse(from).getTime()) / 86400000) + 1);
  const unit: "day" | "week" | "month" = days <= 31 ? "day" : days <= 125 ? "week" : "month";

  const cats = await q<{ type: string; name: string; total: number }>(
    `select t.type::text, coalesce(c.name, 'Tanpa Kategori') as name, sum(t.amount)::float8 as total
       from transactions t left join categories c on c.id = t.category_id
      where t.report_id = $1 and t.type in ('pemasukan','pengeluaran')
        and (t.occurred_at at time zone $4)::date between $2::date and $3::date
      group by 1, 2 order by total desc`,
    [reportId, from, to, TZ]
  );
  const buckets = await q<{ b: string; type: string; total: number }>(
    `select to_char(date_trunc('${unit}', t.occurred_at at time zone $4), 'YYYY-MM-DD') as b,
            t.type::text, sum(t.amount)::float8 as total
       from transactions t
      where t.report_id = $1 and t.type in ('pemasukan','pengeluaran')
        and (t.occurred_at at time zone $4)::date between $2::date and $3::date
      group by 1, 2`,
    [reportId, from, to, TZ]
  );

  const expense: Slice[] = cats.filter((c) => c.type === "pengeluaran").map(({ name, total }) => ({ name, total }));
  const income: Slice[] = cats.filter((c) => c.type === "pemasukan").map(({ name, total }) => ({ name, total }));

  const map = new Map<string, { expense: number; income: number }>();
  for (const r of buckets) {
    const e = map.get(r.b) ?? { expense: 0, income: 0 };
    if (r.type === "pengeluaran") e.expense = r.total; else e.income = r.total;
    map.set(r.b, e);
  }
  const series: Analytics["series"] = [];
  for (let d = startOf(unit, parse(from)); key(d) <= to; d = next(unit, d)) {
    const v = map.get(key(d)) ?? { expense: 0, income: 0 };
    series.push({ label: label(unit, d), ...v });
  }

  const sum = (a: Slice[]) => a.reduce((s, x) => s + x.total, 0);
  return {
    from, to, unit, expense, income, series,
    totals: { expense: sum(expense), income: sum(income) },
    insight: {
      maxExpense: expense[0], minExpense: expense.length > 1 ? expense[expense.length - 1] : undefined,
      maxIncome: income[0], minIncome: income.length > 1 ? income[income.length - 1] : undefined,
    },
  };
}
