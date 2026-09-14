import type { User } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  isDemo: false,
  user: null as User | null,
  membership: null as {
    user_id: string;
    role: string;
    is_active: boolean;
  } | null,
  getUserCalls: 0,
}));

const ownerUser = {
  id: "00000000-0000-4000-8000-000000000101",
  app_metadata: {},
  user_metadata: {},
  aud: "authenticated",
  created_at: "2026-09-13T00:00:00.000Z",
} satisfies User;

const client = {
  auth: {
    getUser: async () => {
      state.getUserCalls += 1;
      return { data: { user: state.user }, error: null };
    },
  },
  from: () => ({
    select: () => ({
      eq: () => ({
        maybeSingle: async () => ({ data: state.membership, error: null }),
      }),
    }),
  }),
};

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "moniq_demo" && state.isDemo ? { value: "1" } : undefined,
  }),
}));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`);
  },
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => client,
}));

import {
  createAuthorizedSupabaseServerClient,
  getOwnerContext,
} from "@/lib/auth/owner";
import { DEMO_OWNER_ID } from "@/lib/auth/owner-context";

describe("owner authorization DAL", () => {
  beforeEach(() => {
    state.isDemo = false;
    state.user = null;
    state.membership = null;
    state.getUserCalls = 0;
  });

  it("returns a synthetic read-only context without querying auth in demo mode", async () => {
    state.isDemo = true;

    await expect(getOwnerContext()).resolves.toEqual({
      ownerId: DEMO_OWNER_ID,
      mode: "demo",
      canMutate: false,
      role: null,
    });
    expect(state.getUserCalls).toBe(0);
  });

  it("redirects an unauthenticated request to the auth page", async () => {
    await expect(getOwnerContext()).rejects.toThrow(
      "REDIRECT:/auth?reason=unauthenticated",
    );
  });

  it("returns the active authenticated owner", async () => {
    state.user = ownerUser;
    state.membership = {
      user_id: ownerUser.id,
      role: "owner",
      is_active: true,
    };

    await expect(getOwnerContext()).resolves.toEqual({
      ownerId: ownerUser.id,
      mode: "authenticated",
      canMutate: true,
      role: "owner",
    });
  });

  it("rejects a personal data request for another owner", async () => {
    state.user = ownerUser;
    state.membership = {
      user_id: ownerUser.id,
      role: "owner",
      is_active: true,
    };

    await expect(
      createAuthorizedSupabaseServerClient(
        "00000000-0000-4000-8000-000000000202",
      ),
    ).rejects.toThrow("이 데이터에 접근할 권한이 없습니다.");
  });
});
