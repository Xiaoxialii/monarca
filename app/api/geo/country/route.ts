import { NextResponse, type NextRequest } from "next/server";

function validTimeZone(value: string) {
  if (!value) return null;

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date(0));
    return value;
  } catch {
    return null;
  }
}

export function GET(request: NextRequest) {
  const countryCode =
    request.headers.get("x-vercel-ip-country") ||
    request.headers.get("cf-ipcountry") ||
    request.headers.get("x-openclaw-ip-country") ||
    "";
  const timeZone =
    request.headers.get("x-vercel-ip-timezone") ||
    request.headers.get("cf-timezone") ||
    request.headers.get("x-openclaw-ip-timezone") ||
    request.headers.get("x-timezone") ||
    "";

  return NextResponse.json({
    countryCode: /^[a-z]{2}$/i.test(countryCode) ? countryCode.toUpperCase() : null,
    timeZone: validTimeZone(timeZone)
  });
}
