import { z } from "zod";

import type {
  PaymentMethod,
  TransactionInput,
} from "@/features/transactions/types";

const paymentMethodSchema = z.enum([
  "cash",
  "credit_card",
  "check_card",
  "points",
]);

const parseBoolean = (value: FormDataEntryValue | null) => value === "on";

export const transactionInputSchema = z
  .object({
    occurredAt: z
      .string()
      .min(1, "거래 일시를 입력해 주세요."),
    timezoneOffset: z
      .number("타임존 정보를 숫자로 입력해 주세요.")
      .finite("타임존 정보가 올바르지 않습니다."),
    merchantName: z
      .string()
      .trim()
      .min(1, "사용처를 입력해 주세요.")
      .max(80, "사용처는 80자 이하로 입력해 주세요."),
    amount: z
      .number("금액을 숫자로 입력해 주세요.")
      .finite("금액 형식이 올바르지 않습니다.")
      .positive("금액은 0보다 커야 합니다."),
    actualAmount: z
      .number("결제 금액을 숫자로 입력해 주세요.")
      .finite("결제 금액 형식이 올바르지 않습니다.")
      .positive("결제 금액은 0보다 커야 합니다."),
    benefitLabel: z.string().trim().max(120, "혜택 메모는 120자 이하로 입력해 주세요."),
    benefitAmount: z
      .number("할인/적립 금액을 숫자로 입력해 주세요.")
      .finite("할인/적립 금액 형식이 올바르지 않습니다.")
      .min(0, "할인/적립 금액은 0 이상이어야 합니다."),
    finalAmount: z
      .number("최종 지출을 숫자로 입력해 주세요.")
      .finite("최종 지출 형식이 올바르지 않습니다.")
      .min(0, "최종 지출은 0 이상이어야 합니다."),
    paymentMethod: paymentMethodSchema,
    userCardId: z.string().uuid().nullable(),
    isPerformanceEligible: z.boolean(),
    ledgerCategory: z.string().trim().max(80, "카테고리는 80자 이하로 입력해 주세요."),
    isFixedCost: z.boolean(),
    memo: z.string().trim().max(300, "메모는 300자 이하로 입력해 주세요."),
  })
  .superRefine((value, ctx) => {
    const isCardPayment =
      value.paymentMethod === "credit_card" ||
      value.paymentMethod === "check_card";

    if (isCardPayment && !value.userCardId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "카드 결제는 등록한 내 카드를 선택해 주세요.",
        path: ["userCardId"],
      });
    }
  });

export const parseTransactionInput = (raw: {
  occurredAt: FormDataEntryValue | null;
  timezoneOffset: FormDataEntryValue | null;
  merchantName: FormDataEntryValue | null;
  amount: FormDataEntryValue | null;
  actualAmount: FormDataEntryValue | null;
  benefitLabel: FormDataEntryValue | null;
  benefitAmount: FormDataEntryValue | null;
  finalAmount: FormDataEntryValue | null;
  paymentMethod: FormDataEntryValue | null;
  userCardId: FormDataEntryValue | null;
  isPerformanceEligible: FormDataEntryValue | null;
  ledgerCategory: FormDataEntryValue | null;
  isFixedCost: FormDataEntryValue | null;
  memo: FormDataEntryValue | null;
}) => {
  const timezoneOffset = raw.timezoneOffset ? Number(raw.timezoneOffset) : 0;
  const amount = raw.amount ? Number(raw.amount) : Number.NaN;
  const actualAmount = raw.actualAmount ? Number(raw.actualAmount) : amount;
  const benefitAmount = raw.benefitAmount ? Number(raw.benefitAmount) : 0;
  const finalAmount = raw.finalAmount ? Number(raw.finalAmount) : amount;

  const input = {
    occurredAt: String(raw.occurredAt ?? ""),
    timezoneOffset,
    merchantName: String(raw.merchantName ?? ""),
    amount,
    actualAmount,
    benefitLabel: String(raw.benefitLabel ?? "").trim(),
    benefitAmount,
    finalAmount,
    paymentMethod: raw.paymentMethod as PaymentMethod,
    userCardId: String(raw.userCardId ?? "").trim() || null,
    isPerformanceEligible: parseBoolean(raw.isPerformanceEligible),
    ledgerCategory: String(raw.ledgerCategory ?? "").trim(),
    isFixedCost: parseBoolean(raw.isFixedCost),
    memo: String(raw.memo ?? "").trim(),
  } satisfies TransactionInput;

  return transactionInputSchema.safeParse(input);
};
