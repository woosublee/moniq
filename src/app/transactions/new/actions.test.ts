import { beforeEach, describe, expect, it, vi } from "vitest";
import { inputs } from "@/features/card-benefits/replay.fixtures";
const boundary = vi.hoisted(() => ({ rpc: vi.fn(), paths: [] as string[] }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: (path: string) => boundary.paths.push(path) }));
vi.mock("@/lib/auth/owner", () => ({
  getOwnerContext: async () => ({ ownerId: "synthetic-owner", canMutate: true, mode: "authenticated" }),
  assertCanMutate: () => undefined,
  createAuthorizedSupabaseServerClient: async () => ({ rpc: boundary.rpc }),
}));
const id = "33333333-3333-4333-8333-333333333901";
const requestId = "22222222-2222-4222-8222-222222222901";
function metadata() { const data = new FormData(); data.set("requestId", requestId); data.set("version", "4"); data.set("month", "2026-02"); return data; }
const idle = { status: "idle" as const, message: "" };

describe("transaction action command integration", () => {
  beforeEach(() => {
    boundary.rpc.mockReset(); boundary.paths.length = 0;
    boundary.rpc.mockResolvedValueOnce({ data: { requestId, ownerRevision: "1", resultIds: [id], replayed: false }, error: null })
      .mockResolvedValueOnce({ data: { ownerId: "synthetic-owner", ownerRevision: "1", throughMonth: "2026-02", inputs: inputs() }, error: null });
  });
  it("soft excludes a versioned source through the only writer, never direct DML", async () => {
    const { deleteTransaction } = await import("./actions");
    const result = await deleteTransaction(id, idle, metadata());
    expect(result.status).toBe("success");
    expect(boundary.rpc.mock.calls[0]).toEqual(["apply_ledger_command", { request_id: requestId, command: { kind: "transaction.exclude", id, expected_version: "4", excluded: true } }]);
    expect(boundary.paths).toContain("/cards/[userCardId]");
  });
  it("keeps source decimals and second precision unchanged when editing only a memo", async () => {
    const { updateTransaction } = await import("./actions");
    const data = metadata();
    Object.entries({ amount: "123.456", originalAmount: "123.456", occurredAt: "2026-02-01T10:00", originalLocalOccurredAt: "2026-02-01T10:00", merchantName: "Synthetic", paymentMethod: "cash", userCardId: "", ledgerCategory: "", memo: "corrected" }).forEach(([key, value]) => data.set(key, value));
    await updateTransaction(id, idle, data);
    const command = boundary.rpc.mock.calls[0]?.[1]?.command;
    expect(command).toMatchObject({ kind: "transaction.update", id, expected_version: "4", patch: { memo: "corrected" } });
    expect(command.patch).not.toHaveProperty("amount");
    expect(command.patch).not.toHaveProperty("occurred_at");
    expect(command.patch).not.toHaveProperty("benefit_amount");
  });
  describe.each(["create", "update"] as const)("%s raw payment amount", (operation) => {
    const submit = async (amount: string) => {
      const { createTransaction, updateTransaction } = await import("./actions");
      const data = metadata();
      Object.entries({ entryId: id, amount, originalAmount: "123.456", occurredAt: "2026-02-01T10:00", originalLocalOccurredAt: "2026-02-01T10:00", merchantName: "Synthetic", paymentMethod: "cash", timezoneOffset: "-540" }).forEach(([key, value]) => data.set(key, value));
      return operation === "create" ? createTransaction(idle, data) : updateTransaction(id, idle, data);
    };
    it.each(["1000", "9007199254740991"])("saves exact supported integer %s", async (amount) => {
      expect((await submit(amount)).status).toBe("success");
      const command = boundary.rpc.mock.calls[0][1].command;
      expect((operation === "create" ? command.source : command.patch).amount).toBe(Number(amount));
    });
    it.each(["1000.00000000000001", "9007199254740991.1", "9007199254740992", "1000.0", "1e3", "+1000", " 1000 ", "0", "-1", "", "NaN"])("rejects unsupported raw amount %s before any RPC", async (amount) => {
      expect((await submit(amount)).status).toBe("error");
      expect(boundary.rpc).not.toHaveBeenCalled();
    });
  });
  it("preserves auxiliary payment facts and ledger fields at creation", async () => {
    const { createTransaction } = await import("./actions");
    const data = metadata();
    Object.entries({ entryId: id, amount: "1000", occurredAt: "2026-02-01T10:00", timezoneOffset: "-540", merchantName: "Synthetic", paymentMethod: "cash", userCardId: id, paymentChannel: "online", installmentMonths: "3", ledgerCategory: "식비", isFixedCost: "on", memo: "keep" }).forEach(([key, value]) => data.set(key, value));
    expect((await createTransaction(idle, data)).status).toBe("success");
    expect(boundary.rpc.mock.calls[0][1].command.source).toMatchObject({ payment_channel: "online", installment_months: 3, user_card_id: null, ledger_category: "식비", is_fixed_cost: true, memo: "keep" });
  });
  it("accepts a date without inventing the current time and reports saved calculation feedback", async () => {
    const { createTransaction } = await import("./actions");
    const data = metadata();
    Object.entries({ entryId: id, amount: "1000", occurredAt: "2026-02-01", merchantName: "Synthetic", paymentMethod: "cash" }).forEach(([key, value]) => data.set(key, value));
    expect((await createTransaction(idle, data)).status).toBe("success");
    expect(boundary.rpc.mock.calls[0][1].command.source.occurred_at).toBe("2026-01-31T15:00:00.000Z");
  });
  it("returns a short calculation follow-up without claiming an absent projection is zero", async () => {
    const { createTransaction } = await import("./actions");
    const data = metadata(); Object.entries({ entryId: id, amount: "1000", occurredAt: "2026-02-01", merchantName: "Synthetic", paymentMethod: "cash" }).forEach(([key, value]) => data.set(key, value));
    const result = await createTransaction(idle, data);
    expect(result.feedback).toMatchObject({ transactionId: id, benefit: "확인 필요", performance: "확인 필요" });
  });
  it("rejects impossible dates rather than rolling February into March", async () => {
    const { createTransaction } = await import("./actions");
    const data = metadata();
    Object.entries({ entryId: id, amount: "1000", occurredAt: "2026-02-30T10:00", merchantName: "Synthetic", paymentMethod: "cash" }).forEach(([key, value]) => data.set(key, value));
    expect((await createTransaction(idle, data)).status).toBe("error");
    expect(boundary.rpc).not.toHaveBeenCalled();
  });
  it("rejects missing stable request metadata instead of creating a fresh server UUID", async () => {
    const { deleteTransaction } = await import("./actions");
    expect((await deleteTransaction(id, idle, new FormData())).status).toBe("error");
    expect(boundary.rpc).not.toHaveBeenCalled();
  });
});
