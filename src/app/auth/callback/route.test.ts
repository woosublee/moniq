import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  exchangedCodes: [] as string[],
  exchangeError: null as { message: string } | null,
  exchangeFailure: null as Error | null,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      exchangeCodeForSession: async (code: string) => {
        state.exchangedCodes.push(code);

        if (state.exchangeFailure) {
          throw state.exchangeFailure;
        }

        return { data: {}, error: state.exchangeError };
      },
    },
  }),
}));

import { GET } from "@/app/auth/callback/route";

describe("auth callback", () => {
  beforeEach(() => {
    state.exchangedCodes.length = 0;
    state.exchangeError = null;
    state.exchangeFailure = null;
  });

  it("exchanges the PKCE code and preserves a safe local query", async () => {
    const requestUrl = new URL("https://moniq.local/auth/callback");
    requestUrl.searchParams.set("code", "synthetic-code");
    requestUrl.searchParams.set(
      "next",
      "/cards?month=2026-09&tab=benefits",
    );

    const response = await GET(new Request(requestUrl));

    expect(state.exchangedCodes).toEqual(["synthetic-code"]);
    expect(response.headers.get("location")).toBe(
      "https://moniq.local/cards?month=2026-09&tab=benefits",
    );
  });

  it("rejects an external callback destination", async () => {
    const response = await GET(
      new Request(
        "https://moniq.local/auth/callback?code=synthetic-code&next=https%3A%2F%2Fattacker.example",
      ),
    );

    expect(response.headers.get("location")).toBe("https://moniq.local/");
  });

  it.each([
    "/.//attacker.example/path",
    "/cards/..//attacker.example/path",
  ])("rejects a path that normalizes to a protocol-relative URL (%s)", async (next) => {
    const requestUrl = new URL("https://moniq.local/auth/callback");
    requestUrl.searchParams.set("code", "synthetic-code");
    requestUrl.searchParams.set("next", next);

    const response = await GET(new Request(requestUrl));

    expect(response.headers.get("location")).toBe("https://moniq.local/");
  });

  it("returns a generic auth error when the code exchange fails", async () => {
    state.exchangeError = { message: "invalid verifier" };

    const response = await GET(
      new Request(
        "https://moniq.local/auth/callback?code=synthetic-code&next=%2Fcards",
      ),
    );

    expect(response.headers.get("location")).toBe(
      "https://moniq.local/auth?error=callback",
    );
  });

  it("does not expose an unexpected exchange failure", async () => {
    state.exchangeFailure = new Error("sensitive provider detail");

    const response = await GET(
      new Request(
        "https://moniq.local/auth/callback?code=synthetic-code&next=%2Fcards",
      ),
    );

    expect(response.headers.get("location")).toBe(
      "https://moniq.local/auth?error=callback",
    );
  });
});
