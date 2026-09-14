"use client";
import { useEffect, useId, useRef, type ReactNode } from "react";
/** Native modal focus containment, Escape and trigger-focus restoration. */
export function LedgerDialog({ title, locked, onClose, children }: { title: string; locked: boolean; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog?.showModal();
    return () => { dialog?.close(); if (trigger?.isConnected) trigger.focus(); };
  }, []);
  return <dialog ref={ref} className="ledger-dialog" aria-labelledby={titleId} onCancel={event => { event.preventDefault(); if (!locked) onClose(); }}>
    <div className="ledger-dialog-header"><h2 id={titleId}>{title}</h2><button type="button" disabled={locked} onClick={onClose} aria-label="닫기">닫기</button></div>
    {locked ? <p role="status" className="workspace-note">저장 결과 확인 전에는 닫을 수 없습니다. 미확인 요청은 같은 화면에서 재시도하세요.</p> : null}
    {children}
  </dialog>;
}
