"use client";
import { useEffect, useRef, useState } from "react";
import { QuickTransactionForm } from "./quick-transaction-form";
import { LedgerDialog } from "./ledger-dialog";
import type { UserCardRecord } from "@/features/cards/types";

type Props = {
  userCards: UserCardRecord[];
  defaultUserCardId: string | null;
  variant?: "inline" | "floating";
  month?: string;
  allowIncome?: boolean;
  incomeSupported?: boolean;
  readOnly?: boolean;
  /** Opt-in only at the canonical ledger; old card consumers keep their behavior. */
  entryFragments?: boolean;
};
export function TransactionCreateDialog({ userCards, defaultUserCardId, variant = "inline", month, allowIncome = false, incomeSupported = false, readOnly = false, entryFragments = false }: Props) {
  const [open, setOpen] = useState(false);
  const [locked, setLocked] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const lockRef = useRef(false);
  useEffect(() => { lockRef.current = locked; }, [locked]);
  useEffect(() => {
    if (!entryFragments) return;
    const sync = (event?: Event) => {
      if (lockRef.current) return;
      if (["#quick-entry", "#new-transaction"].includes(window.location.hash)) {
        // Consume, don't push: closing/back cannot resurrect a handled input anchor.
        window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
        trigger.current?.focus({ preventScroll: true });
        setOpen(true);
      } else if (event?.type === "popstate") setOpen(false);
      // A hash navigation emits popstate then hashchange. The latter may see the
      // already-consumed fragment and must not close the dialog just opened above.
    };
    const frame = requestAnimationFrame(() => sync());
    window.addEventListener("hashchange", sync);
    window.addEventListener("popstate", sync);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("hashchange", sync);
      window.removeEventListener("popstate", sync);
    };
  }, [entryFragments]);
  return <>
    <button ref={trigger} type="button" onClick={() => setOpen(true)} className={variant === "floating" ? "ledger-submit household-add" : "ledger-submit"}>{allowIncome ? "내역 추가" : "지출 추가"}</button>
    {open ? <LedgerDialog title={allowIncome ? "새 내역 기록" : "새 지출 기록"} locked={locked} onClose={() => setOpen(false)}>
      {readOnly ? <p className="workspace-note">데모는 읽기 전용입니다. 샘플 내역은 저장하거나 변경할 수 없습니다.</p> : <QuickTransactionForm userCards={userCards} defaultUserCardId={defaultUserCardId} compact month={month} allowIncome={allowIncome} incomeSupported={incomeSupported} onLockChange={setLocked} />}
    </LedgerDialog> : null}
  </>;
}
