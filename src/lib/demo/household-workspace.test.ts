import { describe, expect, it } from "vitest";
import { parseLedgerQuery, selectLedgerActivity } from "@/features/ledger/workspace-view";
import { getDemoCardWorkspace } from "@/lib/demo/card-workspace";
import {
  demoWorkspaceMonth,
  getDemoHouseholdWorkspace,
} from "@/lib/demo/household-workspace";
import {
  getDemoTransactions,
  getDemoUserCards,
} from "@/lib/demo/fixtures";

describe("Task18 shared household demo snapshot", () => {
  it("uses one supported 2026-02 source for ledger, cards and legacy demo adapters", () => {
    const ledger = getDemoHouseholdWorkspace(demoWorkspaceMonth);
    const cards = getDemoCardWorkspace(demoWorkspaceMonth);
    const projection = selectLedgerActivity(
      ledger,
      parseLedgerQuery({ month: demoWorkspaceMonth }, demoWorkspaceMonth),
    );

    expect(demoWorkspaceMonth).toBe("2026-02");
    expect(ledger.incomeSource.status).toBe("supported");
    expect(projection).toMatchObject({
      totalCount: 59,
      page: 1,
      pageCount: 2,
      periodTotals: {
        purchaseAmount: 516000,
        refundAmount: 25000,
        expenseAmount: 491000,
        incomeAmount: 3500000,
        differenceAmount: 3009000,
      },
      canAddIncome: true,
      reviewReasons: [],
    });
    expect(cards.inputs.transactions.map((row) => row.id)).toEqual(
      ledger.cardWorkspace.inputs.transactions.map((row) => row.id),
    );
    expect(cards.inputs.adjustments.map((row) => row.id)).toEqual([
      "demo-refund-grocery",
      "demo-refund-january-grocery",
    ]);
    expect(getDemoUserCards().map((row) => row.id)).toEqual(
      cards.inputs.cards.map((row) => row.id),
    );
    expect(getDemoTransactions({ startDate: "2026-02-01", endDate: "2026-02-28" }).map((row) => row.id)).toEqual(
      cards.transactions
        .filter((row) => row.workspace?.projection.month === "2026-02")
        .sort((left, right) => right.occurred_at.localeCompare(left.occurred_at))
        .map((row) => row.id),
    );
  });

  it("keeps introduction names ordinary and income outside the single card replay", () => {
    const workspace = getDemoHouseholdWorkspace("2026-02");
    const incomes = workspace.incomeSource.status === "supported"
      ? workspace.incomeSource.entries
      : [];

    expect(workspace.cardWorkspace.inputs.cards.map((row) => row.card.name)).toEqual([
      "생활비 카드",
      "교통 카드",
      "체크 카드",
    ]);
    expect(new Set(workspace.cardWorkspace.inputs.transactions.map((row) => row.merchant_name))).toEqual(new Set([
      "한빛마트",
      "동네카페",
      "서울버스",
      "온라인서점",
      "우리약국",
      "음악구독",
      "새해식료품",
    ]));
    expect(incomes.map((row) => row.source_name)).toEqual([
      "2월 급여",
      "주말 강의료",
      "정산 제외 예시",
    ]);
    expect(workspace.cardWorkspace.inputs.transactions.some((row) => incomes.some((income) => income.id === row.id))).toBe(false);
    expect(workspace.cardWorkspace.summaries.find((row) => row.userCard.id === "demo-everyday")).toMatchObject({
      eligibleSpendAmount: 381000,
      benefitAmount: 10000,
    });
  });
});
