"use client";

import { useActionState } from "react";

import {
  requestLoginLink,
  signOut,
  type AuthActionState,
} from "@/app/auth/actions";

const initialState: AuthActionState = {
  status: "idle",
  message: "",
};

type AuthPanelProps = {
  nextPath: string;
  callbackFailed?: boolean;
};

export function AuthPanel({ nextPath, callbackFailed = false }: AuthPanelProps) {
  const [state, formAction, isPending] = useActionState(
    requestLoginLink,
    initialState,
  );

  return (
    <div className="max-w-xl rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      {callbackFailed ? (
        <p
          className="mb-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700"
          role="alert"
        >
          로그인 링크를 확인하지 못했습니다. 새 로그인 링크를 요청해 주세요.
        </p>
      ) : null}

      <form action={formAction}>
        <input type="hidden" name="next" value={nextPath} />
        <label className="block text-sm font-medium text-slate-700" htmlFor="email">
          이메일
        </label>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            placeholder="you@example.com"
            className="min-h-11 flex-1 rounded-2xl border border-slate-200 px-4 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
          />
          <button
            type="submit"
            disabled={isPending}
            className="min-h-11 rounded-2xl bg-slate-950 px-5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPending ? "전송 중" : "로그인 링크 받기"}
          </button>
        </div>
        {state.message ? (
          <p
            className={`mt-3 text-sm font-medium ${
              state.status === "error" ? "text-red-600" : "text-emerald-700"
            }`}
            aria-live="polite"
          >
            {state.message}
          </p>
        ) : null}
      </form>

      <div className="mt-5 border-t border-slate-100 pt-4">
        <p className="text-xs leading-5 text-slate-500">
          다른 계정으로 다시 시작하려면 현재 세션에서 로그아웃하세요.
        </p>
        <form action={signOut} className="mt-2">
          <button
            type="submit"
            className="min-h-9 rounded-xl border border-slate-200 px-3 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-950"
          >
            로그아웃
          </button>
        </form>
      </div>
    </div>
  );
}
