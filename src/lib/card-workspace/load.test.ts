import { beforeEach, describe, expect, it, vi } from "vitest";
import { annotation, card, inputs, membership, monthData, policy, refund, transaction, version } from "@/features/card-benefits/replay.fixtures";

const boundary = vi.hoisted(() => ({ rpc: vi.fn(), owner: "synthetic-owner", requestCaches: [] as Map<string, unknown>[] }));
// Model only React's request memoization boundary; loader, validation and replay stay real.
vi.mock("react", async (importOriginal) => ({
  ...await importOriginal<typeof import("react")>(),
  cache: (fn: (...args: string[]) => unknown) => {
    const values = new Map<string, unknown>();
    boundary.requestCaches.push(values);
    return (...args: string[]) => {
      const key = JSON.stringify(args);
      if (!values.has(key)) values.set(key, fn(...args));
      return values.get(key);
    };
  },
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/owner", () => ({
  getOwnerContext: async () => ({ ownerId: boundary.owner, canMutate: true, mode: "authenticated" }),
  createAuthorizedSupabaseServerClient: async (ownerId: string) => {
    if (ownerId !== boundary.owner) throw new Error("unauthorized");
    return { rpc: boundary.rpc };
  },
}));

function income(overrides = {}) {
  return { id: "income-1", owner_id: "synthetic-owner", version: "9007199254740993", stable_sequence: "9007199254740994", occurred_at: "2026-01-01T01:00:00Z", source_name: "Synthetic salary", amount: "3000000", ledger_category: null, memo: null, input_excluded: false, created_at: "2026-01-01T01:00:00Z", updated_at: "2026-01-01T01:00:00Z", ...overrides };
}

function snapshot() {
  return { ownerId: "synthetic-owner", ownerRevision: "9007199254740993", throughMonth: "2026-02", inputs: inputs({
    ruleVersions: [version("a", policy({ benefits: [{ key: "base", benefitKind: "discount", reward: { kind: "fixed", amount: 100 }, performance: { kind: "none" }, conditions: [], recognitionBasis: "gross", quotaKeys: [], transactionLimit: null }] }))],
    transactions: Array.from({ length: 1001 }, (_, i) => transaction(`tx-${i}`, 1000, "2026-02-02T01:00:00Z", "a", String(i + 1))),
    adjustments: [refund("tx-0", 500, "2026-03-01T01:00:00Z")],
    annotations: [annotation("tx-1", "0.125", "confirmed_benefit", { target_key: null, origin: "legacy_manual", review_status: "needs_review", basis_input_revision: null })],
  }) };
}

describe("single snapshot workspace boundary (RPC mock, not SQL evidence)", () => {
  beforeEach(() => { boundary.rpc.mockReset(); boundary.owner = "synthetic-owner"; boundary.requestCaches.forEach((values) => values.clear()); });
  it("distinguishes an old snapshot from explicitly supported zero income", async () => {
    const loader = await import("./load");
    expect(loader.loadLedgerWorkspace).toBeTypeOf("function");
    boundary.rpc.mockResolvedValueOnce({ data: snapshot(), error: null })
      .mockResolvedValueOnce({ data: { ...snapshot(), household: { version: 1, incomes: [] } }, error: null });
    expect((await loader.loadLedgerWorkspace(boundary.owner, "2026-02")).incomeSource).toEqual({ status: "unsupported" });
    expect((await loader.loadLedgerWorkspace(boundary.owner, "2026-02")).incomeSource).toEqual({ status: "supported", entries: [] });
  });
  it.each([null, undefined, [], {}, { version: 2, incomes: [] }, { version: "1", incomes: [] }, { version: 1 }, { version: 1, incomes: null }, { version: 1, incomes: [{}] }, { version: 1, incomes: [income({ owner_id: "other-owner" })] }])("rejects present malformed/foreign household through the legacy adapter (%j)", async (household) => {
    boundary.rpc.mockResolvedValue({ data: { ...snapshot(), household }, error: null });
    const { loadCardWorkspace } = await import("./load");
    await expect(loadCardWorkspace(boundary.owner, "2026-02")).rejects.toThrow();
  });
  it("preserves raw income records without filtering, rounding, or adding them to card replay", async () => {
    const loader = await import("./load");
    expect(loader.loadLedgerWorkspace).toBeTypeOf("function");
    const entries = [income(), income({ id: "review-income", amount: "9007199254740993.125", occurred_at: "invalid-source-time", input_excluded: true })];
    boundary.rpc.mockResolvedValue({ data: { ...snapshot(), household: { version: 1, incomes: entries } }, error: null });
    const result = await loader.loadLedgerWorkspace(boundary.owner, "2026-02");
    expect(result.incomeSource).toEqual({ status: "supported", entries });
    expect(result.cardWorkspace.replay.transactions).toHaveLength(1001);
    expect(result.cardWorkspace.transactions.some((row) => row.id === "income-1")).toBe(false);
    expect(result.cardWorkspace.totals.actualAmount).toBe(1001000);
    expect(boundary.rpc.mock.calls).toEqual([["get_ledger_inputs", { through_month: "2026-02" }]]);
  });
  it("shares one cached raw snapshot between both adapters but keeps uncached refresh fresh", async () => {
    const loader = await import("./load");
    expect(loader.getLedgerWorkspace).toBeTypeOf("function");
    boundary.rpc.mockResolvedValueOnce({ data: { ...snapshot(), household: { version: 1, incomes: [income()] } }, error: null });
    const [cardWorkspace, ledgerWorkspace] = await Promise.all([loader.getCardWorkspace("2026-02"), loader.getLedgerWorkspace("2026-02")]);
    expect(cardWorkspace).toBe(ledgerWorkspace.cardWorkspace);
    expect(boundary.rpc).toHaveBeenCalledTimes(1);
    boundary.rpc.mockResolvedValueOnce({ data: { ...snapshot(), ownerRevision: "9007199254740994", household: { version: 1, incomes: [] } }, error: null });
    const refreshed = await loader.loadLedgerWorkspace(boundary.owner, "2026-02");
    expect(refreshed.cardWorkspace.ownerRevision).toBe("9007199254740994");
    expect(refreshed.incomeSource).toEqual({ status: "supported", entries: [] });
    expect((await loader.getLedgerWorkspace("2026-02")).cardWorkspace.ownerRevision).toBe("9007199254740993");
    expect(boundary.rpc).toHaveBeenCalledTimes(2);
    // A new request does not inherit the prior request's snapshot.
    boundary.requestCaches.forEach((values) => values.clear());
    boundary.rpc.mockResolvedValueOnce({ data: { ...snapshot(), ownerRevision: "9007199254740995" }, error: null });
    expect((await loader.getCardWorkspace("2026-02")).ownerRevision).toBe("9007199254740995");
    expect(boundary.rpc).toHaveBeenCalledTimes(3);
  });
  it("replays all 1001 inputs and future refunds without coercing source revisions or review notes", async () => {
    const data = snapshot();
    boundary.rpc.mockResolvedValue({ data, error: null });
    const { getCardWorkspace } = await import("./load");
    const result = await getCardWorkspace("2026-02");
    expect(boundary.rpc.mock.calls).toEqual([["get_ledger_inputs", { through_month: "2026-02" }]]);
    expect(result.ownerRevision).toBe("9007199254740993");
    expect(result.replay.transactions).toHaveLength(1001);
    expect(result.replay.transactions.find((t) => t.id === "tx-0")?.netAmount).toBe(500);
    const note = result.transactions.find((t) => t.id === "tx-1")?.workspace?.projection;
    expect(note?.unresolvedAnnotations[0].amount).toBe("0.125");
    expect(note?.unallocatedAnnotations[0].review_status).toBe("needs_review");
    expect(result.transactions[1].benefit_amount).toBe(99999); // historical source stays untouched
    expect(result.totals.actualAmount).toBe(1001000);
    expect(result.totals.benefitAmount).toBeNull(); // unresolved must not become known zero
  });
  it("replays both latest tab inputs against one stable shared quota (not a DB concurrency assertion)", async () => {
    const rules = policy({ performanceScopes: [], quotas: [{ key: "family", sharing: { kind: "shared", contributorSlots: ["self", "partner"] }, limit: { kind: "fixed", amount: 150 } }], benefits: [{ key: "base", benefitKind: "discount", reward: { kind: "fixed", amount: 100 }, performance: { kind: "none" }, conditions: [], recognitionBasis: "gross", quotaKeys: ["family"], transactionLimit: null }] });
    const source = inputs({ cards: [card("a"), card("b")], ruleVersions: [version("a", rules), version("b", rules)], transactions: [transaction("tab-a", 1000, "2026-02-02T01:00:00Z", "a", "1"), transaction("tab-b", 1000, "2026-02-02T01:00:00Z", "b", "2")], memberships: [membership("a", "b", "quota", "family", "family:shared"), membership("b", "a", "quota", "family", "family:shared")], monthInputs: [monthData("2026-02", "quota", "family", { status: "complete" }, "family:shared")] });
    boundary.rpc.mockResolvedValue({ data: { ownerId: source.ownerId, ownerRevision: "2", throughMonth: "2026-02", inputs: source }, error: null });
    const { loadCardWorkspace } = await import("./load");
    const result = await loadCardWorkspace(source.ownerId, "2026-02");
    expect(result.transactions).toHaveLength(2);
    expect(result.transactions.map(row => row.workspace?.benefitAmount)).toEqual([100, 50]);
    expect(result.totals.benefitAmount).toBe(150);
    expect(result.replay.months.at(-1)?.quotas[0].poolKey).toBe(JSON.stringify(["family:shared", "family", "2026-02"]));
  });
  it.each(["different-owner", null])("rejects an unauthorized/null snapshot (%s)", async (ownerId) => {
    boundary.rpc.mockResolvedValue({ data: ownerId ? { ...snapshot(), ownerId } : null, error: null });
    const { getCardWorkspace } = await import("./load");
    await expect(getCardWorkspace("2026-02")).rejects.toThrow();
  });
  it("rejects a truncated/mismatched month envelope rather than replaying partial data", async () => {
    boundary.rpc.mockResolvedValue({ data: { ...snapshot(), throughMonth: "2026-01" }, error: null });
    const { getCardWorkspace } = await import("./load");
    await expect(getCardWorkspace("2026-02")).rejects.toThrow();
  });
});
