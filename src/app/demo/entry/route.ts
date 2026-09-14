import { NextResponse } from "next/server";

export function GET(request: Request) {
  const response = NextResponse.redirect(new URL("/", request.url));

  response.cookies.set("moniq_demo", "1", {
    path: "/",
    sameSite: "lax",
    httpOnly: true,
  });
  response.headers.set("Cache-Control", "private, no-store");

  return response;
}
