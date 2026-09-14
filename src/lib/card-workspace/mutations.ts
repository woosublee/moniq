import "server-only";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertCanMutate, createAuthorizedSupabaseServerClient, getOwnerContext } from "@/lib/auth/owner";
import { monthKeySchema } from "@/features/card-benefits/month-inputs";
import { ledgerCommandSchema, requestIdSchema, revisionSchema } from "./commands";
import { loadLedgerWorkspace } from "./load";
import type { IncomeSource } from "@/features/ledger/types";
import type { CardWorkspace } from "./view-model";

const receiptSchema = z.object({ requestId: requestIdSchema, ownerRevision: revisionSchema, resultIds: z.array(z.uuid()), replayed: z.boolean() });
export type LedgerReceipt = z.infer<typeof receiptSchema>;
export type LedgerMutationResult = {
  status: "saved" | "saved_needs_review" | "rejected" | "outcome_unknown";
  requestId: string;
  message: string;
  receipt: LedgerReceipt | null;
  workspace: CardWorkspace | null;
  /** Null means no validated post-commit snapshot; unsupported is a valid old snapshot. */
  incomeSource: IncomeSource | null;
};
function invalidateWorkspace() {
  revalidatePath("/");
  revalidatePath("/ledger");
  revalidatePath("/dashboard");
  revalidatePath("/cards");
  revalidatePath("/cards/search");
  revalidatePath("/cards/[userCardId]", "page");
  revalidatePath("/transactions/new");
  revalidatePath("/benefits");
}
export async function applyLedgerCommand(requestId: string, input: unknown, month: string): Promise<LedgerMutationResult> {
  const owner = await getOwnerContext();
  assertCanMutate(owner);
  const parsed = ledgerCommandSchema.safeParse(input);
  if (!requestIdSchema.safeParse(requestId).success || !parsed.success || !monthKeySchema.safeParse(month).success) return {
    status: "rejected", requestId, message: "입력값 또는 요청 식별자를 확인해 주세요.", receipt: null, workspace: null, incomeSource: null,
  };
  const supabase = await createAuthorizedSupabaseServerClient(owner.ownerId);
  let response;
  try {
    response = await supabase.rpc("apply_ledger_command", { request_id: requestId, command: parsed.data });
  } catch {
    return { status: "outcome_unknown", requestId, message: "저장 응답을 확인하지 못했습니다. 같은 요청으로 다시 확인해 주세요.", receipt: null, workspace: null, incomeSource: null };
  }
  if (response.error) {
    // An explicit database exception is a rollback; a gateway/network error isn't proof of rollback.
    const code = response.error.code ?? "";
    const rejected = /^[0-9A-Z]{5}$/.test(code) && !/^(08|PGRST)/.test(code);
    return { status: rejected ? "rejected" : "outcome_unknown", requestId, message: rejected ? response.error.message : "저장 응답을 확인하지 못했습니다. 같은 요청으로 다시 확인해 주세요.", receipt: null, workspace: null, incomeSource: null };
  }
  const receipt = receiptSchema.safeParse(response.data);
  if (!receipt.success || receipt.data.requestId !== requestId) return { status: "outcome_unknown", requestId, message: "저장 응답을 확인하지 못했습니다. 같은 요청으로 다시 확인해 주세요.", receipt: null, workspace: null, incomeSource: null };
  const changesIncome = (parsed.data.kind === "batch" ? parsed.data.commands : [parsed.data]).some(command => command.kind.startsWith("income."));
  try {
    invalidateWorkspace();
    const { cardWorkspace: workspace, incomeSource } = await loadLedgerWorkspace(owner.ownerId, month);
    if (BigInt(workspace.ownerRevision) < BigInt(receipt.data.ownerRevision)) throw new Error("stale post-commit snapshot");
    if (changesIncome && incomeSource?.status !== "supported") throw new Error("income support missing after commit");
    return { status: "saved", requestId, message: "저장되었습니다.", receipt: receipt.data, workspace, incomeSource };
  } catch {
    return { status: "saved_needs_review", requestId, message: `저장됨 · ${changesIncome ? "수입 내역" : "계산"} 확인 필요 (${receipt.data.resultIds.join(", ")})`, receipt: receipt.data, workspace: null, incomeSource: null };
  }
}
