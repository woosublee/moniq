import { z } from "zod";
import { monthKeySchema, monthInputSchema, scopeInstanceKeySchema } from "@/features/card-benefits/month-inputs";
import { paymentChannelSchema, policyKeySchema, wonAmountSchema } from "@/features/card-benefits/policy-schema";

export const requestIdSchema = z.uuid();
export const revisionSchema = z.union([z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER), z.string().regex(/^(0|[1-9][0-9]*)$/)])
  .refine((value) => BigInt(value) <= BigInt("9223372036854775807"));
const entryVersion = revisionSchema.refine((value) => BigInt(value) > BigInt(0));
const id = z.uuid();
const day = z.iso.date().refine((value) => value >= "0001-01-01" && value <= "9999-12-31");
const instant = z.iso.datetime({ offset: true }).refine((value) => value.slice(0, 4) !== "0000");
const memo = z.string().max(2000).nullable();
const purchase = z.strictObject({
  occurred_at: instant, merchant_name: z.string().trim().min(1).max(200), amount: wonAmountSchema.refine((n) => n > 0),
  payment_method: z.enum(["cash", "credit_card", "check_card", "points"]), user_card_id: id.nullable(),
  payment_channel: paymentChannelSchema, installment_months: z.number().int().min(1).max(60).nullable(),
  ledger_category: z.string().max(120).nullable(), is_fixed_cost: z.boolean(), memo,
});
const income = z.strictObject({
  occurred_at: instant, source_name: z.string().trim().min(1).max(200), amount: wonAmountSchema.refine((n) => n > 0),
  ledger_category: z.string().max(120).nullable(), memo,
});
const refund = z.strictObject({ transaction_id: id, occurred_at: instant, amount: wonAmountSchema.refine((n) => n > 0), memo });
const annotation = z.strictObject({
  transaction_id: id, target_kind: z.enum(["performance", "benefit_eligible", "confirmed_benefit"]),
  target_key: policyKeySchema, scope_instance_key: scopeInstanceKeySchema.nullable(), amount: wonAmountSchema,
  basis_auto_amount: wonAmountSchema.nullable(), basis_input_revision: revisionSchema, basis_rule_version_id: id.nullable(),
}).refine((value) => value.target_kind === "performance" ? value.scope_instance_key !== null : value.scope_instance_key === null);
const card = z.strictObject({ card_id: id, alias: z.string().trim().max(100).nullable(), last_four: z.string().regex(/^[0-9]{4}$/).nullable().optional(), issued_on: day.nullable().optional(), tracking_started_on: day.nullable().optional() });
const cardPatch = z.strictObject({ alias: z.string().trim().max(100).nullable().optional(), last_four: z.string().regex(/^[0-9]{4}$/).nullable().optional(), issued_on: day.nullable().optional(), tracking_started_on: day.nullable().optional(), sort_order: z.number().int().min(-2147483648).max(2147483647).optional(), target_scope_key: policyKeySchema.nullable().optional(), target_tier_key: policyKeySchema.nullable().optional() });
const membership = z.strictObject({ target_user_card_id: id, contributor_user_card_id: id, rule_version_id: id, scope_kind: z.enum(["performance", "quota"]), scope_key: policyKeySchema, contributor_slot: policyKeySchema.refine((v) => v !== "self"), scope_instance_key: scopeInstanceKeySchema, valid_from_month: monthKeySchema, valid_until_month: monthKeySchema.nullable() });
const edit = { id, expected_version: entryVersion };
export const ledgerEntryCommandSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("income.create"), id, source: income }),
  z.strictObject({ kind: z.literal("income.update"), ...edit, patch: income.partial().refine((v) => Object.values(v).some((value) => value !== undefined)) }),
  z.strictObject({ kind: z.literal("income.exclude"), ...edit, excluded: z.boolean() }),
  z.strictObject({ kind: z.literal("transaction.create"), id, source: purchase }),
  z.strictObject({ kind: z.literal("transaction.update"), ...edit, patch: purchase.partial().refine((v) => Object.keys(v).length > 0) }),
  z.strictObject({ kind: z.literal("transaction.exclude"), ...edit, excluded: z.boolean() }),
  z.strictObject({ kind: z.literal("refund.create"), id, source: refund }),
  z.strictObject({ kind: z.literal("refund.update"), ...edit, source: refund }),
  z.strictObject({ kind: z.literal("refund.void"), ...edit }),
  z.strictObject({ kind: z.literal("annotation.create"), id, source: annotation }),
  z.strictObject({ kind: z.literal("annotation.update"), ...edit, source: annotation }),
  z.strictObject({ kind: z.literal("annotation.void"), ...edit }),
  z.strictObject({ kind: z.literal("card.create"), id, source: card }),
  z.strictObject({ kind: z.literal("card.update"), ...edit, patch: cardPatch.refine((v) => Object.keys(v).length > 0) }),
  z.strictObject({ kind: z.literal("card.default"), ...edit }),
  z.strictObject({ kind: z.literal("card.archive"), ...edit }),
  z.strictObject({ kind: z.literal("month_input.create"), id, source: monthInputSchema }),
  z.strictObject({ kind: z.literal("month_input.update"), ...edit, source: monthInputSchema }),
  z.strictObject({ kind: z.literal("membership.create"), id, source: membership }),
  z.strictObject({ kind: z.literal("membership.update"), ...edit, source: membership }),
  z.strictObject({ kind: z.literal("membership.remove"), ...edit }),
]);
export const ledgerCommandSchema = z.union([
  ledgerEntryCommandSchema,
  z.strictObject({ kind: z.literal("batch"), commands: z.array(ledgerEntryCommandSchema).min(1).max(100) }).superRefine((batch, context) => {
    const seen = new Set<string>();
    batch.commands.forEach((command, index) => {
      const key = `${command.kind.split(".")[0]}:${command.id}`;
      if (seen.has(key)) context.addIssue({ code: "custom", path: ["commands", index], message: "An entry may change only once per batch" });
      seen.add(key);
    });
  }),
]);
export type LedgerCommand = z.infer<typeof ledgerCommandSchema>;
export type LedgerEntryCommand = z.infer<typeof ledgerEntryCommandSchema>;
