import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  cookieWrites: [] as unknown[][],
  createServerClient: vi.fn(
    (
      url: string,
      key: string,
      options: {
        cookies: {
          getAll: () => { name: string; value: string }[];
          setAll: (cookies: unknown[]) => void;
        };
      },
    ) => ({ url, key, options }),
  ),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({
  env: {
    nextPublicSupabaseUrl: "https://project.example.supabase.co",
    nextPublicSupabaseAnonKey: "synthetic-anon-key",
  },
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    getAll: () => [{ name: "sb-session", value: "session-value" }],
    set: (...args: unknown[]) => state.cookieWrites.push(args),
  }),
}));
vi.mock("@supabase/ssr", () => ({
  createServerClient: state.createServerClient,
}));

import { createSupabaseServerClient } from "@/lib/supabase/server";

describe("createSupabaseServerClient", () => {
  beforeEach(() => {
    state.cookieWrites.length = 0;
    state.createServerClient.mockClear();
  });

  it("uses the publishable client with the request cookie adapter", async () => {
    const pendingClient = createSupabaseServerClient();

    expect(pendingClient).toBeInstanceOf(Promise);

    const client = await pendingClient;
    const [url, key, options] = state.createServerClient.mock.calls[0];

    expect(client).toEqual({ url, key, options });
    expect(url).toBe("https://project.example.supabase.co");
    expect(key).toBe("synthetic-anon-key");
    expect(options.cookies.getAll()).toEqual([
      { name: "sb-session", value: "session-value" },
    ]);

    options.cookies.setAll([
      {
        name: "sb-session",
        value: "refreshed-value",
        options: { path: "/", httpOnly: true },
      },
    ]);

    expect(state.cookieWrites).toEqual([
      ["sb-session", "refreshed-value", { path: "/", httpOnly: true }],
    ]);
  });
});
