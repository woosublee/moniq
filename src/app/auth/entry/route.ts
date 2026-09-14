import { NextResponse } from "next/server";

export function GET(request: Request) {
  const response = NextResponse.redirect(new URL("/auth", request.url));

  response.cookies.delete("moniq_demo");
  response.headers.set("Cache-Control", "private, no-store");

  return response;
}
