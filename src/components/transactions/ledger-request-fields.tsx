"use client";
import { createContext, startTransition, useActionState, useCallback, useContext, useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import type { RevisionValue } from "@/features/card-benefits/types";
import { currentSeoulMonth } from "@/lib/card-workspace/view-model";

type BoundaryState = { active: string | null; complete: boolean };
const MutationBoundary = createContext<(BoundaryState & { acquire: (id: string) => boolean; settle: (id: string, status: FormState["status"]) => void }) | null>(null);
/** One mounted source/basis snapshot: peers cannot mutate while a result is unknown. */
export function LedgerMutationBoundary({ children, onLockChange }: { children: ReactNode; onLockChange?: (locked: boolean) => void }) {
  const current = useRef<BoundaryState>({ active: null, complete: false });
  const [state, setState] = useState<BoundaryState>({ active: null, complete: false });
  const acquire = useCallback((id: string) => {
    if (current.current.complete || (current.current.active && current.current.active !== id)) return false;
    current.current = { active: id, complete: false };
    setState(current.current);
    return true;
  }, []);
  const settle = useCallback((id: string, status: FormState["status"]) => {
    if (current.current.active !== id || status === "outcome_unknown") return;
    current.current = { active: null, complete: status === "success" || status === "saved_needs_review" };
    setState(current.current);
  }, []);
  useEffect(() => { onLockChange?.(state.active !== null); }, [state.active, onLockChange]);
  return <MutationBoundary.Provider value={{ ...state, acquire, settle }}>{children}{state.complete ? <p role="status" className="ledger-preserved">저장되었습니다. 다른 항목을 수정하려면 닫고 최신 자료로 다시 열어 주세요.</p> : null}</MutationBoundary.Provider>;
}

type FormState = { status: "idle" | "success" | "error" | "saved_needs_review" | "outcome_unknown"; message: string; requestId?: string; resultIds?: string[] };
export function LedgerActionFeedback({ state }: { state: FormState }) {
  return state.message ? <div role="status" className="ledger-feedback"><p>{state.message}</p>{state.status === "outcome_unknown" ? <p>확인 전에는 편집·닫기를 잠급니다. 같은 요청 재시도는 최초 입력과 UUID를 그대로 보냅니다.</p> : null}{state.status === "saved_needs_review" ? <p>저장된 항목 {state.resultIds?.join(", ")} · 다시 저장하지 말고 최신 계산을 확인하세요.</p> : null}</div> : null;
}
/** All small mutation forms use the same request controller and lock lifecycle. */
export function LedgerActionForm<S extends FormState>({ action, initial, version, month, create = false, children, submitLabel, onState, disabled = false }: Options & { action: (previous: S, data: FormData) => Promise<S>; initial: S; children: ReactNode; submitLabel: string; onState?: (state: S, pending: boolean) => void; disabled?: boolean }) {
  const [state, formAction, pending, onSubmit, blocked] = useLedgerActionState(action, initial, { version, month, create });
  const complete = state.status === "success" || state.status === "saved_needs_review";
  useEffect(() => { onState?.(state, pending); }, [state, pending, onState]);
  return <form action={formAction} onSubmit={onSubmit} noValidate={state.status === "outcome_unknown"} className="ledger-small-form">
    <LedgerRequestFields version={version} month={month} create={create} state={state} />
    <fieldset disabled={disabled || blocked || pending || complete || state.status === "outcome_unknown"}>{children}</fieldset>
    <LedgerActionFeedback state={state} />
    <button type="submit" className="ledger-submit" disabled={disabled || blocked || pending || complete}>{pending ? "저장 중…" : state.status === "outcome_unknown" ? "같은 요청 재시도" : complete ? "저장됨 · 최신 자료로 다시 열기" : submitLabel}</button>
  </form>;
}
type Options = { version?: RevisionValue; month?: string; create?: boolean };
function copyForm(data: FormData) { const copy = new FormData(); for (const [key, value] of data) copy.append(key, value); return copy; }

/** Keeps the submitted payload, not just its key, while the commit outcome is unknown. */
export function createLedgerFormAttempt<S extends FormState>(action: (previous: S, data: FormData) => Promise<S>, options: Options) {
  const version = String(options.version ?? "");
  const month = options.month ?? currentSeoulMonth();
  const create = options.create === true;
  let attempt: FormData | null = null;
  let committed = false;
  return async (previous: S, incoming: FormData): Promise<S> => {
    if (committed && !create) return { ...previous, status: "error", message: "이미 저장했습니다. 최신 버전으로 다시 열어 수정해 주세요." };
    if (!attempt) {
      attempt = copyForm(incoming);
      // Last synchronous boundary before invoking the server action: blank/reset/stale
      // DOM IDs cannot escape even when the user submits before the mount effect.
      attempt.set("requestId", crypto.randomUUID());
      if (create) attempt.set("entryId", crypto.randomUUID());
      attempt.set("version", version);
      attempt.set("month", month);
    }
    let result: S;
    try { result = await action(previous, copyForm(attempt)); }
    catch { result = { ...previous, status: "outcome_unknown", message: "응답을 확인하지 못했습니다. 이 화면에서 같은 요청을 재시도해 주세요." }; }
    result = { ...result, requestId: String(attempt.get("requestId")) };
    if (result.status !== "outcome_unknown") {
      committed = result.status === "success" || result.status === "saved_needs_review";
      attempt = null;
    }
    return result;
  };
}
export function useLedgerActionState<S extends FormState>(action: (previous: S, data: FormData) => Promise<S>, initial: S, options: Options) {
  // Intentionally captures the action target/version/month of this mounted form.
  const submitting = useRef(false);
  const hydratedSubmissions = useRef(new WeakSet<FormData>());
  const id = useId();
  const boundary = useContext(MutationBoundary);
  const blocked = Boolean(boundary?.complete || (boundary?.active && boundary.active !== id));
  const [attempt] = useState(() => {
    const run = createLedgerFormAttempt(action, options);
    let queuedBeforeHydration = false;
    return async (previous: S, data: FormData) => {
      try {
        // React serializes its pre-hydration queue. Repeated clicks in that queue
        // must not become new create requests after the first response resolves.
        if (!hydratedSubmissions.current.has(data) && !data.get("requestId")) {
          if (queuedBeforeHydration) return previous;
          queuedBeforeHydration = true;
        }
        if (boundary && !boundary.acquire(id)) return { ...previous, status: "error" as const, message: "진행 중인 요청을 확인하거나 최신 자료로 다시 열어 주세요." };
        const result = await run(previous, data);
        boundary?.settle(id, result.status);
        return result;
      } finally { submitting.current = false; }
    };
  });
  const [state, dispatch, pending] = useActionState<S, FormData>(attempt, initial as Awaited<S>);
  // Native React action forms reset on any resolved response, including rejection.
  // Intercept only hydrated submissions; reset is an explicit confirmed-create effect.
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting.current || blocked || (boundary && !boundary.acquire(id))) return;
    submitting.current = true;
    const data = new FormData(event.currentTarget, (event.nativeEvent as SubmitEvent).submitter);
    hydratedSubmissions.current.add(data);
    startTransition(() => dispatch(data));
  };
  return [state, dispatch, pending, onSubmit, blocked] as const;
}

export function LedgerRequestFields({ version, month, create = false, state }: Options & { state?: FormState }) {
  const request = useRef<HTMLInputElement>(null);
  const entry = useRef<HTMLInputElement>(null);
  const [initial] = useState(() => ({ version: String(version ?? ""), month: month ?? currentSeoulMonth() }));
  useEffect(() => {
    const form = request.current?.form;
    // React can replay a submission queued before hydration without our onSubmit.
    // Cancel its native reset unless a committed response was acknowledged.
    const preserveInput = (event: Event) => {
      if (state?.status !== "success" && state?.status !== "saved_needs_review") event.preventDefault();
    };
    form?.addEventListener("reset", preserveInput);
    return () => form?.removeEventListener("reset", preserveInput);
  }, [state?.status]);
  useEffect(() => {
    const completed = state?.status === "success" || state?.status === "saved_needs_review";
    if (request.current) request.current.defaultValue = request.current.value = completed ? crypto.randomUUID() : state?.requestId || request.current.value || crypto.randomUUID();
    if (entry.current && (completed || !entry.current.value)) entry.current.defaultValue = entry.current.value = crypto.randomUUID();
  }, [state?.status, state?.requestId]);
  return <>
    <input ref={request} type="hidden" name="requestId" defaultValue="" />
    {create ? <input ref={entry} type="hidden" name="entryId" defaultValue="" /> : null}
    <input type="hidden" name="version" defaultValue={initial.version} />
    <input type="hidden" name="month" defaultValue={initial.month} />
  </>;
}

/** Minimal wrapper for the existing card row buttons; no additional layout. */
export function LedgerMutationForm({ action, version, month, children }: { action: (data: FormData) => Promise<FormState>; version?: RevisionValue; month?: string; children: ReactNode }) {
  const [state, formAction, pending, onSubmit] = useLedgerActionState((_previous: FormState, data: FormData) => action(data), { status: "idle", message: "" }, { version, month });
  return <form action={formAction} onSubmit={onSubmit} noValidate={state.status === "outcome_unknown"}>
    <LedgerRequestFields version={version} month={month} state={state} />
    <fieldset disabled={pending || state.status === "success" || state.status === "saved_needs_review"}>{children}</fieldset>
    {state.message ? <p role="status" className="max-w-48 text-xs text-amber-800">{state.message}</p> : null}
  </form>;
}
