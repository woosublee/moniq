import { describe, expect, it } from "vitest";

const id = "10000000-0000-4000-8000-000000000001";
const incomeSource = { occurred_at: "2026-02-01T01:00:00Z", source_name: "Synthetic salary", amount: 3000000, ledger_category: "salary", memo: null };
const source = { occurred_at: "2026-02-01T01:00:00Z", merchant_name: "Synthetic shop", amount: 1000, payment_method: "credit_card", user_card_id: id, payment_channel: "unknown", installment_months: null, ledger_category: null, is_fixed_cost: false, memo: null };

describe("finite ledger commands", () => {
  it.each([
    { kind: "income.create", id, source: incomeSource },
    { kind: "income.create", id, source: { ...incomeSource, amount: Number.MAX_SAFE_INTEGER } },
    { kind: "income.update", id, expected_version: "9007199254740993", patch: { memo: null } },
    { kind: "income.update", id, expected_version: 1, patch: { source_name: "Bonus", amount: 1 } },
    { kind: "income.exclude", id, expected_version: "2", excluded: true },
    { kind: "income.exclude", id, expected_version: "3", excluded: false },
  ])("accepts finite income commands without changing their payload: $kind", async (command) => {
    const { ledgerCommandSchema } = await import("./commands");
    expect(ledgerCommandSchema.safeParse(command)).toMatchObject({ success: true, data: command });
  });
  it.each([0, -1, 0.5, 9007199254740992, Infinity, "1000"])("rejects invalid income amount %s on create and patch", async (amount) => {
    const { ledgerCommandSchema } = await import("./commands");
    expect(ledgerCommandSchema.safeParse({ kind: "income.create", id, source: { ...incomeSource, amount } }).success).toBe(false);
    expect(ledgerCommandSchema.safeParse({ kind: "income.update", id, expected_version: "1", patch: { amount } }).success).toBe(false);
  });
  it.each(["owner_id", "id", "stable_sequence", "version", "input_excluded", "user_card_id", "payment_method", "benefit_amount", "actual_amount"])("rejects injected income field %s at every command boundary", async (key) => {
    const { ledgerCommandSchema } = await import("./commands");
    expect(ledgerCommandSchema.safeParse({ kind: "income.create", id, source: { ...incomeSource, [key]: id } }).success).toBe(false);
    expect(ledgerCommandSchema.safeParse({ kind: "income.update", id, expected_version: "1", patch: { memo: null, [key]: id } }).success).toBe(false);
    if (key !== "id") expect(ledgerCommandSchema.safeParse({ kind: "income.create", id, source: incomeSource, [key]: id }).success).toBe(false);
  });
  it.each([
    { source_name: "" }, { source_name: "  " }, { source_name: "a".repeat(201) }, { source_name: null },
    { occurred_at: "not-an-instant" }, { occurred_at: "2026-02-30T01:00:00Z" },
    { ledger_category: "a".repeat(121) }, { memo: "a".repeat(2001) },
  ])("rejects malformed income source and patch %j", async (patch) => {
    const { ledgerCommandSchema } = await import("./commands");
    expect(ledgerCommandSchema.safeParse({ kind: "income.create", id, source: { ...incomeSource, ...patch } }).success).toBe(false);
    expect(ledgerCommandSchema.safeParse({ kind: "income.update", id, expected_version: "1", patch }).success).toBe(false);
  });
  it("rejects an income patch that becomes empty when sent as JSON", async () => {
    const { ledgerCommandSchema } = await import("./commands");
    expect(ledgerCommandSchema.safeParse({ kind: "income.update", id, expected_version: "1", patch: { memo: undefined } }).success).toBe(false);
  });
  it("rejects empty patches, invalid versions, incomplete sources, and repeated income edits", async () => {
    const { ledgerCommandSchema } = await import("./commands");
    for (const expected_version of [0, -1, "9223372036854775808", 9007199254740992]) {
      expect(ledgerCommandSchema.safeParse({ kind: "income.exclude", id, expected_version, excluded: true }).success).toBe(false);
    }
    expect(ledgerCommandSchema.safeParse({ kind: "income.update", id, expected_version: "1", patch: {} }).success).toBe(false);
    expect(ledgerCommandSchema.safeParse({ kind: "income.create", id, source: { amount: 1 } }).success).toBe(false);
    expect(ledgerCommandSchema.safeParse({ kind: "income.exclude", id, expected_version: "1", excluded: "true" }).success).toBe(false);
    const command = { kind: "income.exclude", id, expected_version: "1", excluded: true };
    expect(ledgerCommandSchema.safeParse({ kind: "batch", commands: [command, command] }).success).toBe(false);
  });
  it("allows expense and income in the same batch even with the same UUID in separate tables", async () => {
    const { ledgerCommandSchema } = await import("./commands");
    const command = { kind: "batch", commands: [
      { kind: "transaction.create", id, source }, { kind: "income.create", id, source: incomeSource },
    ] };
    expect(ledgerCommandSchema.safeParse(command)).toMatchObject({ success: true, data: command });
  });
  it("accepts new integer KRW and preserves exact bigint version strings", async () => {
    const { ledgerCommandSchema } = await import("./commands");
    expect(ledgerCommandSchema.parse({ kind: "transaction.create", id, source })).toEqual({ kind: "transaction.create", id, source });
    expect(ledgerCommandSchema.parse({ kind: "transaction.update", id, expected_version: "9007199254740993", patch: { memo: "corrected" } })).toMatchObject({ expected_version: "9007199254740993" });
  });
  it.each([0, -1, 0.5, 9007199254740992, Infinity, "1000"])("rejects invalid new purchase amount %s", async (amount) => {
    const { ledgerCommandSchema } = await import("./commands");
    expect(ledgerCommandSchema.safeParse({ kind: "transaction.create", id, source: { ...source, amount } }).success).toBe(false);
  });
  it.each([
    { kind: "transaction.create", id, source, owner_id: id },
    { kind: "transaction.update", id, expected_version: "1", patch: { benefit_amount: 100 } },
    { kind: "sql", query: "delete from transactions" },
    { kind: "batch", commands: [{ kind: "batch", commands: [] }] },
    { kind: "batch", commands: [] },
    { kind: "batch", commands: Array.from({ length: 101 }, () => ({ kind: "transaction.exclude", id, expected_version: "1", excluded: true })) },
  ])("rejects owner injection, calculated fields and unbounded commands", async (command) => {
    const { ledgerCommandSchema } = await import("./commands");
    expect(ledgerCommandSchema.safeParse(command).success).toBe(false);
  });
  it("rejects repeated entry edits within a batch but allows a new source followed by its refund", async () => {
    const { ledgerCommandSchema } = await import("./commands");
    const edit = { kind: "transaction.exclude", id, expected_version: "1", excluded: true };
    expect(ledgerCommandSchema.safeParse({ kind: "batch", commands: [edit, edit] }).success).toBe(false);
    expect(ledgerCommandSchema.safeParse({ kind: "batch", commands: [
      { kind: "transaction.create", id, source },
      { kind: "refund.create", id: "20000000-0000-4000-8000-000000000001", source: { transaction_id: id, amount: 100, occurred_at: "2026-03-01T01:00:00Z", memo: null } },
    ] }).success).toBe(true);
  });
});
