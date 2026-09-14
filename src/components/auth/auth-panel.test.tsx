import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/auth/actions", () => ({
  requestLoginLink: async () => ({ status: "success", message: "sent" }),
  signOut: async () => {},
}));
vi.mock("@/lib/supabase/client", () => ({
  supabaseBrowserClient: {
    auth: {
      signInWithOtp: async () => ({ error: null }),
    },
  },
}));

import { AuthPanel } from "@/components/auth/auth-panel";

describe("AuthPanel", () => {
  it("posts email login requests with the local continuation path", () => {
    const html = renderToStaticMarkup(<AuthPanel nextPath="/cards" />);

    expect(html).toContain('name="email"');
    expect(html).toContain('name="next"');
    expect(html).toContain('value="/cards"');
    expect(html).toContain("로그인 링크 받기");
  });

  it("shows a generic callback error and exposes logout", () => {
    const html = renderToStaticMarkup(
      <AuthPanel nextPath="/" callbackFailed />,
    );

    expect(html).toContain(
      "로그인 링크를 확인하지 못했습니다. 새 로그인 링크를 요청해 주세요.",
    );
    expect(html).toContain("로그아웃");
    expect(html).not.toContain("invalid verifier");
  });
});
