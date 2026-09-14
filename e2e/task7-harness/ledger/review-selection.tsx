"use client";
// Test-only adapter: keep the real workspace tree (including keys), replacing only
// the exclusion IO boundary and the route destination of its real query controls.
import { Children, cloneElement, isValidElement, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import Form from "next/form";
import { useSearchParams } from "next/navigation";
import { LedgerWorkspaceView } from "@/components/ledger/ledger-workspace";
import { LedgerActivityList } from "@/components/ledger/ledger-activity-list";
import { LedgerFilters, LedgerPeriod } from "@/components/ledger/ledger-filters";
import { TransactionsTable } from "@/components/transactions/transactions-table";
import { inputs, transaction, refund } from "@/features/card-benefits/replay.fixtures";
import { replayLedger } from "@/features/card-benefits/replay";
import { buildCardWorkspace } from "@/lib/card-workspace/view-model";
import { parseLedgerQuery } from "@/features/ledger/workspace-view";
import type { LedgerWorkspace } from "@/features/ledger/types";
import type { deleteTransactions } from "@/app/transactions/new/actions";
const id = "10000000-0000-4000-8000-000000000017";
type Result = Awaited<ReturnType<typeof deleteTransactions>>;
function adapt(node: ReactNode, action: typeof deleteTransactions): ReactNode {
  // Expand only these pure server presentations so their real nested Form/Link
  // controls navigate within the isolated route, not the production demo.
  if (isValidElement<Parameters<typeof LedgerPeriod>[0]>(node) && node.type === LedgerPeriod) return adapt(LedgerPeriod(node.props), action);
  if (isValidElement<Parameters<typeof LedgerFilters>[0]>(node) && node.type === LedgerFilters) return adapt(LedgerFilters(node.props), action);
  if (!isValidElement<{ children?: ReactNode; href?: string; action?: string; excludeAction?: typeof deleteTransactions }>(node)) return node;
  if (node.type === LedgerActivityList) return cloneElement(node, { excludeAction: action });
  const destination = (href: string) => {
    const url = new URL(href, "https://synthetic.invalid");
    url.pathname = "/task7-harness/ledger"; url.searchParams.set("case", "review-selection");
    return url.pathname + url.search;
  };
  const props: { children?: ReactNode; href?: string; action?: string } = {};
  if (node.props.children) props.children = Children.map(node.props.children, child => adapt(child, action));
  if (node.props.href?.startsWith("/ledger")) props.href = destination(node.props.href);
  if (node.type === Form && node.props.action === "/ledger") {
    props.action = "/task7-harness/ledger";
    props.children = <>{props.children}<input type="hidden" name="case" value="review-selection" /></>;
  }
  return cloneElement(node, props);
}
export function SelectionReviewHarness() {
  const params = useSearchParams();
  const state = parseLedgerQuery(Object.fromEntries(params), "2026-02");
  const source = inputs({ transactions: [transaction(id, 1000, "2026-02-20T01:00:00Z"), ...Array.from({ length: 51 }, (_, i) => ({ ...transaction(`other-${i}`, 1000, "2026-02-01T01:00:00Z", "a", i + 2), merchant_name: "가상 나머지" }))], adjustments: [refund(id, 100, "2026-02-20T03:00:00Z", { id })] });
  const workspace: LedgerWorkspace = { cardWorkspace: buildCardWorkspace(source, "12", "2026-03", replayLedger(source, "2026-03")), incomeSource: { status: "supported", entries: [{ id, owner_id: source.ownerId, version: "7", stable_sequence: "100", occurred_at: "2026-02-20T02:00:00Z", source_name: "가상 급여", amount: 3000, ledger_category: "급여", memo: null, input_excluded: false, created_at: "2026-02-20T02:00:00Z", updated_at: "2026-02-20T02:00:00Z" }] } };
  const [requests, setRequests] = useState<unknown[]>([]);
  const [mode, setMode] = useState<Result["status"] | "pending">("outcome_unknown");
  const [release, setRelease] = useState<((result: Result) => void) | null>(null);
  const action: typeof deleteTransactions = async (entries, requestId, month) => {
    // Expose the fake IO controls before the real transition settles.
    flushSync(() => setRequests(current => [...current, { entries, requestId, month }]));
    if (mode === "pending") return new Promise<Result>(resolve => { flushSync(() => setRelease(() => resolve)); });
    return { status: mode, message: `테스트 ${mode} · 실제 저장 없음` };
  };
  const view = LedgerWorkspaceView({ workspace, state, canMutate: true });
  return <>
    <label>테스트 응답<select aria-label="테스트 응답" value={mode} onChange={event => setMode(event.target.value as typeof mode)}><option value="outcome_unknown">미확인</option><option value="pending">진행 중</option><option value="error">확정 실패</option><option value="success">성공</option><option value="saved_needs_review">저장 receipt</option></select></label>
    {release ? <button type="button" onClick={() => { release({ status: "outcome_unknown", message: "테스트 응답 유실" }); setRelease(null); }}>미확인 응답 전달</button> : null}
    {adapt(view, action)}
    <pre data-testid="review-requests" style={{ overflowX: "auto" }}>{JSON.stringify(requests)}</pre>
    <details><summary>기존 거래표 소비부</summary><TransactionsTable transactions={workspace.cardWorkspace.transactions.slice(0, 2)} userCards={[...source.cards]} canMutate={false} month="2026-02" /></details>
  </>;
}
