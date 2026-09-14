"use server";

import "server-only";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getSafeRedirectPath } from "@/lib/auth/access";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AuthActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

const emailSchema = z.string().trim().email();
const loginResponseMessage =
  "입력한 이메일로 로그인 링크를 보냈습니다. 등록된 계정과 사용 권한이 있는 경우에만 로그인할 수 있습니다.";

export async function requestLoginLink(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsedEmail = emailSchema.safeParse(formData.get("email"));

  if (!parsedEmail.success) {
    return {
      status: "error",
      message: "이메일 주소를 확인해 주세요.",
    };
  }

  const requestOrigin = (await headers()).get("origin");

  if (!requestOrigin) {
    return {
      status: "error",
      message: "로그인 링크를 요청하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    };
  }

  try {
    const origin = new URL(requestOrigin).origin;
    const nextPath = getSafeRedirectPath(String(formData.get("next") ?? "/"));
    const callbackUrl = new URL("/auth/callback", origin);
    callbackUrl.searchParams.set("next", nextPath);
    const cookieStore = await cookies();
    cookieStore.delete("moniq_demo");
    const supabase = await createSupabaseServerClient();

    await supabase.auth.signInWithOtp({
      email: parsedEmail.data,
      options: {
        emailRedirectTo: callbackUrl.toString(),
        shouldCreateUser: false,
      },
    });
  } catch {
    // Return the same response so the action does not reveal account existence.
  }

  return {
    status: "success",
    message: loginResponseMessage,
  };
}

export async function signOut() {
  const cookieStore = await cookies();
  cookieStore.delete("moniq_demo");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signOut();

  if (error) {
    throw new Error("로그아웃하지 못했습니다. 잠시 후 다시 시도해 주세요.");
  }

  redirect("/auth");
}
