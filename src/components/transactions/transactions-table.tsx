import { LocalDate } from "@/components/transactions/local-date";
import { TransactionDeleteForm } from "@/components/transactions/transaction-delete-form";
import { TransactionEditDialog } from "@/components/transactions/transaction-edit-dialog";
import type { UserCardRecord } from "@/features/cards/types";
import type { PaymentMethod, TransactionRecord } from "@/features/transactions/types";

const paymentMethodLabel: Record<PaymentMethod, string> = {
  cash: "현금",
  credit_card: "신용카드",
  check_card: "체크카드",
  points: "포인트",
};

const moneyFormatter = new Intl.NumberFormat("ko-KR");

export function TransactionsTable({
  transactions,
  userCards,
}: {
  transactions: TransactionRecord[];
  userCards: UserCardRecord[];
}) {
  if (transactions.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-white/12 bg-white/4 px-5 py-10 text-sm text-blue-100/70">
        <p className="text-base font-semibold text-white">아직 기록한 지출이 없어요.</p>
        <p className="mt-2 leading-7">
          상단의 지출 추가 버튼으로 오늘 쓴 돈을 기록하면 날짜, 카드, 혜택 금액을 여기에서 확인할 수 있습니다.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-[24px] border border-white/10 bg-slate-950/55 backdrop-blur">
      <div className="min-w-[1280px]">
        <div className="grid grid-cols-[78px_180px_150px_98px_98px_106px_150px_68px_108px_58px_100px] gap-2 border-b border-white/10 px-4 py-3 text-[11px] font-medium uppercase tracking-[0.08em] text-blue-100/58">
          <span>날짜</span>
          <span>사용처</span>
          <span>카드</span>
          <span className="text-right">결제금액</span>
          <span className="text-right">최종지출</span>
          <span className="text-right">혜택</span>
          <span>혜택메모</span>
          <span>실적반영</span>
          <span>카테고리</span>
          <span>고정비</span>
          <span className="text-right">관리</span>
        </div>

        {transactions.map((transaction) => (
          <div
            key={transaction.id}
            className="grid grid-cols-[78px_180px_150px_98px_98px_106px_150px_68px_108px_58px_100px] gap-2 border-b border-white/8 px-4 py-3.5 text-[13px] text-blue-50/86 last:border-b-0"
          >
            <span className="text-blue-100/72">
              <LocalDate value={transaction.occurred_at} />
            </span>
            <div className="min-w-0">
              <p className="truncate font-medium text-white">{transaction.merchant_name}</p>
              <p className="mt-1 truncate text-[11px] text-blue-100/62">
                {paymentMethodLabel[transaction.payment_method]}
              </p>
            </div>
            <div className="min-w-0">
              <p className="truncate text-blue-50/86">
                {transaction.user_cards
                  ? transaction.user_cards.alias || `${transaction.user_cards.card.issuer} ${transaction.user_cards.card.name}`
                  : "-"}
              </p>
            </div>
            <span className="text-right font-medium text-white">
              {moneyFormatter.format(Number(transaction.actual_amount))}원
            </span>
            <span className="text-right font-semibold text-white">
              {moneyFormatter.format(Number(transaction.final_amount))}원
            </span>
            <span className="text-right text-cyan-200">
              {Number(transaction.benefit_amount) > 0
                ? `${moneyFormatter.format(Number(transaction.benefit_amount))}원`
                : "-"}
            </span>
            <div className="min-w-0">
              <p className="truncate text-blue-100/78">{transaction.benefit_label || "-"}</p>
            </div>
            <span>{transaction.is_performance_eligible ? "인정" : "제외"}</span>
            <span className="truncate">{transaction.ledger_category || "-"}</span>
            <span>{transaction.is_fixed_cost ? "고정" : "-"}</span>
            <div className="flex justify-end gap-1.5">
              <TransactionEditDialog transaction={transaction} userCards={userCards} />
              <TransactionDeleteForm transactionId={transaction.id} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
