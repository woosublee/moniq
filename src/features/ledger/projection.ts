import { readIntegerAmount } from "@/features/card-benefits/money";
import { compareLedgerChronology, parseSeoulInstant } from "@/features/card-benefits/periods";
import type { MoneyValue, RevisionValue } from "@/features/card-benefits/types";
import type { IncomeEntryRecord, LedgerWorkspace } from "@/features/ledger/types";
import type { LedgerTransactionRecord, PaymentMethod, TransactionAdjustmentRecord, TransactionRecord } from "@/features/transactions/types";

export const LEDGER_PAGE_SIZE = 50;

export type LedgerEntryRef = {
  kind: "expense" | "income" | "refund";
  id: string;
  version: RevisionValue;
};

export type LedgerReviewReason =
  | "income_source_unsupported"
  | "invalid_amount"
  | "invalid_occurred_at"
  | "missing_refund_source"
  | "precision_unknown";

type LedgerActivityBase = {
  id: string;
  key: string;
  ref: LedgerEntryRef;
  occurredAt: string;
  stableSequence: RevisionValue;
  day: string | null;
  rawAmount: MoneyValue;
  amount: number | null;
  category: string | null;
  paymentMethod: PaymentMethod | null;
  cardId: string | null;
  cardName: string | null;
  cardAlias: string | null;
  isFixedCost: boolean;
  economicExcluded: boolean;
  reviewReasons: LedgerReviewReason[];
};

export type ExpenseLedgerActivityRow = LedgerActivityBase & {
  kind: "expense";
  transaction: LedgerTransactionRecord;
  cardTransaction: TransactionRecord | null;
};

export type RefundLedgerActivityRow = LedgerActivityBase & {
  kind: "refund";
  transaction: LedgerTransactionRecord | null;
  refund: TransactionAdjustmentRecord;
  originalRef: LedgerEntryRef | null;
  cardTransaction: TransactionRecord | null;
};

export type IncomeLedgerActivityRow = LedgerActivityBase & {
  kind: "income";
  income: IncomeEntryRecord;
};

export type LedgerActivityRow =
  | ExpenseLedgerActivityRow
  | RefundLedgerActivityRow
  | IncomeLedgerActivityRow;

type SortableLedgerRow = {
  id: string;
  occurredAt: string;
  stableSequence?: RevisionValue;
};

export function sortLedgerRows<T extends SortableLedgerRow>(
  rows: readonly T[],
  identity: (row: T) => string = (row) => row.id,
): T[] {
  return [...rows].sort((a, b) => compareLedgerChronology(
    { id: identity(b), occurred_at: b.occurredAt, stable_sequence: b.stableSequence },
    { id: identity(a), occurred_at: a.occurredAt, stable_sequence: a.stableSequence },
  ));
}

export function paginateLedgerRows<T>(rows: readonly T[], requestedPage: number, pageSize = LEDGER_PAGE_SIZE) {
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const page = Math.min(requestedPage, pageCount);
  return {
    rows: rows.slice((page - 1) * pageSize, page * pageSize),
    totalCount: rows.length,
    page,
    pageCount,
  };
}

function amountReason(value: MoneyValue): LedgerReviewReason | null {
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) return "precision_unknown";
    return value <= 0 ? "invalid_amount" : null;
  }
  if (/^\d+$/.test(value) && BigInt(value) > BigInt(Number.MAX_SAFE_INTEGER)) return "precision_unknown";
  const amount = readIntegerAmount(value);
  return amount === null || amount <= 0 ? "invalid_amount" : null;
}

function projectAmount(value: MoneyValue, economicExcluded: boolean) {
  const reason = amountReason(value);
  return {
    amount: economicExcluded ? 0 : reason ? null : readIntegerAmount(value),
    reason,
  };
}

function occurredAtProjection(value: string) {
  const parsed = parseSeoulInstant(value);
  return {
    day: parsed?.day ?? null,
    reason: parsed ? null : "invalid_occurred_at" as const,
  };
}

function dimensions(transaction: TransactionRecord | null) {
  const card = transaction?.user_cards ?? null;
  return {
    category: transaction?.ledger_category ?? null,
    paymentMethod: transaction?.payment_method ?? null,
    cardId: transaction?.user_card_id ?? null,
    cardName: card?.card.name ?? null,
    cardAlias: card?.alias ?? null,
    isFixedCost: transaction?.is_fixed_cost ?? false,
  };
}

function reviewReasons(...values: (LedgerReviewReason | null)[]) {
  return [...new Set(values.filter((value): value is LedgerReviewReason => value !== null))].sort();
}

export function buildLedgerActivity(workspace: LedgerWorkspace): LedgerActivityRow[] {
  const { cardWorkspace } = workspace;
  const transactions = new Map(cardWorkspace.inputs.transactions.map((transaction) => [transaction.id, transaction]));
  const cardTransactions = new Map(cardWorkspace.transactions.map((transaction) => [transaction.id, transaction]));

  const expenses: ExpenseLedgerActivityRow[] = cardWorkspace.inputs.transactions.map((transaction) => {
    const economicExcluded = transaction.input_excluded;
    const occurred = occurredAtProjection(transaction.occurred_at);
    const projected = projectAmount(transaction.actual_amount, economicExcluded);
    const cardTransaction = cardTransactions.get(transaction.id) ?? null;
    return {
      id: transaction.id,
      key: `expense:${transaction.id}`,
      ref: { kind: "expense", id: transaction.id, version: transaction.version },
      kind: "expense",
      occurredAt: transaction.occurred_at,
      stableSequence: transaction.stable_sequence,
      day: occurred.day,
      rawAmount: transaction.actual_amount,
      amount: projected.amount,
      ...dimensions(cardTransaction ?? transaction),
      economicExcluded,
      reviewReasons: reviewReasons(occurred.reason, projected.reason),
      transaction,
      cardTransaction,
    };
  });

  const refunds: RefundLedgerActivityRow[] = cardWorkspace.inputs.adjustments.map((refund) => {
    const transaction = transactions.get(refund.transaction_id) ?? null;
    const cardTransaction = transaction ? cardTransactions.get(transaction.id) ?? null : null;
    const economicExcluded = refund.voided_at !== null || transaction === null || transaction.input_excluded;
    const occurred = occurredAtProjection(refund.occurred_at);
    const projected = projectAmount(refund.amount, economicExcluded);
    return {
      id: refund.id,
      key: `refund:${refund.id}`,
      ref: { kind: "refund", id: refund.id, version: refund.version },
      kind: "refund",
      occurredAt: refund.occurred_at,
      stableSequence: refund.stable_sequence,
      day: occurred.day,
      rawAmount: refund.amount,
      amount: projected.amount,
      ...dimensions(cardTransaction ?? transaction),
      economicExcluded,
      reviewReasons: reviewReasons(occurred.reason, projected.reason, transaction ? null : "missing_refund_source"),
      transaction,
      refund,
      originalRef: transaction ? { kind: "expense", id: transaction.id, version: transaction.version } : null,
      cardTransaction,
    };
  });

  const incomes: IncomeLedgerActivityRow[] = workspace.incomeSource.status === "supported"
    ? workspace.incomeSource.entries.map((income) => {
      const economicExcluded = income.input_excluded;
      const occurred = occurredAtProjection(income.occurred_at);
      const projected = projectAmount(income.amount, economicExcluded);
      return {
        id: income.id,
        key: `income:${income.id}`,
        ref: { kind: "income", id: income.id, version: income.version },
        kind: "income",
        occurredAt: income.occurred_at,
        stableSequence: income.stable_sequence,
        day: occurred.day,
        rawAmount: income.amount,
        amount: projected.amount,
        category: income.ledger_category,
        paymentMethod: null,
        cardId: null,
        cardName: null,
        cardAlias: null,
        isFixedCost: false,
        economicExcluded,
        reviewReasons: reviewReasons(occurred.reason, projected.reason),
        income,
      };
    })
    : [];

  return [...expenses, ...refunds, ...incomes];
}
