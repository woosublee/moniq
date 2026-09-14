import { beforeEach, describe, expect, it, vi } from "vitest";
import { annotation, card, inputs, monthData, policy, refund, transaction, version } from "@/features/card-benefits/replay.fixtures";
import { loadCardWorkspace } from "@/lib/card-workspace/load";
import { cardInputOptions } from "@/lib/card-workspace/input-options";
import { parseCardsQuery, selectWorkspaceActivity, workspaceBenefitServices } from "@/features/cards/workspace-view";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { CardWorkspaceView } from "@/components/cards/card-workspace";
import { deleteUserCard } from "@/app/cards/actions";
import type { LedgerEntryCommand, LedgerCommand } from "@/lib/card-workspace/commands";
import type { ReplayInputs } from "@/features/card-benefits/engine-types";
import { createLedgerFormAttempt } from "@/components/transactions/ledger-request-fields";
import * as actions from "./actions";
import { registerUserCard, saveCardMonthInput, saveCardTarget } from "@/app/cards/actions";
const io = vi.hoisted(() => ({ rpc: vi.fn(), canMutate: true }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/lib/auth/owner", async importOriginal => {
  const actual = await importOriginal<typeof import("@/lib/auth/owner")>();
  return { ...actual, getOwnerContext: async () => ({ ownerId: "synthetic-owner", canMutate: io.canMutate, mode: "authenticated" }), createAuthorizedSupabaseServerClient: async () => ({ rpc: io.rpc }) };
});
const id = "33333333-3333-4333-8333-333333333901";
const cardId = "33333333-3333-4333-8333-333333333902";
const ruleId = "33333333-3333-4333-8333-333333333903";
const noteId = "33333333-3333-4333-8333-333333333904";
const idle = { status: "idle" as const, message: "" };
function form(values: Record<string, string> = {}) { const data = new FormData(); Object.entries({ requestId: crypto.randomUUID(), entryId: crypto.randomUUID(), version: "4", month: "2026-03", ...values }).forEach(([key, value]) => data.set(key, value)); return data; }
const correction = (values: Record<string, string> = {}) => form({ transactionId: id, transactionVersion: "9", targetKind: "benefit_eligible", targetKey: "base", scopeInstanceKey: "", amount: "0", basisAutoAmount: "500", basisInputRevision: "37", basisRuleVersionId: ruleId, ...values });
let source: ReplayInputs;
beforeEach(() => {
  io.canMutate = true; io.rpc.mockReset();
  source = inputs({ cards: [card(cardId)], ruleVersions: [version(cardId, policy(), { id: ruleId })], transactions: [transaction(id, 10000, "2026-02-02T01:00:00Z", cardId)], monthInputs: [monthData("2026-02", "performance", "spend", { status: "manual_total", amount: 300000 }, `card:${cardId}:performance:spend`)] });
  io.rpc.mockImplementation(async (name, args) => name === "apply_ledger_command" ? { data: { requestId: args.request_id, ownerRevision: "38", resultIds: [args.command.id || id], replayed: false }, error: null } : { data: { ownerId: source.ownerId, ownerRevision: "38", throughMonth: args.through_month, inputs: source }, error: null });
});
// Test-only source storage at the RPC boundary, not a calculator or SQL/RLS emulator.
// Every assertion below reads the production loader, replay and presentation selectors.
function mutableCommandIO() {
  let revision = 37;
  let sequence = source.transactions.length;
  const receipts = new Map<string, { command: string; ids: string[] }>();
  function apply(command: LedgerEntryCommand) {
    const bump = (value: string | number) => String(BigInt(value) + BigInt(1));
    switch (command.kind) {
      case "transaction.create": source = { ...source, transactions: [...source.transactions, { ...transaction(command.id, command.source.amount, command.source.occurred_at, command.source.user_card_id ?? "", ++sequence), ...command.source }] }; break;
      case "transaction.update": source = { ...source, transactions: source.transactions.map(row => row.id === command.id ? { ...row, ...command.patch, actual_amount: command.patch.amount ?? row.actual_amount, version: bump(row.version) } : row) }; break;
      case "transaction.exclude": source = { ...source, transactions: source.transactions.map(row => row.id === command.id ? { ...row, input_excluded: command.excluded, version: bump(row.version) } : row) }; break;
      case "annotation.create": source = { ...source, annotations: [...source.annotations, annotation(command.source.transaction_id, command.source.amount, command.source.target_kind, { ...command.source, id: command.id })] }; break;
      case "annotation.update": source = { ...source, annotations: source.annotations.map(row => row.id === command.id ? { ...row, ...command.source, review_status: "resolved", version: bump(row.version) } : row) }; break;
      case "annotation.void": source = { ...source, annotations: source.annotations.map(row => row.id === command.id ? { ...row, voided_at: "2026-03-04T00:00:00Z", version: bump(row.version) } : row) }; break;
      case "refund.create": source = { ...source, adjustments: [...source.adjustments, refund(command.source.transaction_id, command.source.amount, command.source.occurred_at, { ...command.source, id: command.id, stable_sequence: ++sequence })] }; break;
      case "month_input.create": case "month_input.update": {
        const value = command.source;
        const existing = source.monthInputs.find(row => row.id === command.id);
        source = { ...source, monthInputs: [...source.monthInputs.filter(row => row.id !== command.id), { ...monthData(value.month, value.scopeKind, value.scopeKey, value.data, value.scopeInstanceKey), id: command.id, version: existing ? bump(existing.version) : "1" }] }; break;
      }
      case "card.create": {
        const product = source.cards.find(row => row.card_id === command.source.card_id)!.card;
        source = { ...source, cards: [...source.cards, { ...card(command.id), ...command.source, card: product }] }; break;
      }
      case "card.archive": source = { ...source, cards: source.cards.map(row => row.id === command.id ? { ...row, archived_at: "2026-03-04T00:00:00Z", version: bump(row.version) } : row) }; break;
      default: throw new Error(`Unhandled test storage command: ${command.kind}`);
    }
  }
  io.rpc.mockImplementation(async (name, args) => {
    if (name === "apply_ledger_command") {
      const command: LedgerCommand = args.command;
      const previous = receipts.get(args.request_id);
      if (previous) expect(JSON.stringify(command)).toBe(previous.command);
      const commands = command.kind === "batch" ? command.commands : [command];
      if (!previous) { commands.forEach(apply); revision++; receipts.set(args.request_id, { command: JSON.stringify(command), ids: commands.map(row => row.id) }); }
      return { data: { requestId: args.request_id, ownerRevision: String(revision), resultIds: commands.map(row => row.id), replayed: Boolean(previous) }, error: null };
    }
    return { data: { ownerId: source.ownerId, ownerRevision: String(revision), throughMonth: args.through_month, inputs: structuredClone(source) }, error: null };
  });
}

describe("final fix: quota month data through source storage", () => {
  it("resolves missing quota independently, reopens exact ID/version, and replays opening remaining only once", async () => {
    const rules = policy(); rules.benefits[0].performance = { kind: "none" }; rules.benefits[0].quotaKeys = ["pool"];
    rules.quotas = [{ key: "pool", sharing: { kind: "independent" }, limit: { kind: "fixed", amount: 500 } }];
    source = { ...source, ruleVersions: [version(cardId, rules, { id: ruleId })] };
    const preservedPerformance = structuredClone(source.monthInputs);
    mutableCommandIO();
    const before = await loadCardWorkspace(source.ownerId, "2026-02");
    expect(before.transactions[0].workspace?.benefitAmount).toBeNull();
    const entryId = crypto.randomUUID();
    const values = form({ entryId, month: "2026-02", inputMonth: "2026-02", scopeKind: "quota", scopeKey: "pool", scopeInstanceKey: `card:${cardId}:quota:pool`, dataStatus: "complete" });
    expect((await saveCardMonthInput(null, idle, values)).status).toBe("success");
    const complete = await loadCardWorkspace(source.ownerId, "2026-02");
    expect(complete.transactions[0].workspace?.benefitAmount).toBe(500);
    expect(complete.inputs.monthInputs.filter(row => row.scope_kind === "performance")).toEqual(preservedPerformance);
    const option = cardInputOptions(complete, complete.summaries[0]).quotas[0];
    expect(option).toMatchObject({ month: "2026-02", instanceKey: `card:${cardId}:quota:pool`, existing: { id: entryId, version: "1", data_status: "complete" } });
    values.set("requestId", crypto.randomUUID()); values.set("version", "1"); values.set("dataStatus", "remaining"); values.set("amount", "300");
    expect((await saveCardMonthInput(entryId, idle, values)).status).toBe("success");
    const opening = await loadCardWorkspace(source.ownerId, "2026-02");
    expect(opening.transactions[0].workspace?.benefitAmount).toBe(300);
    expect(opening.replay.months[1].quotas[0]).toMatchObject({ consumed: 300, remaining: 0 });
    expect(cardInputOptions(opening, opening.summaries[0]).quotas[0].existing).toMatchObject({ id: entryId, version: "2", amount: 300 });
    expect((await loadCardWorkspace(source.ownerId, "2026-02")).totals).toEqual(opening.totals);
    values.set("requestId", crypto.randomUUID()); values.set("version", "2"); values.set("amount", "0");
    expect((await saveCardMonthInput(entryId, idle, values)).status).toBe("success");
    expect((await loadCardWorkspace(source.ownerId, "2026-02")).transactions[0].workspace?.benefitAmount).toBe(0);
    values.set("requestId", crypto.randomUUID()); values.set("version", "3"); values.set("dataStatus", "unknown");
    expect((await saveCardMonthInput(entryId, idle, values)).status).toBe("success");
    expect((await loadCardWorkspace(source.ownerId, "2026-02")).transactions[0].workspace?.benefitAmount).toBeNull();
    expect(source.monthInputs.filter(row => row.scope_kind === "quota")).toHaveLength(1);
  });
  it.each(["", "0.125", "9007199254740991.1"])("does not coerce quota opening %s or store a performance row", async amount => {
    mutableCommandIO(); const original = structuredClone(source.monthInputs);
    expect((await saveCardMonthInput(null, idle, form({ inputMonth: "2026-02", scopeKind: "quota", scopeKey: "pool", scopeInstanceKey: `card:${cardId}:quota:pool`, dataStatus: "remaining", amount }))).status).toBe("error");
    expect(source.monthInputs).toEqual(original);
  });
});

describe("daily quota completion through source storage", () => {
  it("round-trips one daily month original through complete and unknown while keeping each date's cap", async () => {
    const rules = policy({ performanceScopes: [], quotas: [{ key: "daily", period: "daily", sharing: { kind: "independent" }, limit: { kind: "fixed", amount: 500 } }], benefits: [{ ...policy().benefits[0], performance: { kind: "none" }, quotaKeys: ["daily"] }] });
    const later = structuredClone(rules); later.quotas[0].limit = { kind: "fixed", amount: 300 };
    source = { ...source, ruleVersions: [version(cardId, rules, { id: ruleId, effective_until: "2026-02-15" }), version(cardId, later, { id: noteId, version_order: 2, effective_from: "2026-02-15" })], transactions: [source.transactions[0], transaction(crypto.randomUUID(), 10000, "2026-02-02T02:00:00Z", cardId, 2), transaction(crypto.randomUUID(), 10000, "2026-02-20T01:00:00Z", cardId, 3)] };
    const originals = structuredClone({ transactions: source.transactions, performance: source.monthInputs }); mutableCommandIO();
    const before = await loadCardWorkspace(source.ownerId, "2026-02");
    const options = cardInputOptions(before, before.summaries[0]).quotas;
    expect(options).toHaveLength(1);
    expect(options[0]).toMatchObject({ supportsRemaining: false, existing: null });
    expect(before.transactions.map(row => row.workspace?.benefitAmount)).toEqual([null, null, null]);
    const data = form({ inputMonth: options[0].month, scopeKind: "quota", scopeKey: options[0].quota.scopeKey, scopeInstanceKey: options[0].instanceKey, dataStatus: "complete" });
    let loseResponse = true;
    const attempt = createLedgerFormAttempt(async (previous: Parameters<typeof saveCardMonthInput>[1], payload) => {
      const result = await saveCardMonthInput(null, previous, payload);
      if (loseResponse) { loseResponse = false; return { ...result, status: "outcome_unknown" as const }; }
      return result;
    }, { create: true, month: "2026-02" });
    const unknownResponse = await attempt(idle, data);
    expect(unknownResponse.status).toBe("outcome_unknown");
    expect((await attempt(unknownResponse, form({ dataStatus: "unknown", inputMonth: "2026-03" }))).status).toBe("success");
    const complete = await loadCardWorkspace(source.ownerId, "2026-02");
    expect(complete.transactions.map(row => row.workspace?.benefitAmount)).toEqual([500, 0, 300]);
    expect(complete.replay.months[1].quotas.map(pool => [pool.periodKey, pool.cap, pool.consumed, pool.remaining])).toEqual([["2026-02-02", 500, 500, 0], ["2026-02-20", 300, 300, 0]]);
    const saved = cardInputOptions(complete, complete.summaries[0]).quotas[0].existing!;
    expect(saved).toMatchObject({ scope_kind: "quota", data_status: "complete", amount: null, version: "1" });
    for (const [status, expectedVersion] of [["unknown", "2"], ["complete", "3"]]) {
      const latest = await loadCardWorkspace(source.ownerId, "2026-02");
      const option = cardInputOptions(latest, latest.summaries[0]).quotas[0];
      const values = form({ month: "2026-02", version: String(option.existing!.version), inputMonth: option.month, scopeKind: "quota", scopeKey: option.quota.scopeKey, scopeInstanceKey: option.instanceKey, dataStatus: status });
      expect((await saveCardMonthInput(option.existing!.id, idle, values)).status).toBe("success");
      const updated = await loadCardWorkspace(source.ownerId, "2026-02");
      const rows = updated.inputs.monthInputs.filter(row => row.scope_kind === "quota");
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ id: saved.id, data_status: status, amount: null, version: expectedVersion });
      expect(updated.transactions.map(row => row.workspace?.benefitAmount)).toEqual(status === "complete" ? [500, 0, 300] : [null, null, null]);
      expect(updated.inputs.monthInputs.filter(row => row.scope_kind === "performance")).toEqual(originals.performance);
      expect(updated.inputs.transactions).toEqual(originals.transactions);
    }
  });
});

describe("final fix: native payload consumers", () => {
  it.each(["13", "30"])("stores the actual 16:00 KST refund after a 14:00 purchase on September %s", async day => {
    source = { ...source, transactions: [transaction(id, 10000, `2026-09-${day}T05:00:00.123456Z`, cardId)], annotations: [] };
    const original = structuredClone(source.transactions[0]); mutableCommandIO();
    expect((await actions.createTransactionRefund(id, idle, form({ month: "2026-09", occurredAt: `2026-09-${day}`, occurredTime: "16:00", amount: "2000" }))).status).toBe("success");
    expect(source.adjustments[0]).toMatchObject({ transaction_id: id, occurred_at: `2026-09-${day}T07:00:00.000Z`, amount: 2000 });
    const after = await loadCardWorkspace(source.ownerId, "2026-09");
    expect(after.transactions[0].workspace?.projection.netAmount).toBe(8000);
    expect(after.totals.cashFlowAmount).toBe(8000);
    expect(source.transactions[0]).toEqual(original);
  });
  it("creates distinct instances of one product, preserving the original card and transaction link on retries", async () => {
    const product = crypto.randomUUID(); const originalCard = { ...source.cards[0], card_id: product, card: { ...source.cards[0].card, id: product } };
    source = { ...source, cards: [originalCard], ruleVersions: [] }; mutableCommandIO();
    const originalTransaction = structuredClone(source.transactions[0]);
    const entryId = crypto.randomUUID(); const values = form({ entryId, cardId: product, alias: "실물 B" });
    expect((await registerUserCard(idle, values)).status).toBe("success");
    expect((await registerUserCard(idle, values)).status).toBe("success");
    expect(source.cards.map(row => row.id)).toEqual([cardId, entryId]);
    expect(source.cards[0]).toEqual(originalCard);
    expect(source.cards[1]).toMatchObject({ card_id: product, alias: "실물 B" });
    expect(source.transactions[0]).toEqual(originalTransaction);
  });
});

describe("Task7 actions through authorized command IO", () => {
  it("round-trips historical edits, independent correction kinds, cap consumption, refund month and archive through actual replay", async () => {
    const jan = crypto.randomUUID(), feb = crypto.randomUUID(), next = crypto.randomUUID(), estimated = crypto.randomUUID(), confirmed = crypto.randomUUID();
    const rules = policy();
    rules.quotas = [{ key: "pool", sharing: { kind: "independent" }, limit: { kind: "fixed", amount: 1000 } }];
    rules.benefits[0].quotaKeys = ["pool"];
    source = inputs({ cards: [card(cardId)], ruleVersions: [version(cardId, rules, { id: ruleId })], monthInputs: ["2026-01", "2026-02", "2026-03"].flatMap(month => [monthData(month, "performance", "spend", { status: "complete" }, `card:${cardId}:performance:spend`), monthData(month, "quota", "pool", { status: "complete" }, `card:${cardId}:quota:pool`)]) });
    mutableCommandIO();
    const entry = (entryId: string, amount: string, at: string) => form({ entryId, amount, occurredAt: at, merchantName: "Synthetic ledger flow", paymentMethod: "credit_card", userCardId: cardId, paymentChannel: "offline", installmentMonths: "1" });
    expect((await actions.createTransaction(idle, entry(jan, "300000", "2026-01-02"))).status).toBe("success");
    expect((await actions.createTransaction(idle, entry(feb, "10000", "2026-02-02"))).feedback).toMatchObject({ benefit: "500원 (자동)", performance: "10,000원" });
    const february = await loadCardWorkspace(source.ownerId, "2026-02");
    for (const tab of ["performance", "benefits", "transactions"]) {
      const html = renderToStaticMarkup(createElement(CardWorkspaceView, { workspace: february, state: parseCardsQuery({ tab }, "2026-02"), canMutate: false }));
      expect(html).toContain(tab === "benefits" ? "500원" : "10,000원");
    }
    const editJanuary = (amount: string) => actions.updateTransaction(jan, idle, form({ ...Object.fromEntries(entry(jan, amount, "2026-01-02")) as Record<string, string>, originalAmount: String(source.transactions.find(row => row.id === jan)!.amount), originalLocalOccurredAt: "2026-01-02", version: String(source.transactions.find(row => row.id === jan)!.version) }));
    const originalInstant = source.transactions.find(row => row.id === jan)!.occurred_at;
    expect((await editJanuary("100000")).status).toBe("success");
    expect(source.transactions.find(row => row.id === jan)!.occurred_at).toBe(originalInstant);
    expect((await loadCardWorkspace(source.ownerId, "2026-02")).transactions.find(row => row.id === feb)!.workspace!.projection.benefits[0].automaticAmount).toBe(0);
    expect((await editJanuary("300000")).status).toBe("success");
    const note = (entryId: string, amount: string, targetKind = "benefit_eligible", version = "1") => correction({ entryId, transactionId: feb, amount, targetKind, version });
    expect((await actions.saveTransactionAnnotation(null, idle, note(estimated, "0"))).status).toBe("success");
    const zero = (await loadCardWorkspace(source.ownerId, "2026-02")).transactions.find(row => row.id === feb)!.workspace!.projection.benefits[0];
    expect(zero).toMatchObject({ automaticAmount: 500, estimatedOverride: 0, appliedAmount: 0, appliedSource: "estimated_override" });
    expect((await actions.saveTransactionAnnotation(estimated, idle, note(estimated, "700"))).status).toBe("success");
    expect((await actions.createTransaction(idle, entry(next, "10000", "2026-02-03"))).status).toBe("success");
    expect((await loadCardWorkspace(source.ownerId, "2026-02")).transactions.find(row => row.id === next)!.workspace!.projection.benefits[0].appliedAmount).toBe(300);
    expect((await actions.saveTransactionAnnotation(null, idle, note(confirmed, "0", "confirmed_benefit"))).status).toBe("success");
    const confirmation = await loadCardWorkspace(source.ownerId, "2026-02");
    expect(confirmation.transactions.find(row => row.id === feb)!.workspace!.projection.benefits[0]).toMatchObject({ automaticAmount: 500, estimatedOverride: 700, confirmedBenefit: 0, appliedAmount: 0 });
    expect(confirmation.transactions.find(row => row.id === next)!.workspace!.projection.benefits[0].appliedAmount).toBe(500);
    expect((await actions.restoreTransactionAutomatic(idle, form({ annotations: JSON.stringify([{ id: estimated, version: "2" }, { id: confirmed, version: "1" }]) }))).status).toBe("success");
    expect((await actions.createTransactionRefund(feb, idle, form({ amount: "2000", occurredAt: "2026-03-02" }))).status).toBe("success");
    const march = await loadCardWorkspace(source.ownerId, "2026-03");
    expect(selectWorkspaceActivity(march, parseCardsQuery({ tab: "transactions" }, "2026-03"))).toMatchObject({ refundAmount: 2000, actualAmount: 0, cashFlowAmount: -2000 });
    expect(source.transactions.find(row => row.id === feb)).toMatchObject({ actual_amount: 10000, input_excluded: false });
    const afterRefund = await loadCardWorkspace(source.ownerId, "2026-02");
    expect(afterRefund.transactions.find(row => row.id === feb)!.workspace!.projection.benefits[0].appliedAmount).toBe(400);
    expect(workspaceBenefitServices(afterRefund, afterRefund.summaries[0])[0].applied.map(row => row.appliedAmount)).toEqual([400, 500]);
    expect((await deleteUserCard(cardId, form({ version: "1" }))).status).toBe("success");
    const archived = await loadCardWorkspace(source.ownerId, "2026-02");
    expect(archived.transactions.find(row => row.id === feb)!.user_cards!.archived_at).not.toBeNull();
    expect(archived.transactions.find(row => row.id === feb)!.workspace!.projection.benefits[0].appliedAmount).toBe(400);
  });
  it.each([
    { raw: "원문-확인필요", displayed: "" },
    { raw: "2026-02-30T01:00:00Z", displayed: "" },
    { raw: "2026-02-18T01:22:33.123456Z", displayed: "2026-02-18T10:22" },
  ])("Task17 fix1 preserves raw expense time $raw and decimal principal until explicit correction", async ({ raw, displayed }) => {
    source = { ...source, transactions: [{ ...source.transactions[0], occurred_at: raw, amount: "10.5", actual_amount: "9.5" }] };
    mutableCommandIO();
    const edit = form({ merchantName: "Synthetic preserved", paymentMethod: "cash", amount: "10.5", originalAmount: "10.5", occurredAt: displayed, originalLocalOccurredAt: displayed, timezoneOffset: "-540", month: "2026-02", version: "1" });
    expect((await actions.updateTransaction(id, idle, edit)).status).toBe("success");
    const first = io.rpc.mock.calls.find(([name]) => name === "apply_ledger_command")![1].command;
    expect(first.patch).not.toHaveProperty("occurred_at"); expect(first.patch).not.toHaveProperty("amount");
    expect(source.transactions[0]).toMatchObject({ occurred_at: raw, amount: "10.5", actual_amount: "9.5" });
    edit.set("requestId", crypto.randomUUID()); edit.set("version", "2"); edit.set("occurredAt", "2026-02-19T14:25");
    expect((await actions.updateTransaction(id, idle, edit)).status).toBe("success");
    const second = io.rpc.mock.calls.filter(([name]) => name === "apply_ledger_command")[1][1].command;
    expect(second).toMatchObject({ kind: "transaction.update", id, expected_version: "2", patch: { occurred_at: "2026-02-19T05:25:00.000Z" } });
    expect(second.patch).not.toHaveProperty("amount");
    expect(source.transactions[0]).toMatchObject({ occurred_at: "2026-02-19T05:25:00.000Z", amount: "10.5", actual_amount: "9.5" });
  });
  it.each(["2026-02-02", "2026-02-02T10:22"])("preserves original timestamp and lost decimal annotations for unchanged display %s", async displayed => {
    source = { ...source, transactions: [{ ...source.transactions[0], origin: "legacy", amount: "20000.125", actual_amount: "10000", occurred_at: "2026-02-02T01:22:33.123Z" }], annotations: [annotation(id, "0.125", "confirmed_benefit", { target_key: null, id: noteId, review_status: "needs_review", origin: "legacy_manual", basis_rule_version_id: ruleId })] };
    const originalNote = structuredClone(source.annotations[0]);
    mutableCommandIO();
    const edit = form({ merchantName: "Synthetic", paymentMethod: "credit_card", userCardId: cardId, amount: "20000.125", originalAmount: "20000.125", occurredAt: displayed, originalLocalOccurredAt: displayed, paymentChannel: "online", installmentMonths: "", version: "1" });
    expect((await actions.updateTransaction(id, idle, edit)).status).toBe("success");
    expect(source.transactions[0]).toMatchObject({ occurred_at: "2026-02-02T01:22:33.123Z", amount: "20000.125", actual_amount: "10000" });
    expect(source.annotations[0]).toEqual(originalNote);
    const after = await loadCardWorkspace(source.ownerId, "2026-02");
    expect(after.transactions[0].workspace!.projection.unallocatedAnnotations).toContainEqual(originalNote);
    edit.set("requestId", crypto.randomUUID()); edit.set("occurredAt", "2026-02-03"); edit.set("version", "2");
    expect((await actions.updateTransaction(id, idle, edit)).status).toBe("success");
    expect(source.transactions[0].occurred_at).toBe("2026-02-02T15:00:00.000Z");
    expect(source.annotations[0]).toEqual(originalNote);
  });
  it("saves the selected version's missing prior input and reopens its original record with recalculated benefits", async () => {
    source = { ...source, ruleVersions: [version(cardId, policy(), { id: ruleId, effective_from: "2026-02-01" })], monthInputs: [] };
    mutableCommandIO();
    const before = await loadCardWorkspace(source.ownerId, "2026-02");
    expect(before.transactions[0].workspace!.projection.benefits[0].automaticAmount).toBeNull();
    const input = cardInputOptions(before, before.summaries[0]).performance.find(row => row.month === "2026-01");
    expect(input).toMatchObject({ month: "2026-01", instanceKey: `card:${cardId}:performance:spend`, existing: null });
    const entryId = crypto.randomUUID();
    const values = form({ entryId, month: "2026-02", inputMonth: input!.month, scopeKey: input!.definition.key, scopeInstanceKey: input!.instanceKey, dataStatus: "manual_total", amount: "300000" });
    expect((await saveCardMonthInput(null, idle, values)).status).toBe("success");
    const after = await loadCardWorkspace(source.ownerId, "2026-02");
    expect(after.transactions[0].workspace!.projection.benefits[0].automaticAmount).toBe(500);
    const saved = cardInputOptions(after, after.summaries[0]).performance.find(row => row.month === "2026-01")!;
    expect(saved).toMatchObject({ existing: { id: entryId, version: "1", amount: 300000, data_status: "manual_total" }, scope: { amount: 300000, ledgerAmount: null, source: "manual_total" } });
    values.set("requestId", crypto.randomUUID()); values.set("version", String(saved.existing!.version)); values.set("amount", "0");
    expect((await saveCardMonthInput(saved.existing!.id, idle, values)).status).toBe("success");
    const zero = await loadCardWorkspace(source.ownerId, "2026-02");
    expect(zero.transactions[0].workspace!.projection.benefits[0].automaticAmount).toBe(0);
    expect(source.monthInputs).toHaveLength(1);
    expect(cardInputOptions(zero, zero.summaries[0]).performance.find(row => row.month === "2026-01")?.existing).toMatchObject({ id: entryId, version: "2", amount: 0 });
  });
  it("keeps a manual month total after historical edits and distinguishes zero from incomplete", async () => {
    const inputId = crypto.randomUUID();
    source = { ...source, monthInputs: source.monthInputs.filter(row => !row.month.startsWith("2026-01")), transactions: [transaction(id, 10000, "2026-02-02T01:00:00Z", cardId)] };
    mutableCommandIO();
    const data = (dataStatus: string, amount = "", version = "1") => form({ entryId: inputId, version, inputMonth: "2026-01", scopeKey: "spend", scopeInstanceKey: `card:${cardId}:performance:spend`, dataStatus, amount });
    expect((await saveCardMonthInput(null, idle, data("manual_total", "300000"))).status).toBe("success");
    const inserted = form({ entryId: crypto.randomUUID(), amount: "50000", occurredAt: "2026-01-02", merchantName: "Synthetic historical", paymentMethod: "credit_card", userCardId: cardId });
    expect((await actions.createTransaction(idle, inserted)).status).toBe("success");
    expect((await loadCardWorkspace(source.ownerId, "2026-02")).transactions.find(row => row.id === id)!.workspace!.projection.benefits[0].automaticAmount).toBe(500);
    expect(source.monthInputs.find(row => row.id === inputId)).toMatchObject({ amount: 300000, data_status: "manual_total" });
    expect((await saveCardMonthInput(inputId, idle, data("manual_total", "0"))).status).toBe("success");
    expect((await loadCardWorkspace(source.ownerId, "2026-02")).transactions.find(row => row.id === id)!.workspace!.projection.benefits[0].automaticAmount).toBe(0);
    expect((await saveCardMonthInput(inputId, idle, data("incomplete", "", "2"))).status).toBe("success");
    expect((await loadCardWorkspace(source.ownerId, "2026-02")).transactions.find(row => row.id === id)!.workspace!.projection.benefits[0].automaticAmount).toBeNull();
  });
  it("updates payment conditions without touching a legacy principal or annotations", async () => {
    const data = form({ merchantName: "Synthetic", paymentMethod: "credit_card", userCardId: cardId, amount: "123.456", originalAmount: "123.456", occurredAt: "2026-02-02T10:00", originalLocalOccurredAt: "2026-02-02T10:00", paymentChannel: "mobile_wallet", installmentMonths: "3" });
    expect((await actions.updateTransaction(id, idle, data)).status).toBe("success");
    const command = io.rpc.mock.calls[0][1].command;
    expect(command.patch).toMatchObject({ payment_channel: "mobile_wallet", installment_months: 3 });
    expect(command.patch).not.toHaveProperty("amount");
  });
  it.each(["benefit_eligible", "confirmed_benefit", "performance"])("writes explicit zero %s with owner basis distinct from entry version", async kind => {
    const result = await actions.saveTransactionAnnotation(null, idle, correction({ targetKind: kind, scopeInstanceKey: kind === "performance" ? `card:${cardId}:performance:spend` : "", targetKey: kind === "performance" ? "spend" : "base" }));
    expect(result.status).toBe("success");
    expect(io.rpc.mock.calls[0][1].command.source).toMatchObject({ transaction_id: id, target_kind: kind, amount: 0, basis_input_revision: "37", basis_auto_amount: 500, basis_rule_version_id: ruleId });
  });
  it("explicitly reconfirms an annotation using its own version, not the transaction version", async () => {
    expect((await actions.saveTransactionAnnotation(noteId, idle, correction({ amount: "700", targetKind: "confirmed_benefit" }))).status).toBe("success");
    expect(io.rpc.mock.calls[0][1].command).toMatchObject({ kind: "annotation.update", id: noteId, expected_version: "4", source: { amount: 700 } });
  });
  it("only explicit automatic return voids both independent correction kinds", async () => {
    const data = form({ annotations: JSON.stringify([{ id: noteId, version: "4" }, { id, version: "2" }]) });
    expect((await actions.restoreTransactionAutomatic(idle, data)).status).toBe("success");
    expect(io.rpc.mock.calls[0][1].command).toEqual({ kind: "batch", commands: [{ kind: "annotation.void", id: noteId, expected_version: "4" }, { kind: "annotation.void", id, expected_version: "2" }] });
  });
  it.each(["0.00000000000001", "9007199254740991.1", "9007199254740992", "1e3", "-1", ""])("rejects raw correction %s before IO", async amount => {
    expect((await actions.saveTransactionAnnotation(null, idle, correction({ amount }))).status).toBe("error"); expect(io.rpc).not.toHaveBeenCalled();
  });
  it("records a linked partial refund in the selected month, not a source exclusion", async () => {
    const result = await actions.createTransactionRefund(id, idle, form({ amount: "2000", occurredAt: "2026-03-02", memo: "부분취소" }));
    expect(result.status).toBe("success");
    expect(io.rpc.mock.calls[0][1].command).toMatchObject({ kind: "refund.create", source: { transaction_id: id, amount: 2000, occurred_at: "2026-03-01T15:00:00.000Z", memo: "부분취소" } });
    expect(io.rpc.mock.calls[1]).toEqual(["get_ledger_inputs", { through_month: "2026-03" }]);
  });
  it.each(["0", "2000.0000000000001", "9007199254740992"])("rejects invalid refund %s", async amount => {
    expect((await actions.createTransactionRefund(id, idle, form({ amount, occurredAt: "2026-03-02" }))).status).toBe("error"); expect(io.rpc).not.toHaveBeenCalled();
  });
  it("saves zero manual total as data, distinct from incomplete and complete", async () => {
    expect((await saveCardMonthInput(null, idle, form({ inputMonth: "2026-02", scopeKey: "spend", scopeInstanceKey: `card:${cardId}:performance:spend`, dataStatus: "manual_total", amount: "0" }))).status).toBe("success");
    expect(io.rpc.mock.calls[0][1].command.source).toEqual({ month: "2026-02", scopeKind: "performance", scopeKey: "spend", scopeInstanceKey: `card:${cardId}:performance:spend`, data: { status: "manual_total", amount: 0 } });
  });
  it("saves selected exact scope/tier using the mounted card version", async () => {
    expect((await saveCardTarget(cardId, idle, form({ scopeKey: "spend", tierKey: "plus" }))).status).toBe("success");
    expect(io.rpc.mock.calls[0][1].command).toEqual({ kind: "card.update", id: cardId, expected_version: "4", patch: { target_scope_key: "spend", target_tier_key: "plus" } });
  });
  it("rejects rounded manual totals", async () => {
    expect((await saveCardMonthInput(null, idle, form({ inputMonth: "2026-02", scopeKey: "spend", scopeInstanceKey: "instance", dataStatus: "manual_total", amount: "9007199254740991.1" }))).status).toBe("error"); expect(io.rpc).not.toHaveBeenCalled();
  });
  it("reports committed transaction ID when post-save calculation fails and refuses edit resave", async () => {
    io.rpc.mockImplementation(async (name, args) => name === "apply_ledger_command" ? { data: { requestId: args.request_id, ownerRevision: "38", resultIds: [id], replayed: false }, error: null } : Promise.reject(new Error("offline")));
    const attempt = createLedgerFormAttempt(actions.updateTransaction.bind(null, id), { version: "4", month: "2026-03" });
    const data = form({ merchantName: "Synthetic", paymentMethod: "cash", amount: "1000", originalAmount: "1000", occurredAt: "same", originalLocalOccurredAt: "same" });
    const saved = await attempt(idle, data);
    expect(saved).toMatchObject({ status: "saved_needs_review", resultIds: [id] });
    expect((await attempt(saved, data)).status).toBe("error");
    expect(io.rpc.mock.calls.filter(call => call[0] === "apply_ledger_command")).toHaveLength(1);
  });
  it("retries an unknown refund with identical UUID and original payload", async () => {
    let count = 0; io.rpc.mockImplementation(async (name, args) => {
      if (name !== "apply_ledger_command") return { data: { ownerId: source.ownerId, ownerRevision: "38", throughMonth: args.through_month, inputs: source }, error: null };
      if (count++ === 0) throw new Error("lost receipt");
      return { data: { requestId: args.request_id, ownerRevision: "38", resultIds: [args.command.id], replayed: true }, error: null };
    });
    const attempt = createLedgerFormAttempt(actions.createTransactionRefund.bind(null, id), { create: true, month: "2026-03" });
    const result = await attempt(idle, form({ amount: "2000", occurredAt: "2026-03-02" })); expect(result.status).toBe("outcome_unknown");
    expect((await attempt(result, form({ amount: "9999", occurredAt: "2026-03-03" }))).status).toBe("success");
    expect(io.rpc.mock.calls[1]).toEqual(io.rpc.mock.calls[0]);
  });
  it("never changes data for read-only demo even through direct action calls", async () => {
    io.canMutate = false;
    const calls = [() => actions.createTransactionRefund(id, idle, form()), () => actions.saveTransactionAnnotation(null, idle, correction()), () => actions.restoreTransactionAutomatic(idle, form()), () => saveCardMonthInput(null, idle, form()), () => saveCardTarget(cardId, idle, form())];
    for (const call of calls) await expect(call()).rejects.toThrow("데모");
    expect(io.rpc).not.toHaveBeenCalled();
  });
});
