import { describe, expect, it } from "vitest";

import { GET } from "@/app/demo/entry/route";

describe("demo entry route", () => {
  it("enables synthetic demo mode in a private non-cacheable response", () => {
    const response = GET(new Request("https://moniq.local/demo/entry"));

    expect(response.headers.get("location")).toBe("https://moniq.local/");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("set-cookie")).toContain("moniq_demo=1");
  });
});
