import type { MoneyValue, RevisionValue } from "@/features/card-benefits/types";
import type { CardWorkspace } from "@/lib/card-workspace/view-model";

/** Raw source values, not household projections or card replay transactions. */
export type IncomeEntryRecord = {
  id: string;
  owner_id: string;
  version: RevisionValue;
  stable_sequence: RevisionValue;
  occurred_at: string;
  source_name: string;
  amount: MoneyValue;
  ledger_category: string | null;
  memo: string | null;
  input_excluded: boolean;
  created_at: string;
  updated_at: string;
};

export type IncomeSource =
  | { status: "supported"; entries: IncomeEntryRecord[] }
  | { status: "unsupported" };

export type LedgerWorkspace = {
  cardWorkspace: CardWorkspace;
  incomeSource: IncomeSource;
};
