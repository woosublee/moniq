import { beforeEach, describe, expect, it, vi } from "vitest";
import { inputs } from "@/features/card-benefits/replay.fixtures";
const boundary = vi.hoisted(() => ({ rpc: vi.fn(), paths: [] as string[], denied: false }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: (path: string) => boundary.paths.push(path) }));
vi.mock("@/lib/auth/owner", () => ({
  getOwnerContext: async () => ({ ownerId: "synthetic-owner", mode: "authenticated", canMutate: !boundary.denied }),
  assertCanMutate: (owner: { canMutate: boolean }) => { if (!owner.canMutate) throw new Error("denied"); },
  createAuthorizedSupabaseServerClient: async () => ({ rpc: boundary.rpc }),
}));
const requestId = "20000000-0000-4000-8000-000000000001";
const id = "10000000-0000-4000-8000-000000000001";
const command = { kind: "transaction.exclude", id, expected_version: "3", excluded: true };
const receipt = { requestId, ownerRevision: "8", resultIds: [id], replayed: false };

describe("mutation RPC boundary (not database atomicity tests)", () => {
  beforeEach(() => { boundary.rpc.mockReset(); boundary.paths.length = 0; boundary.denied = false; });
  it("returns additive unsupported income metadata for an old expense snapshot", async () => {
    boundary.rpc.mockResolvedValueOnce({ data: receipt, error: null }).mockResolvedValueOnce({ data: { ownerId: "synthetic-owner", ownerRevision: "9", throughMonth: "2026-02", inputs: inputs() }, error: null });
    const { applyLedgerCommand } = await import("./mutations");
    expect(await applyLedgerCommand(requestId, command, "2026-02")).toMatchObject({ status: "saved", receipt, workspace: { ownerRevision: "9" }, incomeSource: { status: "unsupported" } });
  });
  it("acknowledges income saved outside the viewed month without requiring its row in that snapshot", async () => {
    const incomeCommand = { kind: "income.create", id, source: { occurred_at: "2026-03-01T00:00:00+09:00", source_name: "Synthetic salary", amount: 3000000, ledger_category: null, memo: null } };
    boundary.rpc.mockResolvedValueOnce({ data: receipt, error: null }).mockResolvedValueOnce({ data: { ownerId: "synthetic-owner", ownerRevision: "9", throughMonth: "2026-02", inputs: inputs(), household: { version: 1, incomes: [] } }, error: null });
    const { applyLedgerCommand } = await import("./mutations");
    expect(await applyLedgerCommand(requestId, incomeCommand, "2026-02")).toMatchObject({ status: "saved", receipt, workspace: { ownerRevision: "9", transactions: [] }, incomeSource: { status: "supported", entries: [] } });
    expect(boundary.rpc.mock.calls).toEqual([["apply_ledger_command", { request_id: requestId, command: incomeCommand }], ["get_ledger_inputs", { through_month: "2026-02" }]]);
  });
  it.each([false, true])("keeps the income receipt but requests review when household support disappears (batch: %s)", async batch => {
    boundary.rpc.mockResolvedValueOnce({ data: receipt, error: null }).mockResolvedValueOnce({ data: { ownerId: "synthetic-owner", ownerRevision: "9", throughMonth: "2026-02", inputs: inputs() }, error: null });
    const { applyLedgerCommand } = await import("./mutations");
    const income = { ...command, kind: "income.exclude" };
    expect(await applyLedgerCommand(requestId, batch ? { kind: "batch", commands: [income] } : income, "2026-02")).toMatchObject({ status: "saved_needs_review", receipt, incomeSource: null });
  });
  it.each(["stale", "malformed-household", "read-failure"])("keeps committed income receipt when post-commit refresh is %s", async (failure) => {
    boundary.rpc.mockResolvedValueOnce({ data: { ...receipt, ownerRevision: "9007199254740993" }, error: null });
    if (failure === "read-failure") boundary.rpc.mockRejectedValueOnce(new Error("read unavailable"));
    else boundary.rpc.mockResolvedValueOnce({ data: { ownerId: "synthetic-owner", ownerRevision: failure === "stale" ? "9007199254740992" : "9007199254740993", throughMonth: "2026-02", inputs: inputs(), household: failure === "malformed-household" ? null : { version: 1, incomes: [] } }, error: null });
    const { applyLedgerCommand } = await import("./mutations");
    expect(await applyLedgerCommand(requestId, { ...command, kind: "income.exclude" }, "2026-02")).toMatchObject({ status: "saved_needs_review", receipt: { resultIds: [id], ownerRevision: "9007199254740993" }, workspace: null, incomeSource: null });
  });
  it.each(["transport", "gateway", "invalid-receipt", "mismatched-request"])("does not claim rejected or committed income on %s uncertainty", async (failure) => {
    if (failure === "transport") boundary.rpc.mockRejectedValueOnce(new Error("lost response"));
    else boundary.rpc.mockResolvedValueOnce({ data: failure === "mismatched-request" ? { ...receipt, requestId: id } : null, error: failure === "gateway" ? { code: "PGRST000", message: "unavailable" } : null });
    const { applyLedgerCommand } = await import("./mutations");
    expect(await applyLedgerCommand(requestId, { ...command, kind: "income.exclude" }, "2026-02")).toMatchObject({ status: "outcome_unknown", requestId, receipt: null, workspace: null, incomeSource: null });
    expect(boundary.rpc).toHaveBeenCalledTimes(1);
    expect(boundary.paths).toEqual([]);
  });
  it("rejects malformed income locally before RPC and invalidation", async () => {
    const { applyLedgerCommand } = await import("./mutations");
    expect(await applyLedgerCommand(requestId, { kind: "income.update", id, expected_version: "1", patch: { user_card_id: id } }, "2026-02")).toMatchObject({ status: "rejected", receipt: null, workspace: null, incomeSource: null });
    expect(boundary.rpc).not.toHaveBeenCalled();
    expect(boundary.paths).toEqual([]);
  });
  it("reuses the supplied request key and returns fresh replay after acknowledgement", async () => {
    boundary.rpc.mockResolvedValueOnce({ data: receipt, error: null }).mockResolvedValueOnce({ data: { ownerId: "synthetic-owner", ownerRevision: "9", throughMonth: "2026-02", inputs: inputs() }, error: null });
    const { applyLedgerCommand } = await import("./mutations");
    const result = await applyLedgerCommand(requestId, command, "2026-02");
    expect(boundary.rpc.mock.calls).toEqual([
      ["apply_ledger_command", { request_id: requestId, command }],
      ["get_ledger_inputs", { through_month: "2026-02" }],
    ]);
    expect(result.status).toBe("saved");
    expect(result.receipt?.ownerRevision).toBe("8");
    expect(result.workspace?.ownerRevision).toBe("9");
    expect(boundary.paths).toEqual(expect.arrayContaining(["/ledger", "/dashboard", "/cards", "/cards/[userCardId]", "/transactions/new"]));
  });
  it("reports committed IDs when only refresh/replay fails", async () => {
    boundary.rpc.mockResolvedValueOnce({ data: receipt, error: null }).mockRejectedValueOnce(new Error("read unavailable"));
    const { applyLedgerCommand } = await import("./mutations");
    const result = await applyLedgerCommand(requestId, command, "2026-02");
    expect(result).toMatchObject({ status: "saved_needs_review", receipt: { resultIds: [id] }, workspace: null });
    expect(boundary.paths).toContain("/transactions/new");
  });
  it("keeps transport failures distinct from rejected commands so a retry uses the same key", async () => {
    boundary.rpc.mockRejectedValue(new Error("lost response"));
    const { applyLedgerCommand } = await import("./mutations");
    expect(await applyLedgerCommand(requestId, command, "2026-02")).toMatchObject({ status: "outcome_unknown", requestId });
    expect(boundary.rpc).toHaveBeenCalledTimes(1);
  });
  it("does not refresh or claim saved after a database rejection", async () => {
    boundary.rpc.mockResolvedValue({ data: null, error: { code: "40001", message: "stale entry version" } });
    const { applyLedgerCommand } = await import("./mutations");
    expect(await applyLedgerCommand(requestId, command, "2026-02")).toMatchObject({ status: "rejected" });
    expect(boundary.rpc).toHaveBeenCalledTimes(1);
    expect(boundary.paths).toEqual([]);
  });
  it("rejects unauthorized writes before RPC", async () => {
    boundary.denied = true;
    const { applyLedgerCommand } = await import("./mutations");
    await expect(applyLedgerCommand(requestId, command, "2026-02")).rejects.toThrow("denied");
    expect(boundary.rpc).not.toHaveBeenCalled();
  });
});
