import type { SupabaseClient, User } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { getAccessDecision, getSafeRedirectPath } from "@/lib/auth/access";

const activeUser = {
  id: "00000000-0000-4000-8000-000000000101",
  app_metadata: {},
  user_metadata: {},
  aud: "authenticated",
  created_at: "2026-09-13T00:00:00.000Z",
} satisfies User;

const createClient = ({
  user,
  membership,
}: {
  user: User | null;
  membership: {
    user_id: string;
    role: string;
    is_active: boolean;
  } | null;
}) =>
  ({
    auth: {
      getUser: async () => ({
        data: { user },
        error: null,
      }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: membership,
            error: null,
          }),
        }),
      }),
    }),
  }) as unknown as SupabaseClient;

describe("getAccessDecision", () => {
  it("denies an unauthenticated request", async () => {
    const decision = await getAccessDecision(
      createClient({ user: null, membership: null }),
    );

    expect(decision).toEqual({ status: "unauthenticated" });
  });

  it("denies an authenticated user without membership", async () => {
    const decision = await getAccessDecision(
      createClient({ user: activeUser, membership: null }),
    );

    expect(decision).toEqual({ status: "not_allowed" });
  });

  it("allows an active owner membership", async () => {
    const decision = await getAccessDecision(
      createClient({
        user: activeUser,
        membership: {
          user_id: activeUser.id,
          role: "owner",
          is_active: true,
        },
      }),
      activeUser.id,
    );

    expect(decision).toEqual({
      status: "allowed",
      userId: activeUser.id,
      role: "owner",
    });
  });

  it("denies a revoked membership", async () => {
    const decision = await getAccessDecision(
      createClient({
        user: activeUser,
        membership: {
          user_id: activeUser.id,
          role: "owner",
          is_active: false,
        },
      }),
    );

    expect(decision).toEqual({ status: "revoked" });
  });

  it("denies access to another owner's identifier", async () => {
    const decision = await getAccessDecision(
      createClient({
        user: activeUser,
        membership: {
          user_id: activeUser.id,
          role: "owner",
          is_active: true,
        },
      }),
      "00000000-0000-4000-8000-000000000202",
    );

    expect(decision).toEqual({ status: "owner_mismatch" });
  });
});

describe("getSafeRedirectPath", () => {
  it.each([
    [
      "/cards?month=2026-09&tab=benefits",
      "/cards?month=2026-09&tab=benefits",
    ],
    ["https://attacker.example/cards", "/"],
    ["//attacker.example/cards", "/"],
    ["/.//attacker.example/path", "/"],
    ["/cards/..//attacker.example/path", "/"],
    ["cards", "/"],
    [null, "/"],
  ])("keeps callback redirects local (%s)", (candidate, expected) => {
    expect(getSafeRedirectPath(candidate)).toBe(expected);
  });
});
