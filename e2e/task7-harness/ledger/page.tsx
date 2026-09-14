"use client";
// Test-only native surface, copied by the allowlisted preview. No production route or DB writes.
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { LedgerWorkspaceView } from "@/components/ledger/ledger-workspace";
import { LedgerActivityList } from "@/components/ledger/ledger-activity-list";
import { inputs, transaction, refund } from "@/features/card-benefits/replay.fixtures";
import { replayLedger } from "@/features/card-benefits/replay";
import { buildCardWorkspace } from "@/lib/card-workspace/view-model";
import { parseLedgerQuery, selectLedgerActivity } from "@/features/ledger/workspace-view";
import type { IncomeEntryRecord, LedgerWorkspace } from "@/features/ledger/types";
import type { deleteTransactions } from "@/app/transactions/new/actions";
import { SelectionReviewHarness } from "./review-selection";
const id = "10000000-0000-4000-8000-000000000017";
function scenario(kind: string): LedgerWorkspace {
  const amount = kind === "large" ? Number.MAX_SAFE_INTEGER : 100000;
  const at = "2026-02-18T01:00:00.123456Z";
  const entry: IncomeEntryRecord = { id, owner_id: "synthetic-owner", version: "7", stable_sequence: "100", occurred_at: at, source_name: "가상 급여", amount: kind === "large" ? Number.MAX_SAFE_INTEGER : 3000000, ledger_category: "급여", memo: "테스트 원본", input_excluded: false, created_at: at, updated_at: at };
  const source = inputs({ transactions: kind === "empty" ? [] : [
    { ...transaction(id, amount, at), merchant_name: kind === "large" ? "아주긴공백없는가상사용처이름".repeat(8) : "가상 월세", ledger_category: "주거비", is_fixed_cost: true },
    { ...transaction("cash", 5000, "2026-02-18T02:00:00Z"), payment_method: "cash", user_card_id: null, merchant_name: "가상 시장", ledger_category: "식비" },
  ], adjustments: kind === "normal" || kind === "selection" ? [refund(id, 3000, "2026-02-18T03:00:00Z", { id })] : [] });
  if (kind === "unknown") source.transactions = source.transactions.map((row, index) => index === 0 ? { ...row, amount: "10.5", actual_amount: "10.5", occurred_at: "원문-확인필요" } : row);
  const entries = kind === "empty" ? [] : kind === "unknown" ? [{ ...entry, amount: "20.5", occurred_at: "원문-수입-확인필요", input_excluded: true }] : [entry];
  return { cardWorkspace: buildCardWorkspace(source, "12", "2026-02", replayLedger(source, "2026-02")), incomeSource: kind === "unsupported" ? { status: "unsupported" } : { status: "supported", entries } };
}
export default function LedgerNativeHarness() {
  const params = useSearchParams();
  const kind = params.get("case") ?? "normal";
  const state = parseLedgerQuery({ month: "2026-02" }, "2026-02");
  const workspace = scenario(kind);
  const projection = selectLedgerActivity(workspace, state);
  const [captures, setCaptures] = useState<Record<string, string>[]>([]);
  const [requests, setRequests] = useState<unknown[]>([]);
  const captureExclude: typeof deleteTransactions = async (entries, requestId, month) => {
    setRequests(previous => [...previous, { entries, requestId, month }]);
    return { status: "outcome_unknown", message: "테스트 미확인 응답 · DB 저장 없음" };
  };
  if (kind === "review-selection") return <SelectionReviewHarness />;
  return <div onSubmitCapture={event => {
    // Capture native form payload before any real Action runs.
    event.preventDefault(); event.stopPropagation();
    setCaptures(previous => [...previous, Object.fromEntries([...new FormData(event.target as HTMLFormElement)].map(([key, value]) => [key, String(value)]))]);
  }}>
    <p>Task17 격리 화면 검증 · 실제 저장 없음</p>
    {kind === "selection" ? <LedgerActivityList rows={projection.rows} dayTotals={projection.dayTotals} userCards={[...workspace.cardWorkspace.inputs.cards]} contexts={{}} month="2026-02" canMutate excludeAction={captureExclude} /> : <LedgerWorkspaceView workspace={workspace} state={state} canMutate />}
    <pre data-testid="native-captures" style={{ overflowX: "auto", maxWidth: "100%" }}>{JSON.stringify(captures)}</pre>
    <pre data-testid="selection-captures" style={{ overflowX: "auto", maxWidth: "100%" }}>{JSON.stringify(requests)}</pre>
  </div>;
}
