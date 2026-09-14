import { describe, expect, it } from "vitest";
import { inputs, refund, transaction } from "@/features/card-benefits/replay.fixtures";
import { replayLedger } from "@/features/card-benefits/replay";
import type { IncomeEntryRecord, IncomeSource, LedgerWorkspace } from "@/features/ledger/types";
import { buildCardWorkspace } from "@/lib/card-workspace/view-model";
import { buildLedgerActivity, paginateLedgerRows, sortLedgerRows } from "./projection";

function income(overrides: Partial<IncomeEntryRecord> = {}): IncomeEntryRecord {
  return {
    id: "income-1",
    owner_id: "synthetic-owner",
    version: "3",
    stable_sequence: "30",
    occurred_at: "2026-02-10T01:00:00Z",
    source_name: "Synthetic salary",
    amount: "300000",
    ledger_category: "급여",
    memo: null,
    input_excluded: false,
    created_at: "2026-02-10T01:00:00Z",
    updated_at: "2026-02-10T01:00:00Z",
    ...overrides,
  };
}

function workspace(
  source = inputs(),
  incomeSource: IncomeSource = { status: "supported", entries: [] },
): LedgerWorkspace {
  return {
    cardWorkspace: buildCardWorkspace(source, "10", "2026-02", replayLedger(source, "2026-02")),
    incomeSource,
  };
}

describe("raw household activity projection", () => {
  it("keeps kind-scoped refs and each source while using raw principal instead of card display amounts", () => {
    const purchase = {
      ...transaction("same-id", 100000, "2026-01-10T01:00:00Z", "a", "10"),
      amount: 777777,
      final_amount: 1,
      benefit_amount: 5000,
    };
    const adjustment = refund("same-id", 20000, "2026-02-10T01:00:00.000002Z", {
      id: "same-id",
      version: "2",
      stable_sequence: "20",
    });
    const entry = income({ id: "same-id", occurred_at: "2026-02-10T01:00:00.000003Z" });
    const source = inputs({ transactions: [purchase], adjustments: [adjustment] });

    const rows = buildLedgerActivity(workspace(source, { status: "supported", entries: [entry] }));
    const expense = rows.find((row) => row.kind === "expense")!;
    const refundRow = rows.find((row) => row.kind === "refund")!;
    const incomeRow = rows.find((row) => row.kind === "income")!;

    expect(rows.map((row) => row.key)).toEqual(["expense:same-id", "refund:same-id", "income:same-id"]);
    expect([expense.ref, refundRow.ref, incomeRow.ref]).toEqual([
      { kind: "expense", id: "same-id", version: 1 },
      { kind: "refund", id: "same-id", version: "2" },
      { kind: "income", id: "same-id", version: "3" },
    ]);
    expect(expense).toMatchObject({ amount: 100000, rawAmount: 100000, transaction: purchase });
    expect(refundRow).toMatchObject({
      amount: 20000,
      rawAmount: 20000,
      transaction: purchase,
      refund: adjustment,
      originalRef: { kind: "expense", id: "same-id", version: 1 },
    });
    expect(incomeRow).toMatchObject({ amount: 300000, rawAmount: "300000", income: entry });
  });

  it("preserves excluded and voided sources with zero economic contribution even when their raw amounts need review", () => {
    const excluded = { ...transaction("excluded"), actual_amount: "10.5", input_excluded: true };
    const linked = refund("excluded", "20.5", "2026-02-11T01:00:00Z");
    const voided = refund("active", "30.5", "2026-02-12T01:00:00Z", {
      id: "voided-refund",
      voided_at: "2026-02-13T01:00:00Z",
    });
    const source = inputs({ transactions: [excluded, transaction("active")], adjustments: [linked, voided] });

    const rows = buildLedgerActivity(workspace(source));
    const excludedExpense = rows.find((row) => row.key === "expense:excluded")!;
    const excludedRefund = rows.find((row) => row.key === "refund:refund-excluded")!;
    const voidedRefund = rows.find((row) => row.key === "refund:voided-refund")!;

    expect(excludedExpense).toMatchObject({ amount: 0, economicExcluded: true, reviewReasons: ["invalid_amount"] });
    expect(excludedRefund).toMatchObject({ amount: 0, economicExcluded: true, reviewReasons: ["invalid_amount"] });
    expect(voidedRefund).toMatchObject({ amount: 0, economicExcluded: true, reviewReasons: ["invalid_amount"] });
  });
});

describe("shared chronology and pagination", () => {
  it("sorts exact microseconds newest-first and paginates without mutating the input", () => {
    const rows = [
      { id: "offset", occurredAt: "2026-02-01T00:00:00.123455+09:00", stableSequence: 99 },
      { id: "utc", occurredAt: "2026-01-31T15:00:00.123456Z", stableSequence: 1 },
      { id: "latest", occurredAt: "2026-01-31T15:00:00.123457Z", stableSequence: 1 },
    ];

    const sorted = sortLedgerRows(rows);
    expect(sorted.map((row) => row.id)).toEqual(["latest", "utc", "offset"]);
    expect(rows.map((row) => row.id)).toEqual(["offset", "utc", "latest"]);
    expect(paginateLedgerRows(Array.from({ length: 51 }, (_, id) => ({ id })), 2)).toEqual({
      rows: [{ id: 50 }],
      totalCount: 51,
      page: 2,
      pageCount: 2,
    });
  });
});
