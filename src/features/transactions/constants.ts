import type { PaymentMethod, TransactionFormState } from "@/features/transactions/types";

export const paymentMethodOptions: Array<{
  value: PaymentMethod;
  label: string;
  description: string;
}> = [
  {
    value: "credit_card",
    label: "신용카드",
    description: "청구할인, 적립, 전월 실적 계산 대상",
  },
  {
    value: "check_card",
    label: "체크카드",
    description: "체크카드 혜택과 실적 규칙 대상",
  },
  {
    value: "cash",
    label: "현금",
    description: "혜택 계산 없이 지출 기록만 저장",
  },
  {
    value: "points",
    label: "포인트",
    description: "포인트 사용 내역 기록",
  },
];

export const initialTransactionFormState: TransactionFormState = {
  status: "idle",
  message: "",
};
