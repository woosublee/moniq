import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CardSupportBadge } from "./card-support-badge";

// Catalog identities are public product data, never ownership/ledger fixtures.
describe("catalog support presentation", () => {
  it.each(["탄탄대로 Biz 티타늄카드", "탄탄대로 Miz&Mr 티타늄카드"])("does not activate %s from a stale legacy full flag", (name) => {
    const html = renderToStaticMarkup(<CardSupportBadge status="full" {...{ card: { issuer: "KB국민", name } }} />);
    expect(html).toContain("공식 설명서 확보");
    expect(html).toContain("일부 조건 구현");
    expect(html).toContain("적용 기간 미검증");
    expect(html).not.toContain("혜택 계산 지원");
  });

  it("does not substitute Biz titanium terms for All Shopping or generic Biz", () => {
    for (const name of ["탄탄대로 올쇼핑", "탄탄대로 Biz카드"]) {
      const html = renderToStaticMarkup(<CardSupportBadge status="none" {...{ card: { issuer: "KB국민", name } }} />);
      expect(html).not.toContain("공식 설명서 확보");
      expect(html).toContain("검증 대기");
    }
  });
});
