import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

type Locale = "en" | "zh";

const localeCookieKey = "butterfly-locale";

const isProtectedRoute = createRouteMatcher([
  "/dashboard(.*)",
  "/api/me(.*)",
  "/api/dashboard(.*)",
  "/api/user(.*)"
]);

function localeFromCountry(countryCode: string | null): Locale | null {
  const normalized = countryCode?.trim().toUpperCase();
  if (!normalized) return null;
  return ["CN", "HK", "MO", "TW"].includes(normalized) ? "zh" : "en";
}

export default clerkMiddleware(async (auth, request) => {
  if (isProtectedRoute(request)) {
    await auth.protect({
      unauthenticatedUrl: new URL("/sign-in", request.url).toString()
    });
  }

  const response = NextResponse.next();
  const hasLocaleCookie = request.cookies.has(localeCookieKey);
  const geoLocale = localeFromCountry(
    request.headers.get("x-vercel-ip-country") ||
      request.headers.get("cf-ipcountry") ||
      request.headers.get("x-openclaw-ip-country")
  );

  if (!hasLocaleCookie && geoLocale) {
    response.cookies.set(localeCookieKey, geoLocale, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax"
    });
  }

  return response;
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)"
  ]
};
