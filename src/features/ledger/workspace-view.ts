import { parseMonth, type MonthKey } from "@/features/card-benefits/periods";
import type { CardsSearchParams } from "@/features/cards/workspace-view";
import {
  buildLedgerActivity,
  paginateLedgerRows,
  sortLedgerRows,
  type LedgerActivityRow,
  type LedgerReviewReason,
} from "@/features/ledger/projection";
import type { LedgerWorkspace } from "@/features/ledger/types";
import type { PaymentMethod } from "@/features/transactions/types";
import { sumKnown } from "@/lib/card-workspace/view-model";

export type LedgerQuery = {
  period:
    | { kind: "month"; month: MonthKey }
    | { kind: "range"; startDate: string; endDate: string };
  query: string;
  category: string;
  paymentMethod: "" | PaymentMethod;
  card: string;
  kind: "all" | "expense" | "income" | "refund";
  page: number;
};

export type HouseholdTotals = {
  purchaseAmount: number | null;
  refundAmount: number | null;
  expenseAmount: number | null;
  incomeAmount: number | null;
  differenceAmount: number | null;
};

export type LedgerDayTotal = HouseholdTotals & { date: string };
export type LedgerCategoryTotal = {
  category: string | null;
  expenseAmount: number | null;
  fixedCostAmount: number | null;
};

export type HouseholdProjection = {
  rows: LedgerActivityRow[];
  totalCount: number;
  page: number;
  pageCount: number;
  period: LedgerQuery["period"];
  throughMonth: MonthKey;
  periodTotals: HouseholdTotals;
  filteredTotals: HouseholdTotals;
  dayTotals: LedgerDayTotal[];
  categoryTotals: LedgerCategoryTotal[];
  incomeSourceStatus: LedgerWorkspace["incomeSource"]["status"];
  canAddIncome: boolean;
  reviewReasons: LedgerReviewReason[];
};

const paymentMethods: readonly PaymentMethod[] = ["cash", "credit_card", "check_card", "points"];
const ledgerKinds: readonly LedgerQuery["kind"][] = ["all", "expense", "income", "refund"];

function single(params: CardsSearchParams, key: string) {
  return typeof params[key] === "string" ? params[key] : "";
}

function parseDate(value: string): string | null {
  const match = /^(?!0000)(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : null;
}

export function parseLedgerQuery(params: CardsSearchParams, fallbackMonth: MonthKey): LedgerQuery {
  const startDate = parseDate(single(params, "startDate"));
  const endDate = parseDate(single(params, "endDate"));
  const month = parseMonth(single(params, "month")) ?? fallbackMonth;
  const paymentMethod = single(params, "paymentMethod");
  const kind = single(params, "kind");
  const page = single(params, "page");
  const period = startDate && endDate && startDate <= endDate
    ? { kind: "range" as const, startDate, endDate }
    : { kind: "month" as const, month };

  const card = Object.hasOwn(params, "card") ? single(params, "card") : single(params, "userCardId");
  return {
    period,
    query: single(params, "query").trim().slice(0, 200),
    category: single(params, "category").slice(0, 120),
    paymentMethod: paymentMethods.includes(paymentMethod as PaymentMethod) ? paymentMethod as PaymentMethod : "",
    card: card.slice(0, 100),
    kind: ledgerKinds.includes(kind as LedgerQuery["kind"]) ? kind as LedgerQuery["kind"] : "all",
    page: /^[1-9]\d{0,5}$/.test(page) ? Number(page) : 1,
  };
}

export function ledgerQueryEndMonth(state: LedgerQuery): MonthKey {
  return state.period.kind === "month"
    ? state.period.month
    : state.period.endDate.slice(0, 7) as MonthKey;
}

export function ledgerQueryHref(state: LedgerQuery, patch: Partial<LedgerQuery> = {}) {
  const next = { ...state, page: Object.keys(patch).length === 0 ? state.page : 1, ...patch };
  const params = new URLSearchParams();
  if (next.period.kind === "month") params.set("month", next.period.month);
  else {
    params.set("startDate", next.period.startDate);
    params.set("endDate", next.period.endDate);
  }
  if (next.query) params.set("query", next.query);
  if (next.category) params.set("category", next.category);
  if (next.paymentMethod) params.set("paymentMethod", next.paymentMethod);
  if (next.card) params.set("card", next.card);
  if (next.kind !== "all") params.set("kind", next.kind);
  if (next.page > 1) params.set("page", String(next.page));
  return `/ledger?${params}`;
}

type TotalsResult = { totals: HouseholdTotals; overflow: boolean };
type UndatedUncertainty = { expense: boolean; refund: boolean; income: boolean };
const noUndatedUncertainty: UndatedUncertainty = { expense: false, refund: false, income: false };

function contribution(row: LedgerActivityRow): number | null {
  if (row.economicExcluded) return 0;
  if (row.day === null) return null;
  return row.amount;
}

function total(values: readonly (number | null)[]) {
  const amount = sumKnown(values);
  return { amount, overflow: amount === null && values.length > 0 && values.every((value) => value !== null) };
}

function householdTotals(
  rows: readonly LedgerActivityRow[],
  incomeUnknown: boolean,
  undated: UndatedUncertainty = noUndatedUncertainty,
): TotalsResult {
  const purchase = total([
    ...rows.filter((row) => row.kind === "expense").map(contribution),
    ...(undated.expense ? [null] : []),
  ]);
  const refund = total([
    ...rows.filter((row) => row.kind === "refund").map(contribution),
    ...(undated.refund ? [null] : []),
  ]);
  const income = total([
    ...rows.filter((row) => row.kind === "income").map(contribution),
    ...(incomeUnknown || undated.income ? [null] : []),
  ]);
  const expense = total([purchase.amount, refund.amount === null ? null : -refund.amount]);
  const difference = total([income.amount, expense.amount === null ? null : -expense.amount]);
  return {
    totals: {
      purchaseAmount: purchase.amount,
      refundAmount: refund.amount,
      expenseAmount: expense.amount,
      incomeAmount: income.amount,
      differenceAmount: difference.amount,
    },
    overflow: purchase.overflow || refund.overflow || income.overflow || expense.overflow || difference.overflow,
  };
}

function inPeriod(row: LedgerActivityRow, period: LedgerQuery["period"]) {
  if (row.day === null) return true;
  return period.kind === "month"
    ? row.day.slice(0, 7) === period.month
    : row.day >= period.startDate && row.day <= period.endDate;
}

function incomeCanMatch(state: LedgerQuery) {
  return (state.kind === "all" || state.kind === "income") && !state.card && !state.paymentMethod;
}

function matchesSearch(row: LedgerActivityRow, query: string) {
  if (!query) return true;
  const sourceName = row.kind === "income" ? row.income.source_name : row.transaction?.merchant_name ?? "";
  return [sourceName, row.category ?? "", row.cardName ?? "", row.cardAlias ?? ""]
    .join(" ")
    .toLocaleLowerCase()
    .includes(query.toLocaleLowerCase());
}

function matchesFilters(row: LedgerActivityRow, state: LedgerQuery) {
  return (state.kind === "all" || row.kind === state.kind)
    && (!state.category || row.category === state.category)
    && (!state.paymentMethod || row.paymentMethod === state.paymentMethod)
    && (!state.card || row.cardId === state.card)
    && matchesSearch(row, state.query);
}

function dayTotals(rows: readonly LedgerActivityRow[], incomeUnknown: boolean) {
  const groups = new Map<string, LedgerActivityRow[]>();
  const undated: UndatedUncertainty = { expense: false, refund: false, income: false };
  for (const row of rows) {
    if (row.day === null) {
      if (!row.economicExcluded) undated[row.kind] = true;
      continue;
    }
    const group = groups.get(row.day) ?? [];
    group.push(row);
    groups.set(row.day, group);
  }
  let overflow = false;
  const totals = [...groups.entries()].sort(([a], [b]) => b.localeCompare(a)).map(([date, values]) => {
    const result = householdTotals(values, incomeUnknown, undated);
    overflow ||= result.overflow;
    return { date, ...result.totals };
  });
  return { totals, overflow };
}

function categoryTotals(rows: readonly LedgerActivityRow[]) {
  const groups = new Map<string | null, LedgerActivityRow[]>();
  for (const row of rows) {
    if (row.kind === "income") continue;
    const group = groups.get(row.category) ?? [];
    group.push(row);
    groups.set(row.category, group);
  }

  let overflow = false;
  const totals = [...groups.entries()].map(([category, values]) => {
    const expenses = householdTotals(values, false);
    const fixed = householdTotals(values.filter((row) => row.isFixedCost), false);
    overflow ||= expenses.overflow || fixed.overflow;
    return { category, expenseAmount: expenses.totals.expenseAmount, fixedCostAmount: fixed.totals.expenseAmount };
  }).sort((a, b) => {
    if (a.expenseAmount === b.expenseAmount) return (a.category ?? "").localeCompare(b.category ?? "");
    if (a.expenseAmount === null) return 1;
    if (b.expenseAmount === null) return -1;
    return b.expenseAmount - a.expenseAmount;
  });
  return { totals, overflow };
}

export function selectLedgerActivity(workspace: LedgerWorkspace, state: LedgerQuery): HouseholdProjection {
  const allRows = buildLedgerActivity(workspace);
  const periodRows = allRows.filter((row) => inPeriod(row, state.period));
  const period = householdTotals(periodRows, workspace.incomeSource.status === "unsupported");
  const filteredRows = periodRows.filter((row) => matchesFilters(row, state));
  const filtered = householdTotals(filteredRows, workspace.incomeSource.status === "unsupported" && incomeCanMatch(state));
  const days = dayTotals(filteredRows, workspace.incomeSource.status === "unsupported" && incomeCanMatch(state));
  const categories = categoryTotals(filteredRows);
  const sortedRows = sortLedgerRows(filteredRows, (row) => row.key);
  const page = paginateLedgerRows(sortedRows, state.page);
  const reviewReasons = new Set(periodRows.flatMap((row) => row.reviewReasons));
  if (workspace.incomeSource.status === "unsupported") reviewReasons.add("income_source_unsupported");
  if (period.overflow || filtered.overflow || days.overflow || categories.overflow) reviewReasons.add("precision_unknown");

  return {
    ...page,
    period: state.period,
    throughMonth: ledgerQueryEndMonth(state),
    periodTotals: period.totals,
    filteredTotals: filtered.totals,
    dayTotals: days.totals,
    categoryTotals: categories.totals,
    incomeSourceStatus: workspace.incomeSource.status,
    canAddIncome: workspace.incomeSource.status === "supported",
    reviewReasons: [...reviewReasons].sort(),
  };
}
