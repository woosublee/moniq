import "server-only";

import { NextResponse } from "next/server";

import { getSafeRedirectPath } from "@/lib/auth/access";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const redirectWithPrivateCache = (url: URL) => {
  const response = NextResponse.redirect(url);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
};

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");

  if (!code) {
    return redirectWithPrivateCache(
      new URL("/auth?error=callback", requestUrl.origin),
    );
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      return redirectWithPrivateCache(
        new URL("/auth?error=callback", requestUrl.origin),
      );
    }
  } catch {
    return redirectWithPrivateCache(
      new URL("/auth?error=callback", requestUrl.origin),
    );
  }

  const nextPath = getSafeRedirectPath(requestUrl.searchParams.get("next"));
  const redirectUrl = new URL(nextPath, requestUrl.origin);
  const destination =
    redirectUrl.origin === requestUrl.origin
      ? redirectUrl
      : new URL("/", requestUrl.origin);

  return redirectWithPrivateCache(destination);
}
