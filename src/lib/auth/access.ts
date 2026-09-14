import type { SupabaseClient } from "@supabase/supabase-js";

export type AppMemberRole = "owner";

export type AccessDecision =
  | {
      status: "allowed";
      userId: string;
      role: AppMemberRole;
    }
  | {
      status: "unauthenticated" | "not_allowed" | "revoked" | "owner_mismatch";
    };

type AppMemberRecord = {
  user_id: string;
  role: string;
  is_active: boolean;
};

export async function getAccessDecision(
  supabase: SupabaseClient,
  requestedOwnerId?: string,
): Promise<AccessDecision> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { status: "unauthenticated" };
  }

  const { data, error: membershipError } = await supabase
    .from("app_members")
    .select("user_id, role, is_active")
    .eq("user_id", user.id)
    .maybeSingle();

  if (membershipError) {
    throw new Error("사용 권한을 확인하지 못했습니다.");
  }

  const membership = data as AppMemberRecord | null;

  if (!membership || membership.user_id !== user.id || membership.role !== "owner") {
    return { status: "not_allowed" };
  }

  if (!membership.is_active) {
    return { status: "revoked" };
  }

  if (requestedOwnerId && requestedOwnerId !== user.id) {
    return { status: "owner_mismatch" };
  }

  return {
    status: "allowed",
    userId: user.id,
    role: "owner",
  };
}

export function getSafeRedirectPath(candidate: string | null | undefined) {
  if (!candidate?.startsWith("/")) {
    return "/";
  }

  try {
    const baseUrl = new URL("https://moniq.local");
    const redirectUrl = new URL(candidate, baseUrl);

    if (
      redirectUrl.origin !== baseUrl.origin ||
      !redirectUrl.pathname.startsWith("/") ||
      redirectUrl.pathname.startsWith("//")
    ) {
      return "/";
    }

    return `${redirectUrl.pathname}${redirectUrl.search}${redirectUrl.hash}`;
  } catch {
    return "/";
  }
}
