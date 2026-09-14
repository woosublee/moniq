import { z } from "zod";

import { cardPolicySchema, normalizedQuotaConsumption, policyKeySchema, rewardUnitSchema, wonAmountSchema } from "../policy-schema";

// Exact public source identities, shared by data authoring and envelope validation.
export const publicProductIdentities = {
  "09184": { issuer: "KB국민", productCode: "09184", name: "탄탄대로 Biz 티타늄카드", source: {
    status: "official_document_obtained", documentId: "A-20171012-9120-00096-10",
    url: "https://img2.kbcard.com/obj/card/download/09184__prdctOpmn_20240222.pdf",
    productUrl: "https://card.kbcard.com/CRD/DVIEW/HCAMCXPRICAC0076?mainCC=a&cooperationcode=09184",
    checkedOn: "2026-09-13", pageCount: 4,
  } },
  "09230": { issuer: "KB국민", productCode: "09230", name: "탄탄대로 Miz&Mr 티타늄카드", source: {
    status: "official_document_obtained", documentId: "A-20171206-9120-00436-08",
    url: "https://img2.kbcard.com/obj/card/download/09230__prdctOpmn_20240408.pdf",
    productUrl: "https://card.kbcard.com/CRD/DVIEW/HCAMCXPRICAC0076?mainCC=a&cooperationcode=09230",
    checkedOn: "2026-09-13", pageCount: 3,
  } },
} as const;

const text = z.string().trim().min(1).max(2000);
// Deliberately NOT CardPolicy: the source establishes a rate, not a rounding rule.
// The shape is reused, and policy cross-references are checked by the original validator.
export const candidatePurchaseModelSchema = z.strictObject({
  ...cardPolicySchema.shape,
  benefits: z.array(cardPolicySchema.shape.benefits.element.extend({
    reward: z.strictObject({ kind: z.literal("rate_unverified_rounding"), numerator: z.number().int().min(0).max(100), denominator: z.literal(100), rounding: z.literal("unverified") }),
  })).min(1).max(64),
  cancellation: cardPolicySchema.shape.cancellation.refine(value => value.kind === "unknown", "These sources do not establish an executable cancellation policy"),
}).superRefine((model, ctx) => {
  // Fixed zero is a validation-only structural placeholder, not an inferred rate/floor.
  // Never export this placeholder as a policy or persist it in card_rule_versions.
  const structural = cardPolicySchema.safeParse({ ...model, benefits: model.benefits.map(benefit => ({ ...benefit, reward: { kind: "fixed", amount: 0 } })) });
  if (!structural.success) for (const issue of structural.error.issues) ctx.addIssue({ code: "custom", path: issue.path, message: issue.message });
});
export type CandidatePurchaseModel = z.infer<typeof candidatePurchaseModelSchema>;
export const candidatePackSchema = z.strictObject({
  disposition: z.literal("candidate"),
  issuer: z.literal("KB국민"),
  productCode: z.string().regex(/^\d{5}$/),
  name: text,
  source: z.strictObject({
    status: z.literal("official_document_obtained"),
    documentId: text,
    url: z.url().startsWith("https://img2.kbcard.com/obj/card/download/"),
    productUrl: z.url().startsWith("https://card.kbcard.com/"),
    checkedOn: z.iso.date(),
    pageCount: z.number().int().positive(),
  }),
  effectivePeriod: z.strictObject({ status: z.literal("unverified"), reason: text }),
  purchaseModel: candidatePurchaseModelSchema,
  inputContract: text,
  fuel: z.strictObject({
    status: z.literal("not_implemented"), page: z.number().int().positive(), unit: rewardUnitSchema,
    ratePerLitreByTier: z.strictObject({ base: wonAmountSchema, plus: wonAmountSchema }),
    referencePrice: z.literal("issuer_posted_gasoline"), rounding: z.literal("unverified"),
    eligibleSpendCapByTier: z.strictObject({ base: wonAmountSchema, plus: wonAmountSchema }).nullable(),
    sharedBenefitQuotaKey: policyKeySchema.nullable(),
  }),
  coverage: z.strictObject({
    status: z.literal("partial"),
    verifiedConditions: z.array(text).min(1),
    unsupportedConditions: z.array(text).min(1),
  }),
}).superRefine((pack, ctx) => {
  const identity = publicProductIdentities[pack.productCode as keyof typeof publicProductIdentities];
  if (!identity || pack.name !== identity.name || pack.source.documentId !== identity.source.documentId || pack.source.url !== identity.source.url || pack.source.productUrl !== identity.source.productUrl || pack.source.pageCount !== identity.source.pageCount) {
    ctx.addIssue({ code: "custom", path: ["source"], message: "Exact public product/document identity mismatch" });
  }
  if (pack.fuel.sharedBenefitQuotaKey) {
    const quota = pack.purchaseModel.quotas.find(row => row.key === pack.fuel.sharedBenefitQuotaKey);
    const consumption = quota && normalizedQuotaConsumption(quota);
    if (!consumption || consumption.kind !== "benefit_amount" || JSON.stringify(consumption.unit) !== JSON.stringify(pack.fuel.unit)) {
      ctx.addIssue({ code: "custom", path: ["fuel", "sharedBenefitQuotaKey"], message: "Fuel shares a benefit-amount quota in the same reward unit, not a spend cap" });
    }
  }
});
export type CandidatePack = z.infer<typeof candidatePackSchema>;
