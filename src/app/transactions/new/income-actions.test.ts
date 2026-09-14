import { beforeEach, describe, expect, it, vi } from "vitest";
import { inputs } from "@/features/card-benefits/replay.fixtures";
import type { IncomeEntryRecord } from "@/features/ledger/types";
import type { LedgerEntryCommand } from "@/lib/card-workspace/commands";
import { loadLedgerWorkspace } from "@/lib/card-workspace/load";
import { createLedgerFormAttempt } from "@/components/transactions/ledger-request-fields";
import * as actions from "./actions";

const io = vi.hoisted(() => ({ rpc: vi.fn(), denied: false }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/owner", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/auth/owner")>(),
  getOwnerContext: async () => io.denied
    ? ({ ownerId: "00000000-0000-4000-8000-000000000999", mode: "demo", canMutate: false })
    : ({ ownerId: "synthetic-owner", mode: "authenticated", canMutate: true }),
  createAuthorizedSupabaseServerClient: async () => ({ rpc: io.rpc }),
}));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: vi.fn() }));
const id = "10000000-0000-4000-8000-000000000016";
const idle = { status: "idle" as const, message: "" };
function form(values: Record<string, string> = {}) {
  const data = new FormData();
  for (const [key, value] of Object.entries({ requestId: crypto.randomUUID(), entryId: id, version: "4", month: "2026-02", sourceName: "  Synthetic salary  ", amount: "3000000", occurredAt: "2026-02-25", ledgerCategory: "급여", memo: "original", ...values })) data.set(key, value);
  return data;
}
const original: IncomeEntryRecord = { id, owner_id: "synthetic-owner", version: "4", stable_sequence: "2", occurred_at: "2026-02-24T15:30:22.123456Z", source_name: "Synthetic salary", amount: "123.456", ledger_category: "급여", memo: "original", input_excluded: false, created_at: "2026-02-25T00:00:00Z", updated_at: "2026-02-25T00:00:00Z" };
let rows: IncomeEntryRecord[];
let supported: boolean;
let loseReceipt: boolean;
let failAfterCommit: "unsupported" | "read" | "stale" | null;
let revision: number;
const writes = () => io.rpc.mock.calls.filter(call => call[0] === "apply_ledger_command");

beforeEach(() => {
  rows = [structuredClone(original)]; supported = true; loseReceipt = false; failAfterCommit = null; revision = 8;
  io.denied = false; io.rpc.mockReset();
  const receipts = new Map<string, string>();
  // Only synthetic source storage/transport at RPC IO, not an SQL/RLS emulator.
  io.rpc.mockImplementation(async (name, args) => {
    if (name === "apply_ledger_command") {
      const prior = receipts.get(args.request_id);
      if (prior) expect(JSON.stringify(args.command)).toBe(prior);
      else {
        const commands: LedgerEntryCommand[] = args.command.kind === "batch" ? args.command.commands : [args.command];
        for (const command of commands) {
          if (command.kind === "income.create") rows.push({ ...original, ...command.source, id: command.id, version: "1" });
          if (command.kind === "income.update") rows = rows.map(row => row.id === command.id ? { ...row, ...command.patch, version: String(BigInt(row.version) + BigInt(1)) } : row);
          if (command.kind === "income.exclude") rows = rows.map(row => row.id === command.id ? { ...row, input_excluded: command.excluded, version: String(BigInt(row.version) + BigInt(1)) } : row);
        }
        receipts.set(args.request_id, JSON.stringify(args.command)); revision++;
      }
      if (loseReceipt) { loseReceipt = false; throw new Error("receipt lost after commit"); }
      return { data: { requestId: args.request_id, ownerRevision: String(revision), resultIds: [args.command.id ?? id], replayed: Boolean(prior) }, error: null };
    }
    if (receipts.size && failAfterCommit === "read") throw new Error("snapshot unavailable");
    const hasIncome = supported && !(receipts.size && failAfterCommit === "unsupported");
    return { data: { ownerId: "synthetic-owner", ownerRevision: String(revision - (receipts.size && failAfterCommit === "stale" ? 1 : 0)), throughMonth: args.through_month, inputs: inputs(), ...(hasIncome ? { household: { version: 1, incomes: rows.filter(row => row.occurred_at < `${args.through_month === "2026-02" ? "2026-02-28" : "2026-03-31"}T15:00:00Z`) } } : {}) }, error: null };
  });
});

describe("Task16 income Actions through authorized command IO", () => {
  it("creates only income source fields at Seoul midnight with no card calculation feedback", async () => {
    rows = [];
    const result = await actions.createIncome(idle, form({ paymentMethod: "credit_card", userCardId: id, isFixedCost: "on", paymentChannel: "online", installmentMonths: "12", occurredTime: "16:00" }));
    expect(result.status).toBe("success"); expect(result.feedback).toBeUndefined();
    expect(writes()[0][1].command).toEqual({ kind: "income.create", id, source: { occurred_at: "2026-02-24T15:00:00.000Z", source_name: "Synthetic salary", amount: 3000000, ledger_category: "급여", memo: "original" } });
    const workspace = await loadLedgerWorkspace("synthetic-owner", "2026-02");
    expect(workspace.incomeSource).toMatchObject({ status: "supported", entries: [{ id, amount: 3000000, version: "1" }] });
    expect(workspace.cardWorkspace.inputs.transactions).toEqual([]);
  });
  it("preserves raw decimal and subsecond timestamp when only income text changes", async () => {
    const data = form({ amount: "123.456", originalAmount: "123.456", occurredAt: "2026-02-25", originalLocalOccurredAt: "2026-02-25", memo: "edited", paymentMethod: "cash", isFixedCost: "on" });
    expect((await actions.updateIncome(id, idle, data)).status).toBe("success");
    expect(writes()[0][1].command).toEqual({ kind: "income.update", id, expected_version: "4", patch: { source_name: "Synthetic salary", ledger_category: "급여", memo: "edited" } });
    expect(rows[0]).toMatchObject({ amount: "123.456", occurred_at: "2026-02-24T15:30:22.123456Z", memo: "edited", version: "5" });
  });
  it("acknowledges the moved date even when the refreshed viewing month has no income row", async () => {
    const result = await actions.updateIncome(id, idle, form({ occurredAt: "2026-03-02", originalLocalOccurredAt: "2026-02-25", amount: "123.456", originalAmount: "123.456" }));
    expect(result.status).toBe("success"); expect(result.message).toContain("2026-03-02"); expect(result.feedback).toBeUndefined();
    expect(rows[0].occurred_at).toBe("2026-03-01T15:00:00.000Z");
    expect((await loadLedgerWorkspace("synthetic-owner", "2026-02")).incomeSource).toEqual({ status: "supported", entries: [] });
  });
  it("excludes then restores the income original with its mounted version, never refund or expense commands", async () => {
    for (const [excluded, version] of [["true", "4"], ["false", "5"]]) {
      expect((await actions.excludeIncome(id, idle, form({ excluded, version }))).status).toBe("success");
      expect(writes().at(-1)![1].command).toEqual({ kind: "income.exclude", id, expected_version: version, excluded: excluded === "true" });
      expect(rows[0].input_excluded).toBe(excluded === "true");
    }
    expect(rows[0]).toEqual({ ...original, version: "6" });
  });
  it.each(["", "on", "garbage"])("never turns ambiguous exclusion %s into restoration", async excluded => {
    expect((await actions.excludeIncome(id, idle, form({ excluded }))).status).toBe("error"); expect(writes()).toEqual([]);
  });
  it("blocks unsupported income creation but keeps normal expense creation available", async () => {
    supported = false;
    expect(await actions.createIncome(idle, form())).toMatchObject({ status: "error", message: expect.stringContaining("수입 기능 적용 필요") });
    expect(writes()).toEqual([]);
    expect((await actions.createTransaction(idle, form({ merchantName: "Synthetic cafe", paymentMethod: "cash" }))).status).toBe("success");
    expect(writes()[0][1].command.kind).toBe("transaction.create");
  });
  it.each(["0", "1.25", "9007199254740991.1", "9007199254740992", "1e3", ""])("rejects a new income amount %s without writing", async amount => {
    expect((await actions.createIncome(idle, form({ amount }))).status).toBe("error"); expect(writes()).toEqual([]);
  });
  it.each<Record<string, string>>([{ sourceName: " \n\t " }, { sourceName: "x".repeat(201) }, { ledgerCategory: "x".repeat(121) }, { memo: "x".repeat(2001) }, { occurredAt: "2026-02-30" }])("rejects invalid income fields without writing", async fields => {
    expect((await actions.createIncome(idle, form(fields))).status).toBe("error"); expect(writes()).toEqual([]);
  });
  it.each(["unsupported", "read", "stale"] as const)("keeps the saved receipt on %s post-commit snapshot failure without card feedback", async failure => {
    failAfterCommit = failure;
    const result = await actions.createIncome(idle, form());
    expect(result).toMatchObject({ status: "saved_needs_review", resultIds: [id] }); expect(result.feedback).toBeUndefined(); expect(writes()).toHaveLength(1);
  });
  it("retries a lost income response with the same UUID and source even if support disappears", async () => {
    rows = []; loseReceipt = true;
    const attempt = createLedgerFormAttempt(actions.createIncome, { create: true, month: "2026-02" });
    const unknown = await attempt(idle, form()); expect(unknown.status).toBe("outcome_unknown");
    supported = false;
    const saved = await attempt(unknown, form({ sourceName: "changed", amount: "999", month: "2026-03" }));
    expect(saved.status).toBe("saved_needs_review"); expect(writes()).toHaveLength(2);
    expect(writes()[1]).toEqual(writes()[0]); expect(rows).toHaveLength(1);
  });
  it("stops a committed income edit from resubmitting after refresh failure", async () => {
    failAfterCommit = "read";
    const attempt = createLedgerFormAttempt(actions.updateIncome.bind(null, id), { version: "4", month: "2026-02" });
    const saved = await attempt(idle, form()); expect(saved.status).toBe("saved_needs_review");
    expect((await attempt(saved, form())).status).toBe("error"); expect(writes()).toHaveLength(1);
  });
  it("routes same-ID expense/income and a refund selection by original kind rather than collapsing IDs", async () => {
    const result = await actions.deleteTransactions([{ kind: "expense", id, version: "1" }, { kind: "income", id, version: "4" }, { kind: "refund", id, version: "2" }], crypto.randomUUID(), "2026-02");
    expect(result.status).toBe("success");
    expect(writes()[0][1].command).toEqual({ kind: "batch", commands: [{ kind: "transaction.exclude", id, expected_version: "1", excluded: true }, { kind: "income.exclude", id, expected_version: "4", excluded: true }, { kind: "refund.void", id, expected_version: "2" }] });
  });
  it("rejects demo expense and income Actions before any read or write", async () => {
    io.denied = true;
    for (const call of [
      () => actions.createTransaction(idle, form({ merchantName: "동네카페", paymentMethod: "cash" })),
      () => actions.createIncome(idle, form()),
      () => actions.updateIncome(id, idle, form()),
      () => actions.excludeIncome(id, idle, form({ excluded: "true" })),
    ]) await expect(call()).rejects.toThrow("데모");
    expect(io.rpc).not.toHaveBeenCalled();
  });
});
