import { bizTitaniumCandidate, mizMrTitaniumCandidate } from "./packs";
import { validateCandidatePack } from "./validation";
export { validateCandidatePack } from "./validation";
export type { CandidatePack, CandidatePurchaseModel } from "./schema";

export const publicCardCandidates = [bizTitaniumCandidate, mizMrTitaniumCandidate].map((pack) => {
  const parsed = validateCandidatePack(pack);
  if (!parsed.success) throw parsed.error;
  return parsed.data;
});
const normalize = (value: string) => value.normalize("NFKC").replace(/\s/g, "").toLowerCase();

/** Exact product lookup for source/coverage display, NEVER an executable version selector. */
export function findPublicCardCandidate(card: { issuer: string; name: string }) {
  if (!["kb국민", "kb국민카드", "국민", "국민카드"].includes(normalize(card.issuer))) return null;
  return publicCardCandidates.find((pack) => {
    const name = normalize(card.name).replace(/^kb국민/, "");
    return name === normalize(pack.name) || `${name}카드` === normalize(pack.name);
  }) ?? null;
}
