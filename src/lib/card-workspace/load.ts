import "server-only";
import { cache } from "react";
import { z } from "zod";
import { replayLedger } from "@/features/card-benefits/replay";
import type { ReplayInputs } from "@/features/card-benefits/engine-types";
import { monthKeySchema } from "@/features/card-benefits/month-inputs";
import type { LedgerWorkspace } from "@/features/ledger/types";
import { createAuthorizedSupabaseServerClient, getOwnerContext } from "@/lib/auth/owner";
import { revisionSchema } from "./commands";
import { buildCardWorkspace } from "./view-model";

const money = z.union([z.number().safe(), z.string().regex(/^-?[0-9]+(?:\.[0-9]+)?$/)]);
const row = z.looseObject({ id: z.string(), owner_id: z.string(), version: revisionSchema });
const cardRow = row.extend({ card_id: z.string(), card: z.looseObject({ id: z.string() }), archived_at: z.string().nullable(), tracking_started_on: z.string().nullable(), target_scope_key: z.string().nullable(), target_tier_key: z.string().nullable() });
const transactionRow = row.extend({ amount: money, actual_amount: money, benefit_amount: money, final_amount: money, eligible_spend_amount: money,
  stable_sequence: revisionSchema, occurred_at: z.string(), merchant_name: z.string(), user_card_id: z.string().nullable(), origin: z.enum(["new", "legacy"]), input_excluded: z.boolean(), legacy_review_required: z.boolean(), payment_channel: z.string(), installment_months: z.number().int().nullable() });
const inputsSchema = z.object({
  ownerId: z.string(), startMonth: monthKeySchema, cards: z.array(cardRow),
  ruleVersions: z.array(z.looseObject({ id: z.string(), card_id: z.string(), version_order: z.number().int(), policy_json: z.unknown(), publication_status: z.string(), verification_status: z.string(), effective_from: z.string().nullable(), effective_until: z.string().nullable() })),
  transactions: z.array(transactionRow),
  adjustments: z.array(row.extend({ transaction_id: z.string(), amount: money, occurred_at: z.string(), stable_sequence: revisionSchema, voided_at: z.string().nullable() })),
  annotations: z.array(row.extend({ transaction_id: z.string(), amount: money, target_kind: z.string(), target_key: z.string().nullable(), scope_instance_key: z.string().nullable(), review_status: z.string(), origin: z.string(), basis_auto_amount: money.nullable(), basis_input_revision: revisionSchema.nullable(), voided_at: z.string().nullable() })),
  memberships: z.array(row.extend({ target_user_card_id: z.string(), contributor_user_card_id: z.string(), rule_version_id: z.string(), scope_key: z.string(), scope_kind: z.string(), scope_instance_key: z.string(), contributor_slot: z.string(), valid_from_month: z.string(), valid_until_month: z.string().nullable() })),
  monthInputs: z.array(row.extend({ month: z.string(), scope_kind: z.string(), scope_key: z.string(), scope_instance_key: z.string(), data_status: z.string(), amount: money.nullable() })),
  merchantRules: z.array(z.looseObject({ id: z.string(), keyword: z.string(), normalized_merchant_name: z.string(), ledger_category: z.string().nullable(), priority: z.number(), is_active: z.boolean() })),
});
const incomeRow = row.extend({
  stable_sequence: revisionSchema, occurred_at: z.string(), source_name: z.string(), amount: money,
  ledger_category: z.string().nullable(), memo: z.string().nullable(), input_excluded: z.boolean(),
  created_at: z.string(), updated_at: z.string(),
});
const householdSchema = z.object({ version: z.literal(1), incomes: z.array(incomeRow) });
const snapshotSchema = z.object({
  ownerId: z.string(), ownerRevision: revisionSchema, throughMonth: monthKeySchema, inputs: inputsSchema,
  household: householdSchema.optional(),
}).refine((snapshot) => !Object.hasOwn(snapshot, "household") || snapshot.household !== undefined, {
  message: "Present household must be a versioned income snapshot",
});

/** Deliberately uncached: mutations must read a fresh snapshot after their commit. */
export async function loadLedgerWorkspace(ownerId: string, month: string): Promise<LedgerWorkspace> {
  const throughMonth = monthKeySchema.parse(month);
  const supabase = await createAuthorizedSupabaseServerClient(ownerId);
  const { data, error } = await supabase.rpc("get_ledger_inputs", { through_month: throughMonth });
  if (error) throw new Error(error.message);
  const snapshot = snapshotSchema.parse(data);
  if (snapshot.ownerId !== ownerId || snapshot.inputs.ownerId !== ownerId || snapshot.throughMonth !== throughMonth || snapshot.inputs.startMonth > throughMonth) throw new Error("Invalid ledger snapshot scope");
  for (const rows of [snapshot.inputs.cards, snapshot.inputs.transactions, snapshot.inputs.adjustments, snapshot.inputs.annotations, snapshot.inputs.memberships, snapshot.inputs.monthInputs, snapshot.household?.incomes ?? []]) {
    if (rows.some((row) => row.owner_id !== ownerId)) throw new Error("Invalid ledger snapshot owner");
  }
  const inputs = snapshot.inputs as unknown as ReplayInputs;
  return {
    cardWorkspace: buildCardWorkspace(inputs, snapshot.ownerRevision, throughMonth, replayLedger(inputs, throughMonth)),
    incomeSource: snapshot.household ? { status: "supported", entries: snapshot.household.incomes } : { status: "unsupported" },
  };
}
const loadWithinRequest = cache(loadLedgerWorkspace);
/** React render/request memoization only. Never use a persistent Next data cache here. */
export async function getLedgerWorkspace(month: string): Promise<LedgerWorkspace> {
  const owner = await getOwnerContext();
  return loadWithinRequest(owner.ownerId, monthKeySchema.parse(month));
}
/** Compatibility adapters keep the card-only result and share the common source path. */
export async function loadCardWorkspace(ownerId: string, month: string) {
  return (await loadLedgerWorkspace(ownerId, month)).cardWorkspace;
}
export async function getCardWorkspace(month: string) {
  return (await getLedgerWorkspace(month)).cardWorkspace;
}
