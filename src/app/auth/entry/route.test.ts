import { describe, expect, it } from "vitest";

import { GET } from "@/app/auth/entry/route";

describe("auth entry route", () => {
  it("clears demo mode in a private non-cacheable response", () => {
    const response = GET(
      new Request("https://moniq.local/auth/entry", {
        headers: { cookie: "moniq_demo=1" },
      }),
    );

    expect(response.headers.get("location")).toBe("https://moniq.local/auth");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("set-cookie")).toContain("moniq_demo=");
  });
});
