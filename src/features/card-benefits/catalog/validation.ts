import { candidatePackSchema } from "./schema";

/** Public metadata only; success is NOT permission to publish a CardRuleVersion. */
export function validateCandidatePack(input: unknown) {
  return candidatePackSchema.safeParse(input);
}
