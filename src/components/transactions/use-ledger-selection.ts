"use client";
import { useMemo, useRef, useState, useTransition } from "react";
import { deleteTransactions } from "@/app/transactions/new/actions";

export type SelectableLedgerEntry = { key: string; ref: Parameters<typeof deleteTransactions>[0][number] };
type Selection = { scope: string | undefined; selectedIds: string[]; message: string | null; uncertainDelete: boolean };
/** Existing table's retry controller, shared with the mixed-kind ledger list. */
export function useLedgerSelection(entries: SelectableLedgerEntry[], month: string, action = deleteTransactions, queryScope?: string) {
  const [selection, setSelection] = useState<Selection>({ scope: queryScope, selectedIds: [], message: null, uncertainDelete: false });
  const { selectedIds, message, uncertainDelete } = selection;
  const [isPending, startTransition] = useTransition();
  const pendingDelete = useRef<{ requestId: string; entries: Parameters<typeof deleteTransactions>[0]; month: string; scope: string | undefined } | null>(null);
  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const allSelected = entries.length > 0 && entries.every(entry => selectedIdSet.has(entry.key));
  // Reconcile ordinary query selections without remounting the request owner.
  // Record query changes even while locked, so a later receipt is not erased.
  if (selection.scope !== queryScope) {
    setSelection({ ...selection, scope: queryScope, ...(!isPending && !uncertainDelete ? { selectedIds: [], message: null } : {}) });
  }
  const toggleTransaction = (key: string) => {
    if (uncertainDelete || isPending) return;
    setSelection(current => ({ ...current, message: null, selectedIds: current.selectedIds.includes(key) ? current.selectedIds.filter(id => id !== key) : [...current.selectedIds, key] }));
  };
  const toggleAll = () => {
    if (uncertainDelete || isPending) return;
    setSelection(current => ({ ...current, message: null, selectedIds: allSelected ? [] : entries.map(entry => entry.key) }));
  };
  const clearSelection = () => { if (!uncertainDelete && !isPending) setSelection(current => ({ ...current, selectedIds: [] })); };
  const deleteSelected = () => {
    if (isPending || (!pendingDelete.current && (!selectedIds.length || !window.confirm("실제 환불이 아니라 잘못 입력한 내역인가요? 선택한 내역을 계산에서 제외합니다. 원본은 보존됩니다.")))) return;
    startTransition(async () => {
      pendingDelete.current ??= { requestId: crypto.randomUUID(), entries: entries.filter(entry => selectedIds.includes(entry.key)).map(entry => ({ ...entry.ref })), month, scope: queryScope };
      const attempt = pendingDelete.current;
      let result;
      try { result = await action(attempt.entries, attempt.requestId, attempt.month); }
      catch { result = { status: "outcome_unknown", message: "응답을 확인하지 못했습니다. 같은 제외 요청을 다시 확인해 주세요." }; }
      const unknown = result.status === "outcome_unknown";
      const complete = result.status === "success" || result.status === "saved_needs_review";
      if (!unknown) pendingDelete.current = null;
      setSelection(current => ({
        ...current,
        uncertainDelete: unknown,
        // A definite rejection keeps same-query input; off-query targets must
        // not become a new request assembled from unrelated displayed rows.
        selectedIds: complete || (!unknown && current.scope !== attempt.scope) ? [] : current.selectedIds,
        message: result.status === "success" ? null : unknown ? `${result.message} 확인 전에는 선택을 바꿀 수 없습니다.` : result.message,
      }));
    });
  };
  return { selectedIds, selectedIdSet, message, uncertainDelete, isPending, allSelected, toggleTransaction, toggleAll, clearSelection, deleteSelected };
}
