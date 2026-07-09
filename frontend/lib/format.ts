/** Naira formatting, consistent everywhere money is shown: thousands
 * separators, always 2 decimal places, never the raw backend string. */
export function formatCurrency(value: string | number | null | undefined): string {
  if (value == null) return "—";
  const n = typeof value === "string" ? Number(value) : value;
  if (Number.isNaN(n)) return "—";
  return `₦${n.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
