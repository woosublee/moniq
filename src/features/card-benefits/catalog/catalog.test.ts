import { describe, expect, it } from "vitest";
import * as catalog from "./index";

describe("public product candidates", () => {
  it("makes only the two exact KB titanium product sources discoverable", () => {
    expect(catalog?.publicCardCandidates).toHaveLength(2);
    expect(catalog?.findPublicCardCandidate({ issuer: "KB국민", name: "탄탄대로 Biz 티타늄카드" })).toMatchObject({
      productCode: "09184", disposition: "candidate", effectivePeriod: { status: "unverified" },
      source: { documentId: "A-20171012-9120-00096-10", url: "https://img2.kbcard.com/obj/card/download/09184__prdctOpmn_20240222.pdf" },
    });
    expect(catalog?.findPublicCardCandidate({ issuer: "KB국민", name: "탄탄대로 Miz&Mr 티타늄카드" })).toMatchObject({
      productCode: "09230", disposition: "candidate", effectivePeriod: { status: "unverified" },
      source: { documentId: "A-20171206-9120-00436-08", url: "https://img2.kbcard.com/obj/card/download/09230__prdctOpmn_20240408.pdf" },
    });
  });

  it("refuses neighboring product and issuer substitution", () => {
    for (const name of ["탄탄대로 올쇼핑", "탄탄대로 Biz카드", "탄탄대로 Miz&Mr", "탄탄대로 Biz 티타늄 리뉴얼"]) {
      expect(catalog?.findPublicCardCandidate({ issuer: "KB국민", name })).toBeNull();
    }
    expect(catalog?.findPublicCardCandidate({ issuer: "다른 카드사", name: "탄탄대로 Biz 티타늄카드" })).toBeNull();
  });

  it("rejects a source from the other product even if the envelope has a valid shape", () => {
    const [biz, miz] = catalog.publicCardCandidates;
    expect(catalog.validateCandidatePack({ ...biz, source: miz.source }).success).toBe(false);
    expect(catalog.validateCandidatePack({ ...biz, source: { ...biz.source, url: miz.source.url } }).success).toBe(false);
    expect(catalog.validateCandidatePack({ ...biz, name: "탄탄대로 올쇼핑" }).success).toBe(false);
  });

  it("preserves rate evidence without admitting an executable reward into the candidate", () => {
    const pack = catalog.publicCardCandidates[0];
    const reward = pack.purchaseModel.benefits[0].reward;
    expect(reward).toMatchObject({ numerator: 15, denominator: 100, rounding: "unverified" });
    const benefits = pack.purchaseModel.benefits.map(row => ({ ...row, reward: { kind: "rate", numerator: 15, denominator: 100, roundingUnit: 1 } }));
    expect(catalog.validateCandidatePack({ ...pack, purchaseModel: { ...pack.purchaseModel, benefits } }).success).toBe(false);
    const parsed = catalog.validateCandidatePack(pack);
    expect(parsed.success && parsed.data.purchaseModel.benefits[0].reward).toEqual(reward);
  });

  it("validates candidates without permitting guessed effective dates, executable status or user data", () => {
    const pack = catalog?.findPublicCardCandidate({ issuer: "KB국민", name: "탄탄대로 Biz 티타늄카드" });
    expect(catalog?.validateCandidatePack(pack).success).toBe(true);
    for (const extra of [
      { disposition: "published" }, { effectivePeriod: { status: "verified", from: "2024-02-22" } },
      { ownerId: "synthetic-owner" }, { transactions: [] },
    ]) {
      expect(catalog?.validateCandidatePack({ ...(pack as object), ...extra }).success).toBe(false);
    }
  });
});
