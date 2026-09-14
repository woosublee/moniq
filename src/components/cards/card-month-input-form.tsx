"use client";
import { WorkspaceReasons } from "./workspace-reasons";
import { useState } from "react";
import { saveCardMonthInput } from "@/app/cards/actions";
import { LedgerActionForm } from "@/components/transactions/ledger-request-fields";
import type { cardInputOptions } from "@/lib/card-workspace/input-options";
import { initialTransactionFormState } from "@/features/transactions/constants";
import { formatWon } from "@/lib/card-workspace/view-model";

type QuotaInput = ReturnType<typeof cardInputOptions>["quotas"][number];
function quotaUnit(quota: QuotaInput["quota"]) {
  return quota.consumption === "count" ? "회" : quota.consumption === "eligible_spend" ? "대상 결제액 · 원" : !quota.unit ? "단위 확인 필요" : quota.unit.kind === "won" ? "혜택 · 원" : `${quota.unit.kind === "points" ? "포인트" : "마일"} (${quota.unit.program})`;
}
export function CardQuotaMonthInputForm({ input, month, readOnly = false }: { input: QuotaInput; month: string; readOnly?: boolean }) {
  const unsupportedOpening = !input.supportsRemaining && input.existing?.data_status === "remaining";
  const [status, setStatus] = useState(unsupportedOpening ? "" : input.existing?.data_status ?? "unknown");
  const { quota } = input;
  const unit = quotaUnit(quota);
  return <section className="ledger-section"><h3>{input.shared ? "공유" : "개별"} 한도 자료 · {input.month} · {quota.scopeKey}</h3>
    <p className="workspace-note">{input.cardNames.join(", ")} · {input.services.join(" / ")} · {unit}<br />범위 {input.instanceKey}</p>
    <p>자료 상태: {input.existing ? statusLabels[input.existing.data_status] : "미입력"}{input.existing?.data_status === "remaining" ? ` · 원본 ${input.existing.amount} ${unit}` : ""}</p>
    <WorkspaceReasons reasons={quota.reasons} />
    {!input.supportsRemaining ? <>
      <p className="workspace-note">같은 월·범위의 월 자료 원본 하나를 모든 일별 한도에 적용합니다. 입력 완료는 각 날짜에 적용된 한도에서 그날의 기록 거래를 계산합니다. 날짜별 한도는 합치지 않으며 자료 모름은 0이 아닌 확인 필요로 남깁니다.</p>
      <ul className="workspace-note">{input.pools.map(pool => <li key={pool.periodKey}>{pool.periodKey} · 한도 {pool.cap?.toLocaleString("ko-KR") ?? "확인 필요"} {quotaUnit(pool)}<WorkspaceReasons reasons={pool.reasons} /></li>)}</ul>
      <p className={unsupportedOpening ? "ledger-preserved" : "workspace-note"}>일별 시작 잔여량은 미지원입니다.{unsupportedOpening ? " 기존 원문은 그대로 보존됩니다. 확인 후 입력 완료 또는 자료 모름을 직접 선택해야 저장할 수 있습니다." : " 입력 완료·자료 모름만 저장하며 금액은 입력하지 않습니다."}</p>
    </> : null}
    <p className="workspace-note">실적 입력 완료와 한도 자료는 서로 독립입니다. 공유 범위는 어느 카드에서 열어도 같은 원본을 수정하며 카드·서비스마다 잔여량을 나누어 저장하지 않습니다.</p>
    {readOnly ? <p className="workspace-note">읽기 전용 자료입니다.</p> : !input.editable ? <><p className="ledger-preserved">범위·판본 또는 원본 자료가 충돌해 저장할 수 없습니다. 기존 원문을 확인해 주세요.</p>{input.originals.map(row => <p className="workspace-note" key={row.id}>{row.id} · 판본 {row.version} · {row.data_status} · {row.amount ?? "값 없음"}</p>)}</> : <LedgerActionForm action={saveCardMonthInput.bind(null, input.existing?.id ?? null)} initial={initialTransactionFormState} version={input.existing?.version} month={month} create={!input.existing} submitLabel="한도 자료 저장">
      <input type="hidden" name="scopeKind" value="quota" /><input type="hidden" name="inputMonth" value={input.month} /><input type="hidden" name="scopeKey" value={quota.scopeKey} /><input type="hidden" name="scopeInstanceKey" value={input.instanceKey} />
      <label>한도 자료 상태<select name="dataStatus" value={status} required onChange={event => setStatus(event.target.value)}>{unsupportedOpening ? <option value="" disabled>기존 미지원 자료 · 상태를 선택해 주세요</option> : null}<option value="unknown">자료 모름</option><option value="complete">이 한도 범위의 월 원장 입력 완료</option>{input.supportsRemaining ? <option value="remaining">기록 전 시작 잔여량 확인</option> : null}</select></label>
      {input.supportsRemaining && status === "remaining" ? <label>시작 잔여량 · {unit}<input name="amount" inputMode="numeric" pattern="[0-9]+" defaultValue={input.existing?.amount ?? ""} required /></label> : null}
      {input.supportsRemaining ? <p className="workspace-note">입력 완료는 월 전체 한도에서 기록된 거래를 계산합니다. 자료 모름은 0이 아닌 확인 필요로 남깁니다. 시작 잔여량은 기록된 거래를 계산하기 전의 opening 잔여량입니다. 아래 현재 잔여를 그대로 재입력하면 이미 사용한 양이 다시 차감됩니다. 0도 유효하며, 일별 시작 잔여 자료는 지원하지 않습니다.</p> : null}
    </LedgerActionForm>}
  </section>;
}

type Input = ReturnType<typeof cardInputOptions>["performance"][number];
const statusLabels = { manual_total: "카드사 확인 총액", complete: "입력 완료", incomplete: "입력 중", before_tracking_unknown: "추적 시작 전 · 모름", unknown: "자료 확인 필요", remaining: "기록 전 시작 잔여량" };
export function CardMonthInputForm({ input, month, readOnly = false }: { input: Input; month: string; readOnly?: boolean }) {
  const [status, setStatus] = useState(input.existing?.data_status ?? "incomplete");
  return <section className="ledger-section"><h3>{input.month === month ? "이번 달" : "전월 총실적"} · {input.month} · {input.definition.key}</h3>
    <p>적용 총실적 {formatWon(input.scope.amount)}</p>
    <p className="workspace-note">{input.scope.source === "manual_total" ? "카드사 확인 총액" : "입력 원장 기준"} · 원장 합계 {formatWon(input.scope.ledgerAmount)}</p>
    <WorkspaceReasons reasons={input.scope.reasons} />
    <p className="workspace-note">자료 상태: {input.existing ? statusLabels[input.existing.data_status] : "미입력"}{input.existing?.data_status === "manual_total" ? ` · ${formatWon(input.existing.amount)}` : ""} · 범위 {input.instanceKey}</p>
    {readOnly ? <p className="workspace-note">읽기 전용 자료입니다.</p> : <LedgerActionForm key={`${input.month}:${input.existing?.id ?? "new"}:${input.existing?.version ?? "new"}`} action={saveCardMonthInput.bind(null, input.existing?.id ?? null)} initial={initialTransactionFormState} version={input.existing?.version} month={month} create={!input.existing} submitLabel="실적 자료 저장">
      <input type="hidden" name="scopeKind" value="performance" /><input type="hidden" name="inputMonth" value={input.month} /><input type="hidden" name="scopeKey" value={input.definition.key} /><input type="hidden" name="scopeInstanceKey" value={input.instanceKey} />
      <label>자료 상태<select name="dataStatus" value={status} onChange={event => setStatus(event.target.value as typeof status)}><option value="manual_total">카드사에서 확인한 총실적</option><option value="complete">이 범위의 원장 입력 완료</option><option value="incomplete">아직 입력 중</option><option value="before_tracking_unknown">추적 시작 전 · 모름</option></select></label>
      {status === "manual_total" ? <label>총실적 · 원<input name="amount" inputMode="numeric" pattern="[0-9]+" defaultValue={input.existing?.amount ?? ""} required /><span className="workspace-note">0원도 유효합니다. 이 값은 해당 범위 원장 합계 대신 사용하며 다른 실적·한도는 확정하지 않습니다.</span></label> : null}
      <p className="workspace-note">수동 총액은 과거 거래 수정으로 원장과 달라져도 유지됩니다. 확인한 경우에만 자료 상태를 바꾸세요.</p>
    </LedgerActionForm>}
  </section>;
}
