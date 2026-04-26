import type { PaymentMethod, TransactionRecord } from "@/features/transactions/types";

const paymentMethodLabel: Record<PaymentMethod, string> = {
  cash: "현금",
  credit_card: "신용카드",
  check_card: "체크카드",
  points: "포인트",
};

const moneyFormatter = new Intl.NumberFormat("ko-KR");

export function RecentTransactions({
  transactions,
}: {
  transactions: TransactionRecord[];
}) {
  return (
    <section className="rounded-[28px] border border-white/10 bg-slate-950/55 p-7 backdrop-blur">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-lg font-semibold text-white">최근 거래</p>
          <p className="mt-2 text-sm leading-7 text-blue-100/72">
            저장된 거래가 바로 보이면 입력 흐름을 확인하기 쉽습니다.
          </p>
        </div>
        <span className="rounded-full border border-white/12 bg-white/6 px-3 py-1 text-xs font-medium text-blue-50/82">
          최근 {transactions.length}건
        </span>
      </div>

      {transactions.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-white/12 bg-white/4 px-5 py-8 text-sm text-blue-100/65">
          아직 저장된 거래가 없습니다. 위 폼에서 첫 거래를 입력해 보세요.
        </div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-2xl border border-white/10 bg-white/5">
          {transactions.map((transaction, index) => (
            <article
              key={transaction.id}
              className={`grid gap-3 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center ${
                index === transactions.length - 1 ? "" : "border-b border-white/8"
              }`}
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-base font-semibold text-white">
                    {transaction.merchant_name}
                  </p>
                  <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2.5 py-1 text-xs font-medium text-cyan-200">
                    {paymentMethodLabel[transaction.payment_method]}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-blue-100/68">
                  <span>{new Date(transaction.occurred_at).toLocaleString("ko-KR")}</span>
                  {transaction.user_cards ? (
                    <span>
                      {transaction.user_cards.alias || `${transaction.user_cards.card.issuer} ${transaction.user_cards.card.name}`}
                    </span>
                  ) : null}
                </div>
                {transaction.memo ? (
                  <p className="mt-2 text-sm text-blue-50/78">{transaction.memo}</p>
                ) : null}
              </div>

              <div className="text-left sm:text-right">
                <p className="text-lg font-semibold text-white">
                  {moneyFormatter.format(Number(transaction.amount))}원
                </p>
                <p className="mt-1 text-xs text-blue-100/68">
                  실적 인정 {moneyFormatter.format(Number(transaction.eligible_spend_amount))}원
                </p>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
