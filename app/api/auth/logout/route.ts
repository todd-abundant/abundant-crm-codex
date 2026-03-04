import { NextResponse } from "next/server";
import { clearAuthCookie, clearGoogleApiCookie } from "@/lib/auth/server";

export async function GET(request: Request) {
  const response = NextResponse.redirect(new URL("/sign-in", request.url));
  clearAuthCookie(response);
  clearGoogleApiCookie(response);
  return response;
}
