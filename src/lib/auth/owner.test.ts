import { describe, expect, it } from "vitest";

import {
  DEMO_OWNER_ID,
  resolveOwnerContext,
} from "@/lib/auth/owner-context";

describe("resolveOwnerContext", () => {
  it("uses the synthetic read-only owner in demo mode", () => {
    expect(
      resolveOwnerContext({
        isDemo: true,
        access: {
          status: "allowed",
          userId: "00000000-0000-4000-8000-000000000123",
          role: "owner",
        },
      }),
    ).toEqual({
      ownerId: DEMO_OWNER_ID,
      mode: "demo",
      canMutate: false,
      role: null,
    });
  });

  it("uses an authenticated active owner", () => {
    expect(
      resolveOwnerContext({
        isDemo: false,
        access: {
          status: "allowed",
          userId: "00000000-0000-4000-8000-000000000123",
          role: "owner",
        },
      }),
    ).toEqual({
      ownerId: "00000000-0000-4000-8000-000000000123",
      mode: "authenticated",
      canMutate: true,
      role: "owner",
    });
  });

  it("does not create a mutable development owner for denied access", () => {
    expect(
      resolveOwnerContext({
        isDemo: false,
        access: { status: "unauthenticated" },
      }),
    ).toBeNull();
  });
});
