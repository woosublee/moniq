"use server";

import type { CardRecord, UserCardFormState } from "@/features/cards/types";
import { assertCanMutate, getOwnerContext } from "@/lib/auth/owner";
import { applyLedgerCommand } from "@/lib/card-workspace/mutations";
import { currentSeoulMonth } from "@/lib/card-workspace/view-model";
import { searchCards } from "@/lib/supabase/queries";
import { formText as text, integerInput } from "@/lib/card-workspace/form-data";

export async function searchCardCatalog(query: string): Promise<CardRecord[]> {
  const owner = await getOwnerContext();
  return searchCards(query, owner.ownerId);
}
export async function registerUserCard(_prevState: UserCardFormState, formData: FormData): Promise<UserCardFormState> {
  const owner = await getOwnerContext(); assertCanMutate(owner);
  const result = await applyLedgerCommand(String(formData.get("requestId") ?? ""), {
    kind: "card.create", id: String(formData.get("entryId") ?? ""), source: {
      card_id: String(formData.get("cardId") ?? ""), alias: String(formData.get("alias") ?? "").trim() || null,
    },
  }, String(formData.get("month") || currentSeoulMonth()));
  return { status: result.status === "saved" ? "success" : result.status === "rejected" ? "error" : result.status,
    message: result.message, requestId: result.requestId, resultIds: result.receipt?.resultIds };
}
async function mutateCard(userCardId: string, data: FormData, kind: "card.default" | "card.archive") {
  const owner = await getOwnerContext(); assertCanMutate(owner);
  const result = await applyLedgerCommand(String(data.get("requestId") ?? ""), { kind, id: userCardId, expected_version: String(data.get("version") ?? "") }, String(data.get("month") || currentSeoulMonth()));
  return { status: result.status === "saved" ? "success" as const : result.status === "rejected" ? "error" as const : result.status, message: result.message, requestId: result.requestId, resultIds: result.receipt?.resultIds };
}
export async function saveCardMonthInput(id: string | null, _previous: UserCardFormState, data: FormData): Promise<UserCardFormState> {
  const owner = await getOwnerContext(); assertCanMutate(owner);
  try {
    const status = text(data, "dataStatus");
    const source = { month: text(data, "inputMonth"), scopeKind: text(data, "scopeKind") || "performance", scopeKey: text(data, "scopeKey"), scopeInstanceKey: text(data, "scopeInstanceKey"), data: status === "manual_total" || status === "remaining" ? { status, amount: integerInput(text(data, "amount"), true) } : { status } };
    const result = await applyLedgerCommand(text(data, "requestId"), id ? { kind: "month_input.update", id, expected_version: text(data, "version"), source } : { kind: "month_input.create", id: text(data, "entryId"), source }, text(data, "month"));
    return { status: result.status === "saved" ? "success" : result.status === "rejected" ? "error" : result.status, message: result.message, requestId: result.requestId, resultIds: result.receipt?.resultIds };
  } catch (error) { return { status: "error", message: error instanceof Error ? error.message : "월 자료를 확인해 주세요." }; }
}
export async function saveCardTarget(id: string, _previous: UserCardFormState, data: FormData): Promise<UserCardFormState> {
  const owner = await getOwnerContext(); assertCanMutate(owner);
  const result = await applyLedgerCommand(text(data, "requestId"), { kind: "card.update", id, expected_version: text(data, "version"), patch: { target_scope_key: text(data, "scopeKey") || null, target_tier_key: text(data, "tierKey") || null } }, text(data, "month"));
  return { status: result.status === "saved" ? "success" : result.status === "rejected" ? "error" : result.status, message: result.message, requestId: result.requestId, resultIds: result.receipt?.resultIds };
}
export async function setDefaultUserCard(userCardId: string, formData: FormData) { return mutateCard(userCardId, formData, "card.default"); }
export async function deleteUserCard(userCardId: string, formData: FormData) { return mutateCard(userCardId, formData, "card.archive"); }
