import { describe, expect, it } from "vitest";

import { parseQuickTransactionInput } from "@/features/transactions/validation";

describe("parseQuickTransactionInput", () => {
  it("maps quick creation fields to a full transaction input", () => {
    const result = parseQuickTransactionInput({
      occurredAt: "2026-05-27T12:30",
      timezoneOffset: -540,
      merchantName: " 스타벅스 강남R ",
      amount: 12000,
      userCardId: "00000000-0000-4000-8000-000000000001",
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      occurredAt: "2026-05-27T12:30",
      timezoneOffset: -540,
      merchantName: "스타벅스 강남R",
      amount: 12000,
      actualAmount: 12000,
      benefitLabel: "",
      benefitAmount: 0,
      finalAmount: 12000,
      paymentMethod: "credit_card",
      userCardId: "00000000-0000-4000-8000-000000000001",
      isPerformanceEligible: true,
      ledgerCategory: "",
      isFixedCost: false,
      memo: "",
    });
  });
});
