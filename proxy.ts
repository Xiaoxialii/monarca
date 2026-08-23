import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

type Locale = "en" | "zh";

const localeCookieKey = "butterfly-locale";

const isProtectedRoute = createRouteMatcher([
  "/dashboard(.*)",
  "/optimization(.*)",
  "/api/me(.*)",
  "/api/dashboard(.*)",
  "/api/data-sources(.*)",
  "/api/uploads(.*)",
  "/api/user(.*)"
]);

function localeFromCountry(countryCode: string | null): Locale | null {
  const normalized = countryCode?.trim().toUpperCase();
  if (!normalized) return null;
  return ["CN", "HK", "MO", "TW"].includes(normalized) ? "zh" : "en";
}

export default clerkMiddleware(async (auth, request) => {
  const host = request.headers.get("host")?.toLowerCase();
  const normalizedPathname = request.nextUrl.pathname.replace(/\/+$/, "") || "/";
  const shouldCanonicalizeHost =
    process.env.NODE_ENV === "production" &&
    host === "monarcadata.com" &&
    !request.nextUrl.pathname.startsWith("/api/");

  if (shouldCanonicalizeHost) {
    const url = request.nextUrl.clone();
    url.hostname = "www.monarcadata.com";
    return NextResponse.redirect(url, 308);
  }

  const allowLocalDecisionReportFallback =
    process.env.ENABLE_LOCAL_ARTIFACT_STORE === "true" &&
    request.nextUrl.pathname === "/api/dashboard/ecommerce/decision-report";

  if (isProtectedRoute(request) && !allowLocalDecisionReportFallback) {
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
