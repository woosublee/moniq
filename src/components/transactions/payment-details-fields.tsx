import type { TransactionRecord } from "@/features/transactions/types";

export function PaymentDetailsFields({ transaction, includeTime = false }: { transaction?: TransactionRecord | null; includeTime?: boolean }) {
  return <details className="ledger-auxiliary"><summary>결제 조건 추가 · 필요한 경우만</summary>
    <p className="workspace-note">채널·할부 조건을 모르면 그대로 저장할 수 있습니다. 관련 혜택만 확인 필요로 남습니다.</p>
    <div className="ledger-fields">
      <label>결제 채널<select name="paymentChannel" defaultValue={transaction?.payment_channel ?? "unknown"}><option value="unknown">모름</option><option value="offline">오프라인</option><option value="online">온라인</option><option value="mobile_wallet">간편결제</option></select></label>
      <label>할부 개월<input name="installmentMonths" inputMode="numeric" pattern="[0-9]*" defaultValue={transaction?.installment_months ?? ""} placeholder="모름 · 일시불은 1" /></label>
      {includeTime ? <label>사용 시각 · 선택<input name="occurredTime" type="time" /></label> : null}
    </div>
    <p className="workspace-note">시각을 모르면 날짜만 입력하세요. 시각 없는 동일 날짜 거래는 고정 입력순서 기준 추정입니다. 날짜만 저장한 경우 00:00을 사용하며 실제 사용 시각을 뜻하지 않습니다.</p>
  </details>;
}
