import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getAccessDecision } from "@/lib/auth/access";
import {
  resolveOwnerContext,
  type OwnerContext,
  type OwnerMode,
} from "@/lib/auth/owner-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type { OwnerContext, OwnerMode };

const demoCookieName = "moniq_demo";
const personalDataAccessError = "이 데이터에 접근할 권한이 없습니다.";

export async function getOwnerContext(): Promise<OwnerContext> {
  const cookieStore = await cookies();
  const isDemo = cookieStore.get(demoCookieName)?.value === "1";

  if (isDemo) {
    return resolveOwnerContext({
      isDemo: true,
      access: { status: "unauthenticated" },
    }) as OwnerContext;
  }

  const supabase = await createSupabaseServerClient();
  const access = await getAccessDecision(supabase);
  const owner = resolveOwnerContext({ isDemo: false, access });

  if (!owner) {
    redirect(`/auth?reason=${access.status}`);
  }

  return owner;
}

export async function createAuthorizedSupabaseServerClient(
  ownerId: string,
): Promise<SupabaseClient> {
  const supabase = await createSupabaseServerClient();
  const access = await getAccessDecision(supabase, ownerId);

  if (access.status !== "allowed") {
    throw new Error(personalDataAccessError);
  }

  return supabase;
}

export function assertCanMutate(owner: OwnerContext) {
  if (!owner.canMutate) {
    throw new Error("데모 모드에서는 데이터를 변경할 수 없습니다.");
  }
}
