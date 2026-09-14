import { beforeEach, describe, expect, it, vi } from "vitest";
import { inputs, transaction } from "@/features/card-benefits/replay.fixtures";
import { DEMO_OWNER_ID } from "@/lib/auth/owner-context";
const boundary = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/owner", () => ({ getOwnerContext: async () => ({ ownerId: "synthetic-owner" }), createAuthorizedSupabaseServerClient: async () => ({ rpc: boundary.rpc }) }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => { throw new Error("unexpected direct catalog IO"); } }));

describe("legacy consumers use one v2 snapshot", () => {
  beforeEach(() => { boundary.rpc.mockReset(); boundary.rpc.mockImplementation(async (_name, args) => ({ data: { ownerId: "synthetic-owner", ownerRevision: "8", throughMonth: args.through_month, inputs: inputs({ transactions: Array.from({ length: 1001 }, (_, i) => transaction(`tx-${i}`, 1000, "2026-02-28T14:59:59.999Z", "a", i + 1)) }) }, error: null })); });
  it("final fix: orders exact DB microseconds before stable sequence and keeps KST date filters", async () => {
    const source = inputs({ transactions: [transaction("earlier", 1000, "2026-03-01T00:00:00.123455+09:00", "a", 9), transaction("later", 1000, "2026-02-28T15:00:00.123456Z", "a", 1), transaction("tie", 1000, "2026-03-01T00:00:00.123456+09:00", "a", 2)] });
    boundary.rpc.mockImplementation(async (_name, args) => ({ data: { ownerId: source.ownerId, ownerRevision: "8", throughMonth: args.through_month, inputs: source }, error: null }));
    const { getRecentTransactions } = await import("./queries");
    const result = await getRecentTransactions(source.ownerId, { startDate: "2026-03-01", endDate: "2026-03-01", timezoneOffset: "420" });
    expect(result.map(row => row.id)).toEqual(["tie", "later", "earlier"]);
    expect(result.map(row => row.workspace?.projection.day)).toEqual(["2026-03-01", "2026-03-01", "2026-03-01"]);
  });
  it("filters after full replay and includes the last Seoul millisecond", async () => {
    const { getTransactionsForUserCard } = await import("./queries");
    const result = await getTransactionsForUserCard("synthetic-owner", "a", { startDate: "2026-02-01", endDate: "2026-02-28" });
    expect(result).toHaveLength(1001);
    expect(result[0].workspace?.ownerRevision).toBe("8");
    expect(boundary.rpc.mock.calls[0]).toEqual(["get_ledger_inputs", { through_month: "2026-02" }]);
  });
  it("limits only presentation rows, not replay inputs", async () => {
    const { getRecentTransactions } = await import("./queries");
    const result = await getRecentTransactions("synthetic-owner", { endDate: "2026-02-28" });
    expect(result).toHaveLength(50);
    expect(result[0].workspace).toBeDefined();
  });
  it("rejects a caller-supplied owner mismatch", async () => {
    const { getUserCard } = await import("./queries");
    await expect(getUserCard("other-owner", "a")).rejects.toThrow();
  });
  it("keeps synthetic demo reads entirely separate from user database IO", async () => {
    const { getUserCards, getRecentTransactions } = await import("./queries");
    expect((await getUserCards(DEMO_OWNER_ID)).length).toBeGreaterThan(0);
    expect((await getRecentTransactions(DEMO_OWNER_ID, { userCardId: "demo-everyday", startDate: "2026-02-24", endDate: "2026-02-24" })).map((row) => row.id)).toEqual(["demo-cafe-04"]);
    expect(boundary.rpc).not.toHaveBeenCalled();
  });
});
