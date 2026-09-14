"use server";

import type { TransactionFormState } from "@/features/transactions/types";
import { assertCanMutate, getOwnerContext } from "@/lib/auth/owner";
import { applyLedgerCommand, type LedgerMutationResult } from "@/lib/card-workspace/mutations";
import { currentSeoulMonth, formatWon, getTransactionBenefitLabel } from "@/lib/card-workspace/view-model";
import { loadLedgerWorkspace } from "@/lib/card-workspace/load";
import { ledgerCommandSchema, requestIdSchema } from "@/lib/card-workspace/commands";
import { monthKeySchema } from "@/features/card-benefits/month-inputs";

import { formText as text, integerInput as purchaseAmount, formInstant as occurredAt, installmentInput } from "@/lib/card-workspace/form-data";
function formResult(result: LedgerMutationResult): TransactionFormState {
  return { status: result.status === "saved" ? "success" : result.status === "rejected" ? "error" : result.status,
    message: result.message, requestId: result.requestId, resultIds: result.receipt?.resultIds };
}
async function save(data: FormData, command: unknown): Promise<TransactionFormState> {
  try {
    const result = await applyLedgerCommand(text(data, "requestId"), command, text(data, "month") || currentSeoulMonth());
    const state = formResult(result);
    const input = command as { kind?: string; id?: string; patch?: { occurred_at?: string } };
    if (result.receipt && input.kind === "income.update" && input.patch?.occurred_at) {
      state.message += ` ${text(data, "occurredAt").slice(0, 10)} 날짜로 옮겼습니다.`;
    }
    if (result.receipt && (input.kind === "transaction.create" || input.kind === "transaction.update")) {
      const row = result.workspace?.transactions.find(row => row.id === input.id);
      state.feedback = { transactionId: input.id!, benefit: row ? getTransactionBenefitLabel(row) : "확인 필요", performance: formatWon(row?.workspace?.eligibleSpendAmount), notice: !row ? "저장된 거래의 계산을 다시 확인하세요." : row.workspace?.projection.reasons.length ? "거래 상세에서 약관·실적 자료·결제 조건을 확인하세요." : "현재 입력 기준 · 시각 없는 동일 날짜 거래는 고정 입력순서로 추정합니다." };
    }
    return state;
  }
  catch (error) { return { status: "error", message: error instanceof Error ? error.message : "저장 요청을 확인해 주세요." }; }
}
export async function createTransaction(_prevState: TransactionFormState, formData: FormData): Promise<TransactionFormState> {
  const owner = await getOwnerContext(); assertCanMutate(owner);
  try {
    return await save(formData, { kind: "transaction.create", id: text(formData, "entryId"), source: {
      occurred_at: occurredAt(formData), merchant_name: text(formData, "merchantName").trim(), amount: purchaseAmount(text(formData, "amount")),
      payment_method: text(formData, "paymentMethod"), user_card_id: ["cash", "points"].includes(text(formData, "paymentMethod")) ? null : text(formData, "userCardId") || null,
      payment_channel: text(formData, "paymentChannel") || "unknown", installment_months: installmentInput(formData), ledger_category: text(formData, "ledgerCategory") || null, is_fixed_cost: formData.get("isFixedCost") === "on", memo: text(formData, "memo") || null,
    } });
  } catch (error) { return { status: "error", message: error instanceof Error ? error.message : "입력값을 확인해 주세요." }; }
}
export async function updateTransaction(transactionId: string, _prevState: TransactionFormState, formData: FormData): Promise<TransactionFormState> {
  const owner = await getOwnerContext(); assertCanMutate(owner);
  try {
    // Form originals are only used to omit unchanged fields. DB version/owner checks
    // are authoritative; no freshly fetched value is substituted into a retry payload.
    const patch: Record<string, unknown> = {
      merchant_name: text(formData, "merchantName").trim(), payment_method: text(formData, "paymentMethod"),
      user_card_id: ["cash", "points"].includes(text(formData, "paymentMethod")) ? null : text(formData, "userCardId") || null,
      ledger_category: text(formData, "ledgerCategory") || null, is_fixed_cost: formData.get("isFixedCost") === "on", memo: text(formData, "memo") || null,
    };
    if (formData.has("paymentChannel")) patch.payment_channel = text(formData, "paymentChannel") || "unknown";
    if (formData.has("installmentMonths")) patch.installment_months = installmentInput(formData);
    if (text(formData, "amount") !== text(formData, "originalAmount")) patch.amount = purchaseAmount(text(formData, "amount"));
    if (text(formData, "occurredAt") !== text(formData, "originalLocalOccurredAt")) patch.occurred_at = occurredAt(formData);
    return await save(formData, { kind: "transaction.update", id: transactionId, expected_version: text(formData, "version"), patch });
  } catch (error) { return { status: "error", message: error instanceof Error ? error.message : "입력값을 확인해 주세요." }; }
}
// Income accepts only its own date/text/amount fields. Hidden expense time or
// payment controls must never change an income source, even on a direct POST.
function incomeInstant(data: FormData) {
  const date = new FormData();
  date.set("occurredAt", text(data, "occurredAt"));
  date.set("timezoneOffset", "-540");
  return occurredAt(date);
}
export async function createIncome(previous: TransactionFormState, formData: FormData): Promise<TransactionFormState> {
  const owner = await getOwnerContext(); assertCanMutate(owner);
  try {
    const command = ledgerCommandSchema.parse({ kind: "income.create", id: text(formData, "entryId"), source: {
      occurred_at: incomeInstant(formData), source_name: text(formData, "sourceName").trim(), amount: purchaseAmount(text(formData, "amount")),
      ledger_category: text(formData, "ledgerCategory") || null, memo: text(formData, "memo") || null,
    } });
    const requestId = requestIdSchema.parse(text(formData, "requestId"));
    const month = monthKeySchema.parse(text(formData, "month") || currentSeoulMonth());
    // A lost response may already have committed. Only the same atomic RPC can
    // resolve that receipt; a later unsupported snapshot must not veto its retry.
    // This hint grants no write permission: owner/schema/version checks stay in RPC.
    if (previous.status !== "outcome_unknown" || previous.requestId !== requestId) {
      const workspace = await loadLedgerWorkspace(owner.ownerId, month);
      if (workspace.incomeSource.status !== "supported") return { status: "error", message: "수입 기능 적용 필요 · 지출은 계속 기록할 수 있습니다." };
    }
    return await save(formData, command);
  } catch (error) { return { status: "error", message: error instanceof Error ? error.message : "수입 입력과 지원 여부를 확인해 주세요." }; }
}
export async function updateIncome(incomeId: string, _previous: TransactionFormState, formData: FormData): Promise<TransactionFormState> {
  const owner = await getOwnerContext(); assertCanMutate(owner);
  try {
    const patch: Record<string, unknown> = { source_name: text(formData, "sourceName").trim(), ledger_category: text(formData, "ledgerCategory") || null, memo: text(formData, "memo") || null };
    if (text(formData, "amount") !== text(formData, "originalAmount")) patch.amount = purchaseAmount(text(formData, "amount"));
    if (text(formData, "occurredAt") !== text(formData, "originalLocalOccurredAt")) patch.occurred_at = incomeInstant(formData);
    return await save(formData, { kind: "income.update", id: incomeId, expected_version: text(formData, "version"), patch });
  } catch (error) { return { status: "error", message: error instanceof Error ? error.message : "수입 입력을 확인해 주세요." }; }
}
export async function excludeIncome(incomeId: string, _previous: TransactionFormState, formData: FormData): Promise<TransactionFormState> {
  const owner = await getOwnerContext(); assertCanMutate(owner);
  const excluded = text(formData, "excluded");
  if (excluded !== "true" && excluded !== "false") return { status: "error", message: "수입 제외 또는 복원을 명확히 선택해 주세요." };
  return save(formData, { kind: "income.exclude", id: incomeId, expected_version: text(formData, "version"), excluded: excluded === "true" });
}
export async function deleteTransaction(transactionId: string, _prevState: TransactionFormState, formData: FormData): Promise<TransactionFormState> {
  const owner = await getOwnerContext(); assertCanMutate(owner);
  return save(formData, { kind: "transaction.exclude", id: transactionId, expected_version: text(formData, "version"), excluded: true });
}
export async function createTransactionRefund(transactionId: string, _previous: TransactionFormState, data: FormData): Promise<TransactionFormState> {
  const owner = await getOwnerContext(); assertCanMutate(owner);
  try {
    return await save(data, { kind: "refund.create", id: text(data, "entryId"), source: { transaction_id: transactionId, occurred_at: occurredAt(data), amount: purchaseAmount(text(data, "amount")), memo: text(data, "memo") || null } });
  } catch (error) { return { status: "error", message: error instanceof Error ? error.message : "환불 입력을 확인해 주세요." }; }
}
export async function saveTransactionAnnotation(annotationId: string | null, _previous: TransactionFormState, data: FormData): Promise<TransactionFormState> {
  const owner = await getOwnerContext(); assertCanMutate(owner);
  try {
    const source = { transaction_id: text(data, "transactionId"), target_kind: text(data, "targetKind"), target_key: text(data, "targetKey"), scope_instance_key: text(data, "scopeInstanceKey") || null,
      amount: purchaseAmount(text(data, "amount"), true), basis_auto_amount: text(data, "basisAutoAmount") === "" ? null : purchaseAmount(text(data, "basisAutoAmount"), true), basis_input_revision: text(data, "basisInputRevision"), basis_rule_version_id: text(data, "basisRuleVersionId") || null };
    // The RPC atomically checks owner revision, exact current target and entry version.
    return await save(data, annotationId ? { kind: "annotation.update", id: annotationId, expected_version: text(data, "version"), source } : { kind: "annotation.create", id: text(data, "entryId"), source });
  } catch (error) { return { status: "error", message: error instanceof Error ? error.message : "보정 입력을 확인해 주세요." }; }
}
export async function restoreTransactionAutomatic(_previous: TransactionFormState, data: FormData): Promise<TransactionFormState> {
  const owner = await getOwnerContext(); assertCanMutate(owner);
  try {
    const entries: { id: string; version: string }[] = JSON.parse(text(data, "annotations"));
    return await save(data, { kind: "batch", commands: entries.map(entry => ({ kind: "annotation.void", id: entry.id, expected_version: entry.version })) });
  } catch { return { status: "error", message: "보정 버전을 확인한 뒤 다시 열어 주세요." }; }
}
export async function deleteTransactions(entries: { kind?: "expense" | "income" | "refund"; id: string; version: string }[], requestId: string, month: string): Promise<TransactionFormState> {
  const owner = await getOwnerContext(); assertCanMutate(owner);
  return formResult(await applyLedgerCommand(requestId, { kind: "batch", commands: entries.map(entry => {
    const source = { id: entry.id, expected_version: entry.version };
    switch (entry.kind) {
      case undefined: case "expense": return { kind: "transaction.exclude", ...source, excluded: true };
      case "income": return { kind: "income.exclude", ...source, excluded: true };
      case "refund": return { kind: "refund.void", ...source };
      default: return { kind: "invalid" }; // Never silently interpret an unknown source as expense.
    }
  }) }, month));
}
