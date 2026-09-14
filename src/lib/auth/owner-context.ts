import type { AccessDecision, AppMemberRole } from "@/lib/auth/access";

export const DEMO_OWNER_ID = "00000000-0000-4000-8000-000000000999";

export type OwnerMode = "authenticated" | "demo";

export type OwnerContext = {
  ownerId: string;
  mode: OwnerMode;
  canMutate: boolean;
  role: AppMemberRole | null;
};

type ResolveOwnerContextInput = {
  isDemo: boolean;
  access: AccessDecision;
};

export function resolveOwnerContext({
  isDemo,
  access,
}: ResolveOwnerContextInput): OwnerContext | null {
  if (isDemo) {
    return {
      ownerId: DEMO_OWNER_ID,
      mode: "demo",
      canMutate: false,
      role: null,
    };
  }

  if (access.status !== "allowed") {
    return null;
  }

  return {
    ownerId: access.userId,
    mode: "authenticated",
    canMutate: true,
    role: access.role,
  };
}
