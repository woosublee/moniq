import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  cookieNames: [] as string[],
  createServerClient: vi.fn(
    (
      _url: string,
      _key: string,
      options: {
        cookies: {
          getAll: () => { name: string; value: string }[];
          setAll: (
            cookies: {
              name: string;
              value: string;
              options: { path: string; httpOnly: boolean };
            }[],
          ) => void;
        };
      },
    ) => ({
      auth: {
        getUser: async () => {
          state.cookieNames = options.cookies.getAll().map((cookie) => cookie.name);
          options.cookies.setAll([
            {
              name: "sb-session",
              value: "refreshed-value",
              options: { path: "/", httpOnly: true },
            },
          ]);
          return { data: { user: null }, error: null };
        },
      },
    }),
  ),
}));

vi.mock("@/lib/env", () => ({
  env: {
    nextPublicSupabaseUrl: "https://project.example.supabase.co",
    nextPublicSupabaseAnonKey: "synthetic-anon-key",
  },
}));
vi.mock("@supabase/ssr", () => ({
  createServerClient: state.createServerClient,
}));

import { proxy } from "@/proxy";

describe("proxy", () => {
  it("refreshes auth cookies without making an access decision", async () => {
    const request = new NextRequest("https://moniq.local/cards", {
      headers: {
        cookie: "existing-cookie=value",
      },
    });

    const response = await proxy(request);

    expect(state.cookieNames).toContain("existing-cookie");
    expect(response.cookies.get("sb-session")?.value).toBe("refreshed-value");
    expect(response.headers.get("location")).toBeNull();
    expect(response.status).toBe(200);
  });
});
