import { parseSeoulInstant } from "@/features/card-benefits/periods";

/** Stable SSR/client display; never rewrite the original timestamp. */
export function LocalDate({ value, format = "date" }: { value: string; format?: "date" | "datetime" }) {
  const valid = parseSeoulInstant(value);
  const formatted = !valid ? "일시 확인 필요" : format === "datetime"
    ? new Date(value).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })
    : new Date(value).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit" });
  return <time dateTime={value}>{formatted}</time>;
}
