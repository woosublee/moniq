"use client";

import { useFormStatus } from "react-dom";

export function SubmitButton({ retry = false }: { retry?: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-12 items-center justify-center rounded-full bg-slate-950 px-5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
    >
      {pending ? "저장 중..." : retry ? "같은 요청 확인 / 재시도" : "지출 저장"}
    </button>
  );
}
