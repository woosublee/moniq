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
      <div className="rounded-2xl border border-dashed border-white/12 bg-white/4 px-5 py-10 text-sm text-blue-100/65">
        아직 저장된 거래가 없습니다. 우측 상단의 거래 추가 버튼으로 첫 거래를 입력해 보세요.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-[24px] border border-white/10 bg-slate-950/55 backdrop-blur">
      <div className="min-w-[1620px]">
        <div className="grid grid-cols-[92px_220px_180px_112px_112px_128px_180px_86px_130px_78px_112px] gap-3 border-b border-white/10 px-4 py-3 text-[11px] font-medium uppercase tracking-[0.08em] text-blue-100/58">
          <span>날짜</span>
          <span>사용처</span>
          <span>카드</span>
          <span className="text-right">실사용</span>
          <span className="text-right">최종금액</span>
          <span className="text-right">혜택금액</span>
          <span>혜택</span>
          <span>실적</span>
          <span>카테고리</span>
          <span>고정비</span>
          <span className="text-right">관리</span>
        </div>

        {transactions.map((transaction) => (
          <div
            key={transaction.id}
            className="grid grid-cols-[92px_220px_180px_112px_112px_128px_180px_86px_130px_78px_112px] gap-3 border-b border-white/8 px-4 py-3.5 text-[13px] text-blue-50/86 last:border-b-0"
          >
            <span className="text-blue-100/72">
              {new Date(transaction.occurred_at).toLocaleDateString("ko-KR", {
                month: "2-digit",
                day: "2-digit",
              })}
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
              {moneyFormatter.format(Number(transaction.benefit_amount))}원
            </span>
            <div className="min-w-0">
              <p className="truncate text-blue-100/78">{transaction.benefit_label || "-"}</p>
            </div>
            <span>{transaction.is_performance_eligible ? "인정" : "제외"}</span>
            <span className="truncate">{transaction.ledger_category || "-"}</span>
            <span>{transaction.is_fixed_cost ? "Y" : "-"}</span>
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
