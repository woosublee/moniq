"use client";
// Copied only into the isolated preview. Never routed by the production application.
import { useRef, useState } from "react";
import { IncomeHarness } from "./income";
import { LedgerActionForm, LedgerMutationBoundary } from "@/components/transactions/ledger-request-fields";
import { LedgerDialog } from "@/components/transactions/ledger-dialog";
import { QuickTransactionForm } from "@/components/transactions/quick-transaction-form";
import type { TransactionFormState } from "@/features/transactions/types";
import { card, inputs, monthData, policy, transaction, version } from "@/features/card-benefits/replay.fixtures";
import { CardAddDialog } from "@/components/cards/card-add-dialog";
import { TransactionCancelDialog } from "@/components/transactions/transaction-cancel-dialog";
import { CardQuotaMonthInputForm } from "@/components/cards/card-month-input-form";
import { LocalDate } from "@/components/transactions/local-date";
import { getDemoUserCards } from "@/lib/demo/fixtures";
import { replayLedger } from "@/features/card-benefits/replay";
import { buildCardWorkspace } from "@/lib/card-workspace/view-model";
import { cardInputOptions } from "@/lib/card-workspace/input-options";
function FinalFixHarness() {
  const [captures, setCaptures] = useState<Record<string, string>[]>([]);
  const [monthEnd, setMonthEnd] = useState(false);
  const [daily, setDaily] = useState<null | "new" | "remaining">(null);
  const rules = policy(); rules.benefits[0].performance = { kind: "none" }; rules.benefits[0].quotaKeys = ["pool"];
  rules.quotas = [{ key: "pool", period: daily ? "daily" : "monthly", sharing: { kind: "independent" }, limit: { kind: "fixed", amount: 500 } }];
  const later = structuredClone(rules); later.quotas[0].limit = { kind: "fixed", amount: 300 };
  const source = inputs({ ruleVersions: daily ? [version("a", rules, { effective_until: "2026-02-15" }), version("a", later, { id: "later", version_order: 2, effective_from: "2026-02-15" })] : [version("a", rules)],
    transactions: daily ? [transaction("quota"), transaction("later", 10000, "2026-02-20T01:00:00Z")] : [transaction("quota")],
    monthInputs: daily === "remaining" ? [{ ...monthData("2026-02", "quota", "pool", { status: "remaining", amount: "0.125" }), version: "7" }] : [] });
  const w = buildCardWorkspace(source, "37", "2026-02", replayLedger(source, "2026-02"));
  const quotas = cardInputOptions(w, w.summaries[0]).quotas;
  return <section data-testid="final-fix" onSubmitCapture={event => {
    // Native payload capture only: no production Action, auth bypass, or DB write.
    event.preventDefault(); event.stopPropagation();
    setCaptures(rows => [...rows, Object.fromEntries([...new FormData(event.target as HTMLFormElement)].map(([key, value]) => [key, String(value)]))]);
  }}><h2>최종 수정 native payload 검증 · 저장 없음</h2>
    <CardAddDialog userCards={getDemoUserCards().filter(row => row.id === "demo-everyday")} month="2026-02" />
    <button onClick={() => setMonthEnd(value => !value)}>월말 환불 사례 전환</button>
    <TransactionCancelDialog key={String(monthEnd)} transaction={transaction("33333333-3333-4333-8333-333333333901", 10000, `2026-09-${monthEnd ? "30" : "13"}T05:00:00.123456Z`)} refundableAmount={10000} month="2026-09" />
    <button onClick={() => { setDaily("new"); setCaptures([]); }}>일별 한도 미입력 사례</button>
    <button onClick={() => { setDaily("remaining"); setCaptures([]); }}>일별 한도 기존 소수 원문 사례</button>
    {quotas.map(input => <CardQuotaMonthInputForm key={`${daily}:${input.instanceKey}:${input.quota.scopeKey}:${input.existing?.version ?? "new"}`} input={input} month="2026-02" />)}
    <div data-testid="seoul-date"><LocalDate value="2026-08-31T15:30:00.123456Z" /></div>
    <pre data-testid="captured-inputs" style={{ overflowX: "auto", maxWidth: "100%" }}>{JSON.stringify(captures)}</pre>
  </section>;
}
function BoundaryHarness() {
  const [open, setOpen] = useState(false);
  const [locked, setLocked] = useState(false);
  const requests = useRef(0);
  const action = async (): Promise<TransactionFormState> => {
    await new Promise(resolve => setTimeout(resolve, 150));
    return { status: requests.current++ ? "success" : "outcome_unknown", message: "경계 응답" };
  };
  return <><button onClick={() => setOpen(true)}>경계 폼 열기</button>{open ? <LedgerDialog title="격리 수정" locked={locked} onClose={() => setOpen(false)}><LedgerMutationBoundary onLockChange={setLocked}>
    <LedgerActionForm action={action} initial={{ status: "idle", message: "" }} month="2026-02" submitLabel="첫 수정"><label>첫 입력<input name="amount" defaultValue="100" /></label></LedgerActionForm>
    <LedgerActionForm action={action} initial={{ status: "idle", message: "" }} month="2026-02" submitLabel="다른 수정"><label>다른 입력<input name="amount" defaultValue="200" /></label></LedgerActionForm>
  </LedgerMutationBoundary></LedgerDialog> : null}</>;
}
export default function FormHarness() {
  const count = useRef(0);
  const [requests, setRequests] = useState<Record<string, string>[]>([]);
  const [defaultCardId, setDefaultCardId] = useState("33333333-3333-4333-8333-333333333902");
  const [household, setHousehold] = useState(false);
  const [incomeSupported, setIncomeSupported] = useState(true);
  const [month, setMonth] = useState("2026-02");
  async function action(_previous: TransactionFormState, data: FormData, handledAs = "expense"): Promise<TransactionFormState> {
    const request: Record<string, string> = { ...Object.fromEntries([...data].map(([key, value]) => [key, String(value)])), handledAs };
    setRequests(rows => [...rows, request]);
    await new Promise(resolve => setTimeout(resolve, 100));
    const status = (["error", "outcome_unknown"][count.current++] ?? "success") as TransactionFormState["status"];
    return { status, message: status === "error" ? "입력 확인" : status === "outcome_unknown" ? "응답 미확인" : "저장되었습니다.", resultIds: status === "success" ? [request.entryId] : undefined,
      feedback: status === "success" && handledAs === "expense" ? { transactionId: request.entryId, benefit: "500원 (자동)", performance: "10,000원", notice: "거래 상세에서 약관·실적 자료·결제 조건을 확인하세요." } : undefined,
    };
  }
  return <main style={{ width: "100%", minWidth: 0, maxWidth: 600, margin: "24px auto" }}><h1>격리 입력 검증</h1><p>테스트용 메모리 응답 · DB 저장 없음</p><button onClick={() => setHousehold(true)}>가계부 입력 사례</button><button onClick={() => setIncomeSupported(value => !value)}>수입 지원 전환</button><button onClick={() => setMonth("2026-03")}>월 prop 변경</button><button onClick={() => setDefaultCardId("33333333-3333-4333-8333-333333333902")}>기본 카드 prop 신용 A</button><button onClick={() => setDefaultCardId("33333333-3333-4333-8333-333333333903")}>기본 카드 prop 체크 B</button><output data-testid="default-card-prop">{defaultCardId}</output><QuickTransactionForm userCards={[card("33333333-3333-4333-8333-333333333902"), { ...card("33333333-3333-4333-8333-333333333903"), card: { ...card("33333333-3333-4333-8333-333333333903").card, card_type: "check_card" } }]} defaultUserCardId={defaultCardId} month={month} action={action} allowIncome={household} incomeSupported={incomeSupported} incomeAction={(previous, data) => action(previous, data, "income")} /><pre style={{ maxWidth: "100%", overflowX: "auto" }} data-testid="requests">{JSON.stringify(requests)}</pre><BoundaryHarness /><FinalFixHarness />{household ? <IncomeHarness /> : null}</main>;
}
