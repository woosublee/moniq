import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  otpCalls: [] as {
    email: string;
    options: {
      emailRedirectTo: string;
      shouldCreateUser: boolean;
    };
  }[],
  otpError: null as { message: string } | null,
  signOutCalls: 0,
  deletedCookies: [] as string[],
}));

const supabase = {
  auth: {
    signInWithOtp: async (input: {
      email: string;
      options: {
        emailRedirectTo: string;
        shouldCreateUser: boolean;
      };
    }) => {
      state.otpCalls.push(input);
      return { data: {}, error: state.otpError };
    },
    signOut: async () => {
      state.signOutCalls += 1;
      return { error: null };
    },
  },
};

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    delete: (name: string) => state.deletedCookies.push(name),
  }),
  headers: async () => new Headers({ origin: "https://moniq.local" }),
}));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`);
  },
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => supabase,
}));

import { requestLoginLink, signOut } from "@/app/auth/actions";

const submitEmail = (email: string, next = "/cards") => {
  const formData = new FormData();
  formData.set("email", email);
  formData.set("next", next);
  return requestLoginLink({ status: "idle", message: "" }, formData);
};

describe("auth actions", () => {
  beforeEach(() => {
    state.otpCalls.length = 0;
    state.otpError = null;
    state.signOutCalls = 0;
    state.deletedCookies.length = 0;
  });

  it("requests an OTP without creating a new account", async () => {
    await expect(submitEmail("owner@example.com")).resolves.toEqual({
      status: "success",
      message:
        "입력한 이메일로 로그인 링크를 보냈습니다. 등록된 계정과 사용 권한이 있는 경우에만 로그인할 수 있습니다.",
    });
    expect(state.otpCalls).toEqual([
      {
        email: "owner@example.com",
        options: {
          emailRedirectTo:
            "https://moniq.local/auth/callback?next=%2Fcards",
          shouldCreateUser: false,
        },
      },
    ]);
    expect(state.deletedCookies).toContain("moniq_demo");
  });

  it("does not expose whether the account exists", async () => {
    state.otpError = { message: "Signups not allowed for otp" };

    await expect(submitEmail("unknown@example.com")).resolves.toEqual({
      status: "success",
      message:
        "입력한 이메일로 로그인 링크를 보냈습니다. 등록된 계정과 사용 권한이 있는 경우에만 로그인할 수 있습니다.",
    });
  });

  it("rejects malformed email input before external IO", async () => {
    await expect(submitEmail("not-an-email")).resolves.toEqual({
      status: "error",
      message: "이메일 주소를 확인해 주세요.",
    });
    expect(state.otpCalls).toEqual([]);
  });

  it("signs out, clears demo mode, and returns to the auth page", async () => {
    await expect(signOut()).rejects.toThrow("REDIRECT:/auth");
    expect(state.signOutCalls).toBe(1);
    expect(state.deletedCookies).toContain("moniq_demo");
  });
});
