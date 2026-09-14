import { describe, expect, it } from "vitest";
import { card, inputs, refund, transaction } from "@/features/card-benefits/replay.fixtures";
import { replayLedger } from "@/features/card-benefits/replay";
import type { MonthKey } from "@/features/card-benefits/periods";
import type { IncomeEntryRecord, IncomeSource, LedgerWorkspace } from "@/features/ledger/types";
import { buildCardWorkspace } from "@/lib/card-workspace/view-model";
import {
  ledgerQueryEndMonth,
  ledgerQueryHref,
  parseLedgerQuery,
  selectLedgerActivity,
  type LedgerQuery,
} from "./workspace-view";

const monthQuery: LedgerQuery = {
  period: { kind: "month", month: "2026-02" },
  query: "",
  category: "",
  paymentMethod: "",
  card: "",
  kind: "all",
  page: 1,
};

function income(id: string, amount: number | string = 300000, at = "2026-02-10T01:00:00Z", overrides: Partial<IncomeEntryRecord> = {}): IncomeEntryRecord {
  return {
    id,
    owner_id: "synthetic-owner",
    version: "1",
    stable_sequence: "1",
    occurred_at: at,
    source_name: "Synthetic salary",
    amount,
    ledger_category: "급여",
    memo: null,
    input_excluded: false,
    created_at: at,
    updated_at: at,
    ...overrides,
  };
}

function workspace(
  source = inputs(),
  incomeSource: IncomeSource = { status: "supported", entries: [] },
  throughMonth: MonthKey = "2026-02",
): LedgerWorkspace {
  return {
    cardWorkspace: buildCardWorkspace(source, "10", throughMonth, replayLedger(source, throughMonth)),
    incomeSource,
  };
}

describe("ledger query URL contract", () => {
  it("preserves an explicit multi-month range and exposes the snapshot end month", () => {
    const state = parseLedgerQuery({
      month: "2026-02",
      startDate: "2026-01-15",
      endDate: "2026-03-02",
      query: "  생활비  ",
      category: "식비",
      paymentMethod: "credit_card",
      card: "card/a",
      kind: "refund",
      page: "2",
    }, "2026-02");

    expect(state).toEqual({
      period: { kind: "range", startDate: "2026-01-15", endDate: "2026-03-02" },
      query: "생활비",
      category: "식비",
      paymentMethod: "credit_card",
      card: "card/a",
      kind: "refund",
      page: 2,
    });
    expect(ledgerQueryEndMonth(state)).toBe("2026-03");
    expect(ledgerQueryHref(state)).toBe("/ledger?startDate=2026-01-15&endDate=2026-03-02&query=%EC%83%9D%ED%99%9C%EB%B9%84&category=%EC%8B%9D%EB%B9%84&paymentMethod=credit_card&card=card%2Fa&kind=refund&page=2");
  });

  it("falls back atomically from invalid or duplicate ranges and resets paging only for filter patches", () => {
    expect(parseLedgerQuery({ startDate: "2026-02-30", endDate: "2026-03-02", month: "2026-01" }, "2026-02")).toEqual({
      ...monthQuery,
      period: { kind: "month", month: "2026-01" },
    });
    expect(parseLedgerQuery({ startDate: ["2026-01-01"], endDate: "2026-03-02", month: "0000-01", paymentMethod: "crypto", kind: "purchase", page: "Infinity" }, "2026-02")).toEqual(monthQuery);
    expect(ledgerQueryHref({ ...monthQuery, query: "생활", page: 4 }, { category: "식비" })).toBe("/ledger?month=2026-02&query=%EC%83%9D%ED%99%9C&category=%EC%8B%9D%EB%B9%84");
    expect(ledgerQueryHref({ ...monthQuery, query: "생활", page: 4 }, { page: 3 })).toBe("/ledger?month=2026-02&query=%EC%83%9D%ED%99%9C&page=3");
  });

  it("reads legacy userCardId only when the canonical card parameter is absent", () => {
    expect(parseLedgerQuery({ userCardId: "legacy-card" }, "2026-02").card).toBe("legacy-card");
    expect(parseLedgerQuery({ card: "", userCardId: "legacy-card" }, "2026-02").card).toBe("");
    expect(parseLedgerQuery({ card: ["canonical-card"], userCardId: "legacy-card" }, "2026-02").card).toBe("");
  });

  it("round-trips valid 200-character searches and 120-character categories without truncation", () => {
    const query = `${"검색".repeat(99)}끝A`;
    const category = "분".repeat(120);
    expect(query).toHaveLength(200);
    const state = parseLedgerQuery({ query, category }, "2026-02");
    const href = ledgerQueryHref(state);
    const roundTrip = Object.fromEntries(new URL(href, "https://synthetic.invalid").searchParams.entries());

    expect(state).toMatchObject({ query, category });
    expect(parseLedgerQuery(roundTrip, "2026-01")).toEqual(state);
  });
});

describe("household totals before pagination", () => {
  it.each([
    { count: 51, page: 2, pageCount: 2, visible: 1, total: 51000 },
    { count: 1001, page: 21, pageCount: 21, visible: 1, total: 1001000 },
  ])("keeps period and filtered totals invariant on a deep page of $count rows", ({ count, page, pageCount, visible, total }) => {
    const source = inputs({
      transactions: Array.from({ length: count }, (_, index) => transaction(`tx-${index}`, 1000, "2026-02-02T01:00:00Z", "a", index + 1)),
    });

    const result = selectLedgerActivity(workspace(source), { ...monthQuery, page });

    expect(result).toMatchObject({ totalCount: count, page, pageCount, periodTotals: { purchaseAmount: total, expenseAmount: total, incomeAmount: 0, differenceAmount: -total }, filteredTotals: { purchaseAmount: total, expenseAmount: total } });
    expect(result.rows).toHaveLength(visible);
    expect(result.dayTotals).toEqual([{ date: "2026-02-02", purchaseAmount: total, refundAmount: 0, expenseAmount: total, incomeAmount: 0, differenceAmount: -total }]);
  });

  it("uses Seoul boundaries and exact microseconds across expense, refund, and income rows", () => {
    const source = inputs({
      transactions: [
        transaction("january", 1000, "2026-01-31T14:59:59.999999Z", "a", 1),
        transaction("offset", 2000, "2026-02-01T00:00:00.123455+09:00", "a", 99),
        transaction("utc", 3000, "2026-01-31T15:00:00.123456Z", "a", 1),
        transaction("march", 4000, "2026-02-28T15:00:00Z", "a", 1),
      ],
      adjustments: [refund("utc", 500, "2026-01-31T15:00:00.123457Z", { id: "refund-row" })],
    });
    const entry = income("income-row", 7000, "2026-01-31T15:00:00.123458Z");

    const result = selectLedgerActivity(workspace(source, { status: "supported", entries: [entry] }), monthQuery);

    expect(result.rows.map((row) => row.key)).toEqual(["income:income-row", "refund:refund-row", "expense:utc", "expense:offset"]);
    expect(result.periodTotals).toEqual({ purchaseAmount: 5000, refundAmount: 500, expenseAmount: 4500, incomeAmount: 7000, differenceAmount: 2500 });
  });

  it("subtracts this month's refund of an older purchase without subtracting estimated card benefits", () => {
    const selected = { ...transaction("selected", 100000), benefit_amount: 5000, final_amount: 95000 };
    const old = transaction("old", 90000, "2026-01-05T00:00:00Z");
    const source = inputs({ transactions: [old, selected], adjustments: [refund("old", 20000, "2026-02-05T00:00:00Z")] });

    const result = selectLedgerActivity(workspace(source, { status: "supported", entries: [income("salary")] }), monthQuery);

    expect(result.periodTotals).toEqual({ purchaseAmount: 100000, refundAmount: 20000, expenseAmount: 80000, incomeAmount: 300000, differenceAmount: 220000 });
    expect(result.rows.map((row) => row.key)).toContain("refund:refund-old");
    expect(result.rows.map((row) => row.key)).not.toContain("expense:old");
  });

  it("keeps an income-only month as known zero expense and positive difference", () => {
    const result = selectLedgerActivity(workspace(inputs(), { status: "supported", entries: [income("salary")] }), monthQuery);

    expect(result.periodTotals).toEqual({ purchaseAmount: 0, refundAmount: 0, expenseAmount: 0, incomeAmount: 300000, differenceAmount: 300000 });
    expect(result.rows.map((row) => row.ref)).toEqual([{ kind: "income", id: "salary", version: "1" }]);
  });

  it("keeps a refund-only month negative instead of clamping net expense to zero", () => {
    const old = transaction("old", 9000, "2026-01-05T00:00:00Z");
    const source = inputs({ transactions: [old], adjustments: [refund("old", 3000, "2026-02-05T00:00:00Z")] });

    const result = selectLedgerActivity(workspace(source), monthQuery);

    expect(result.periodTotals).toEqual({ purchaseAmount: 0, refundAmount: 3000, expenseAmount: -3000, incomeAmount: 0, differenceAmount: 3000 });
  });

  it("selects every day in an explicit multi-month range and does not pull later activity forward", () => {
    const source = inputs({ transactions: [
      transaction("before", 1000, "2026-01-14T14:59:59Z", "a", 1),
      transaction("start", 2000, "2026-01-14T15:00:00Z", "a", 2),
      transaction("end", 3000, "2026-03-02T14:59:59Z", "a", 3),
      transaction("after", 4000, "2026-03-02T15:00:00Z", "a", 4),
    ] });
    const state: LedgerQuery = { ...monthQuery, period: { kind: "range", startDate: "2026-01-15", endDate: "2026-03-02" } };

    const result = selectLedgerActivity(workspace(source, { status: "supported", entries: [income("middle")] }, "2026-03"), state);

    expect(result.throughMonth).toBe("2026-03");
    expect(result.rows.map((row) => row.key)).toEqual(["expense:end", "income:middle", "expense:start"]);
    expect(result.periodTotals).toEqual({ purchaseAmount: 5000, refundAmount: 0, expenseAmount: 5000, incomeAmount: 300000, differenceAmount: 295000 });
  });

  it("uses exact summation and marks aggregate overflow without hiding unaffected income", () => {
    const source = inputs({ transactions: [
      transaction("max", Number.MAX_SAFE_INTEGER, "2026-02-02T01:00:00Z", "a", 1),
      transaction("overflow", 1, "2026-02-02T02:00:00Z", "a", 2),
    ] });

    const result = selectLedgerActivity(workspace(source, { status: "supported", entries: [income("salary")] }), monthQuery);

    expect(result.periodTotals).toEqual({ purchaseAmount: null, refundAmount: 0, expenseAmount: null, incomeAmount: 300000, differenceAmount: null });
    expect(result.reviewReasons).toEqual(["precision_unknown"]);
  });

  it("preserves excluded purchases and voided or excluded-source refunds while giving all of them zero contribution", () => {
    const excluded = { ...transaction("excluded", 100000), input_excluded: true };
    const active = transaction("active", 50000);
    const source = inputs({
      transactions: [excluded, active],
      adjustments: [
        refund("excluded", 20000, "2026-02-05T00:00:00Z"),
        refund("active", 30000, "2026-02-06T00:00:00Z", { id: "voided", voided_at: "2026-02-07T00:00:00Z" }),
      ],
    });

    const result = selectLedgerActivity(workspace(source), monthQuery);

    expect(result.periodTotals).toEqual({ purchaseAmount: 50000, refundAmount: 0, expenseAmount: 50000, incomeAmount: 0, differenceAmount: -50000 });
    expect(result.rows.map((row) => [row.key, row.amount])).toEqual([
      ["refund:voided", 0],
      ["refund:refund-excluded", 0],
      ["expense:excluded", 0],
      ["expense:active", 50000],
    ]);
  });
});

describe("filters, grouped totals, and scoped uncertainty", () => {
  it("searches source, category, card name and alias while refunds inherit the original expense dimensions", () => {
    const aliasCard = { ...card("b"), alias: "생활 카드", card: { ...card("b").card, name: "Daily B" } };
    const source = inputs({
      cards: [card("a"), aliasCard],
      transactions: [
        { ...transaction("food", 10000, undefined, "b"), merchant_name: "Synthetic Cafe", ledger_category: "식비", is_fixed_cost: true },
        { ...transaction("cash", 4000, undefined, "", 2), user_card_id: null, payment_method: "cash", ledger_category: "생활비" },
      ],
      adjustments: [refund("food", 3000, "2026-02-05T00:00:00Z")],
    });
    const entries = [income("salary", 300000, undefined, { source_name: "Synthetic Employer", ledger_category: "급여" })];
    const value = workspace(source, { status: "supported", entries });

    const cardFiltered = selectLedgerActivity(value, { ...monthQuery, card: "b", query: "생활 카드" });
    expect(cardFiltered.rows.map((row) => row.kind)).toEqual(["refund", "expense"]);
    expect(cardFiltered.filteredTotals).toEqual({ purchaseAmount: 10000, refundAmount: 3000, expenseAmount: 7000, incomeAmount: 0, differenceAmount: -7000 });
    expect(cardFiltered.categoryTotals).toEqual([{ category: "식비", expenseAmount: 7000, fixedCostAmount: 7000 }]);

    expect(selectLedgerActivity(value, { ...monthQuery, paymentMethod: "cash" }).rows.map((row) => row.key)).toEqual(["expense:cash"]);
    expect(selectLedgerActivity(value, { ...monthQuery, category: "급여", query: "employer", kind: "income" }).rows.map((row) => row.key)).toEqual(["income:salary"]);
  });

  it("keeps legacy userCardId links scoped to the selected card and its totals", () => {
    const source = inputs({
      cards: [card("a"), card("b")],
      transactions: [transaction("a-row", 1000, undefined, "a"), transaction("b-row", 9000, undefined, "b", 2)],
    });
    const state = parseLedgerQuery({ userCardId: "b" }, "2026-02");

    const result = selectLedgerActivity(workspace(source), state);

    expect(result.rows.map((row) => row.key)).toEqual(["expense:b-row"]);
    expect(result.filteredTotals).toEqual({ purchaseAmount: 9000, refundAmount: 0, expenseAmount: 9000, incomeAmount: 0, differenceAmount: -9000 });
    expect(ledgerQueryHref(state)).toBe("/ledger?month=2026-02&card=b");
  });

  it("uses the full valid query and category so shared prefixes do not broaden filters", () => {
    const prefix = "x".repeat(120);
    const category = "분".repeat(120);
    const source = inputs({ transactions: [
      { ...transaction("category-match", 1000), ledger_category: category },
      { ...transaction("category-prefix", 9000, undefined, "a", 2), ledger_category: category.slice(0, 100) },
    ] });
    const entries = [
      income("income-match", 3000, undefined, { source_name: `${prefix}A` }),
      income("income-prefix", 7000, undefined, { source_name: `${prefix}B`, stable_sequence: 2 }),
    ];
    const value = workspace(source, { status: "supported", entries });

    expect(selectLedgerActivity(value, parseLedgerQuery({ category }, "2026-02")).rows.map((row) => row.key)).toEqual(["expense:category-match"]);
    expect(selectLedgerActivity(value, parseLedgerQuery({ query: `${prefix}A`, kind: "income" }, "2026-02")).rows.map((row) => row.key)).toEqual(["income:income-match"]);
  });

  it("keeps unsupported income and difference unknown unless filters make income irrelevant", () => {
    const source = inputs({ transactions: [transaction("expense", 100000)] });
    const value = workspace(source, { status: "unsupported" });

    const all = selectLedgerActivity(value, monthQuery);
    expect(all).toMatchObject({
      incomeSourceStatus: "unsupported",
      canAddIncome: false,
      periodTotals: { purchaseAmount: 100000, refundAmount: 0, expenseAmount: 100000, incomeAmount: null, differenceAmount: null },
      filteredTotals: { incomeAmount: null, differenceAmount: null },
      reviewReasons: ["income_source_unsupported"],
    });

    const cardOnly = selectLedgerActivity(value, { ...monthQuery, card: "a" });
    expect(cardOnly.filteredTotals).toEqual({ purchaseAmount: 100000, refundAmount: 0, expenseAmount: 100000, incomeAmount: 0, differenceAmount: -100000 });
  });

  it("propagates active undated uncertainty to each known day by kind only after filters", () => {
    const datedExpense = transaction("dated-expense", 1000, "2026-02-02T01:00:00Z");
    const datedIncome = income("dated-income", 3000, "2026-02-02T02:00:00Z");

    const incomeUnknown = selectLedgerActivity(
      workspace(inputs({ transactions: [datedExpense] }), { status: "supported", entries: [income("undated-income", 5000, "invalid-income-time")] }),
      monthQuery,
    );
    expect(incomeUnknown.dayTotals).toEqual([{ date: "2026-02-02", purchaseAmount: 1000, refundAmount: 0, expenseAmount: 1000, incomeAmount: null, differenceAmount: null }]);

    const expenseSource = inputs({ transactions: [datedExpense, transaction("undated-expense", 5000, "invalid-expense-time", "a", 2)] });
    const expenseUnknown = selectLedgerActivity(workspace(expenseSource, { status: "supported", entries: [datedIncome] }), monthQuery);
    expect(expenseUnknown.dayTotals).toEqual([{ date: "2026-02-02", purchaseAmount: null, refundAmount: 0, expenseAmount: null, incomeAmount: 3000, differenceAmount: null }]);
    expect(selectLedgerActivity(workspace(expenseSource, { status: "supported", entries: [datedIncome] }), { ...monthQuery, kind: "income" }).dayTotals)
      .toEqual([{ date: "2026-02-02", purchaseAmount: 0, refundAmount: 0, expenseAmount: 0, incomeAmount: 3000, differenceAmount: 3000 }]);

    const old = transaction("old", 9000, "2026-01-05T00:00:00Z");
    const refundSource = inputs({ transactions: [old, datedExpense], adjustments: [refund("old", 5000, "invalid-refund-time")] });
    const refundUnknown = selectLedgerActivity(workspace(refundSource, { status: "supported", entries: [datedIncome] }), monthQuery);
    expect(refundUnknown.dayTotals).toEqual([{ date: "2026-02-02", purchaseAmount: 1000, refundAmount: null, expenseAmount: null, incomeAmount: 3000, differenceAmount: null }]);

    const excludedUndated = selectLedgerActivity(
      workspace(inputs({ transactions: [datedExpense] }), { status: "supported", entries: [income("excluded-undated", 5000, "invalid-time", { input_excluded: true })] }),
      monthQuery,
    );
    expect(excludedUndated.dayTotals).toEqual([{ date: "2026-02-02", purchaseAmount: 1000, refundAmount: 0, expenseAmount: 1000, incomeAmount: 0, differenceAmount: -1000 }]);
  });

  it("marks only totals that an active malformed amount or time can affect", () => {
    const invalidExpense = { ...transaction("invalid-expense", 10000), actual_amount: "10.5", ledger_category: "식비", is_fixed_cost: false };
    const fixedExpense = { ...transaction("fixed", 50000, "2026-02-03T01:00:00Z", "a", 2), ledger_category: "주거비", is_fixed_cost: true };
    const invalidIncome = income("invalid-income", 300000, "not-an-instant", { ledger_category: "급여" });
    const ignoredIncome = income("ignored-income", "20.5", "also-invalid", { input_excluded: true });
    const source = inputs({ transactions: [invalidExpense, fixedExpense] });

    const result = selectLedgerActivity(workspace(source, { status: "supported", entries: [invalidIncome, ignoredIncome] }), monthQuery);

    expect(result.periodTotals).toEqual({ purchaseAmount: null, refundAmount: 0, expenseAmount: null, incomeAmount: null, differenceAmount: null });
    expect(result.categoryTotals).toEqual([
      { category: "주거비", expenseAmount: 50000, fixedCostAmount: 50000 },
      { category: "식비", expenseAmount: null, fixedCostAmount: 0 },
    ]);
    expect(result.reviewReasons).toEqual(["invalid_amount", "invalid_occurred_at"]);

    const expenseOnly = selectLedgerActivity(workspace(source, { status: "supported", entries: [invalidIncome, ignoredIncome] }), { ...monthQuery, kind: "expense" });
    expect(expenseOnly.filteredTotals.incomeAmount).toBe(0);
  });
});
