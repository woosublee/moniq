"use client";
import { saveTransactionAnnotation, restoreTransactionAutomatic } from "@/app/transactions/new/actions";
import { LedgerActionForm } from "./ledger-request-fields";
import { initialTransactionFormState } from "@/features/transactions/constants";
import type { TransactionAnnotationRecord, TransactionFormState } from "@/features/transactions/types";
import type { AnnotationTarget, TransactionEditorContext } from "@/lib/card-workspace/input-options";
import { rewardValue } from "./transaction-calculation-summary";

type Props = { transactionId: string; context: TransactionEditorContext; month: string; readOnly?: boolean; onState?: (state: TransactionFormState, pending: boolean) => void };
export function TransactionAnnotationForm({ transactionId, context, month, readOnly = false, onState }: Props) {
  return <section className="ledger-section"><h2>자동 계산과 수동 보정</h2><p className="workspace-note">예상 고정값과 실제 확정값은 별도로 보존합니다. 0도 유효하며 실제 확정값이 우선 적용됩니다. 보정 한도 소진은 이후 거래에도 반영됩니다.</p>
    {context.annotations.map(note => <details className="ledger-auxiliary" key={note.id}><summary>보정 원문 · {note.target_key ?? "대상 미지정"} · {note.target_kind}</summary><p>금액 {String(note.amount)} · {note.review_status === "needs_review" ? "재확인 필요 · 실제 확정 아님" : "명시 입력"}</p><p>범위 {note.scope_instance_key ?? "혜택"} · 보정 version {String(note.version)}</p><p>입력 근거 owner revision {String(note.basis_input_revision ?? "미기록")} / 현재 {String(context.ownerRevision)} · 원본 entry version {String(context.transactionVersion ?? "미기록")}</p><p>판본 {note.basis_rule_version_id ?? "미기록"} · 자동값 원문 {String(note.basis_auto_amount ?? "미기록")}</p>{String(note.basis_input_revision) !== String(context.ownerRevision) ? <p>근거 이후 원장이 변경되었습니다. 보정값은 덮어쓰지 않고 유지합니다.</p> : null}
      {!readOnly && !context.targets.some(target => target.key === note.target_key && target.instanceKey === note.scope_instance_key) ? <Automatic notes={[note]} month={month} onState={onState} /> : null}
    </details>)}
    {!context.targets.length ? <p className="ledger-preserved">확인 필요 · 이 거래 날짜의 실제 선택 판본에 검증된 보정 대상이 없습니다. 보정 원문은 유지되며 새 혜택에 자동 연결하지 않습니다.</p> : readOnly ? <p className="workspace-note">읽기 전용 · 보정 내용을 변경할 수 없습니다.</p> : context.targets.map(target => {
      const notes = context.annotations.filter(note => note.target_key === target.key && note.scope_instance_key === target.instanceKey && (target.kind === "performance" ? note.target_kind === "performance" : note.target_kind !== "performance"));
      return <details className="ledger-auxiliary" key={`${target.kind}:${target.key}:${target.instanceKey}`}><summary>{target.kind === "performance" ? "실적" : "혜택"} {target.key} 보정</summary><p>현재 자동값 {rewardValue(target.automaticAmount, target.unit)}</p>
        {target.kind === "performance" ? <Correction kind="performance" target={target} notes={notes} {...{ transactionId, context, month, onState }} /> : <><Correction kind="benefit_eligible" target={target} notes={notes} {...{ transactionId, context, month, onState }} /><Correction kind="confirmed_benefit" target={target} notes={notes} {...{ transactionId, context, month, onState }} /></>}
        {notes.length ? <Automatic notes={notes} month={month} onState={onState} /> : null}
      </details>;
    })}
  </section>;
}
function Correction({ kind, target, notes, transactionId, context, month, onState }: Omit<Props, "readOnly"> & { kind: TransactionAnnotationRecord["target_kind"]; target: AnnotationTarget; notes: TransactionAnnotationRecord[] }) {
  const matching = notes.filter(note => note.target_kind === kind);
  if (matching.length > 1) return <p>중복 보정 확인 필요 · 자동 계산으로 되돌린 뒤 최신 자료에서 다시 입력하세요.</p>;
  const existing = matching[0];
  const label = kind === "performance" ? "실적 인정 보정" : kind === "benefit_eligible" ? "예상 고정 혜택" : "실제 확정 혜택";
  return <LedgerActionForm action={saveTransactionAnnotation.bind(null, existing?.id ?? null)} initial={initialTransactionFormState} version={existing?.version} month={month} create={!existing} submitLabel={`${label} 저장`} onState={onState}>
    <input type="hidden" name="transactionId" value={transactionId} /><input type="hidden" name="transactionVersion" value={String(context.transactionVersion ?? "")} />
    <input type="hidden" name="targetKind" value={kind} /><input type="hidden" name="targetKey" value={target.key} /><input type="hidden" name="scopeInstanceKey" value={target.instanceKey ?? ""} />
    <input type="hidden" name="basisAutoAmount" value={target.automaticAmount ?? ""} /><input type="hidden" name="basisInputRevision" value={String(context.ownerRevision)} /><input type="hidden" name="basisRuleVersionId" value={target.ruleVersionId} />
    <label>{label} · {target.unit?.kind === "points" ? `포인트 (${target.unit.program})` : target.unit?.kind === "miles" ? `마일 (${target.unit.program})` : target.unit ? "원" : "단위 확인 필요"}<input name="amount" inputMode="numeric" pattern="[0-9]+" required defaultValue={existing?.amount ?? ""} /></label>
    {existing?.review_status === "needs_review" ? <label className="ledger-check"><input type="checkbox" required />이 대상과 금액을 명시적으로 재확인했습니다.</label> : null}
    {!target.unit ? <p className="workspace-note">단위가 검증되지 않아 총혜택은 확정할 수 없습니다. 카드사 원문의 같은 단위만 입력하세요.</p> : null}
  </LedgerActionForm>;
}
function Automatic({ notes, month, onState }: { notes: TransactionAnnotationRecord[]; month: string; onState?: Props["onState"] }) {
  return <LedgerActionForm action={restoreTransactionAutomatic} initial={initialTransactionFormState} month={month} submitLabel="자동 계산으로 되돌리기" onState={onState}><input type="hidden" name="annotations" value={JSON.stringify(notes.map(note => ({ id: note.id, version: String(note.version) })))} /><label className="ledger-check"><input type="checkbox" required />이 대상의 보정을 해제하고 자동 계산을 사용합니다.</label></LedgerActionForm>;
}
