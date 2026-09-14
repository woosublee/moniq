"use client";
import { useState } from "react";
import { saveCardTarget } from "@/app/cards/actions";
import { LedgerActionForm } from "@/components/transactions/ledger-request-fields";
import { initialTransactionFormState } from "@/features/transactions/constants";
import type { UserCardRecord } from "@/features/cards/types";
import type { cardInputOptions } from "@/lib/card-workspace/input-options";
import { formatWon } from "@/lib/card-workspace/view-model";
export function CardTargetForm({ card, targets, month, readOnly = false }: { card: UserCardRecord; targets: ReturnType<typeof cardInputOptions>["targets"]; month: string; readOnly?: boolean }) {
  const [selected, setSelected] = useState(`${card.target_scope_key ?? ""}/${card.target_tier_key ?? ""}`);
  const target = targets.find(item => `${item.scopeKey}/${item.tierKey}` === selected);
  return <section className="ledger-section"><h2>목표 구간</h2><p className="workspace-note">현재 목표 {card.target_scope_key && card.target_tier_key ? `${card.target_scope_key} · ${card.target_tier_key}` : "설정 없음"}</p>
    {!targets.length ? <p>확인 필요 · 선택 월의 검증된 실적 구간이 없거나 판본 간 정의가 다릅니다. 약관 확인 후 목표 설정이 가능합니다.</p> : readOnly ? <p className="workspace-note">읽기 전용 · {targets.map(item => `${item.tierKey} ${formatWon(item.minimumSpend)}`).join(" / ")}</p> : <LedgerActionForm action={saveCardTarget.bind(null, card.id)} initial={initialTransactionFormState} version={card.version} month={month} submitLabel="목표 저장">
      <input type="hidden" name="scopeKey" value={target?.scopeKey ?? ""} /><input type="hidden" name="tierKey" value={target?.tierKey ?? ""} />
      <label>목표 구간 선택<select required value={!target && selected !== "/" ? "" : selected} onChange={event => setSelected(event.target.value)}><option value="" disabled>기존 목표 확인 필요 · 새 목표를 선택하세요</option><option value="/">목표 설정 안 함</option>{targets.map(item => <option key={`${item.scopeKey}/${item.tierKey}`} value={`${item.scopeKey}/${item.tierKey}`}>{item.scopeKey} · {item.tierKey} · {formatWon(item.minimumSpend)}</option>)}</select></label>
    </LedgerActionForm>}
  </section>;
}
