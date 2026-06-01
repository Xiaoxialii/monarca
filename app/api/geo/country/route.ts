import { NextResponse, type NextRequest } from "next/server";

export function GET(request: NextRequest) {
  const countryCode =
    request.headers.get("x-vercel-ip-country") ||
    request.headers.get("cf-ipcountry") ||
    request.headers.get("x-openclaw-ip-country") ||
    "";

  return NextResponse.json({
    countryCode: /^[a-z]{2}$/i.test(countryCode) ? countryCode.toUpperCase() : null
  });
}
