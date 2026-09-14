export const formText = (data: FormData, key: string) => String(data.get(key) ?? "");

/** Inspect the original digits before Number can erase fractions or unsafe precision. */
export function integerInput(raw: string, allowZero = false): number {
  if (!/^[0-9]+$/.test(raw)) throw new Error("금액은 정수 단위로 입력해 주세요.");
  const exact = BigInt(raw);
  if (exact < BigInt(allowZero ? 0 : 1) || exact > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error(allowZero ? "0 이상 안전한 정수 금액을 입력해 주세요." : "양의 안전한 정수 금액을 입력해 주세요.");
  return Number(exact);
}
export function formInstant(data: FormData): string {
  const raw = formText(data, "occurredAt");
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(raw);
  const time = formText(data, "occurredTime");
  const local = dateOnly ? `${raw}T${time || "00:00"}` : raw;
  const offset = dateOnly ? -540 : Number(formText(data, "timezoneOffset") || "0");
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?$/.test(local) || !Number.isInteger(offset) || Math.abs(offset) > 840) throw new Error("사용 일시를 확인해 주세요.");
  const parsed = new Date(`${local}Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 16) !== local.slice(0, 16) || local.startsWith("0000")) throw new Error("존재하는 사용 날짜와 시각을 입력해 주세요.");
  return new Date(parsed.getTime() + offset * 60000).toISOString();
}
export function installmentInput(data: FormData): number | null {
  const raw = formText(data, "installmentMonths");
  if (!raw) return null;
  const months = integerInput(raw);
  if (months > 60) throw new Error("할부는 1(일시불)~60개월로 입력해 주세요.");
  return months;
}
