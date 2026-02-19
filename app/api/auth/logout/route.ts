import { NextResponse } from "next/server";
import { clearAuthCookie } from "@/lib/auth/server";

export async function GET(request: Request) {
  const response = NextResponse.redirect(new URL("/sign-in", request.url));
  clearAuthCookie(response);
  return response;
}
