import { cookies, headers } from "next/headers";

export type ServerLocale = "en" | "zh";

export const SERVER_LOCALE_COOKIE_KEY = "butterfly-locale";

const chineseCountryCodes = new Set(["CN", "HK", "MO", "TW"]);

function isLocale(value: string | undefined | null): value is ServerLocale {
  return value === "en" || value === "zh";
}

function countryLocale(countryCode: string | undefined | null): ServerLocale | null {
  const normalized = countryCode?.trim().toUpperCase();
  if (!normalized) return null;
  return chineseCountryCodes.has(normalized) ? "zh" : "en";
}

function acceptLanguageLocale(acceptLanguage: string | undefined | null): ServerLocale | null {
  const value = acceptLanguage?.toLowerCase() ?? "";
  if (!value) return null;
  if (/(^|,)\s*zh(?:-|;|,|$)/.test(value)) return "zh";
  if (/(^|,)\s*en(?:-|;|,|$)/.test(value)) return "en";
  return null;
}

export async function getRequestLocale(defaultLocale: ServerLocale = "en"): Promise<ServerLocale> {
  const cookieStore = await cookies();
  const savedLocale = cookieStore.get(SERVER_LOCALE_COOKIE_KEY)?.value;
  if (isLocale(savedLocale)) return savedLocale;

  const headerStore = await headers();
  return (
    countryLocale(
      headerStore.get("x-vercel-ip-country") ||
        headerStore.get("cf-ipcountry") ||
        headerStore.get("x-openclaw-ip-country")
    ) ||
    acceptLanguageLocale(headerStore.get("accept-language")) ||
    defaultLocale
  );
}

export async function getRequestHtmlLang(defaultLocale: ServerLocale = "en") {
  return (await getRequestLocale(defaultLocale)) === "zh" ? "zh-CN" : "en";
}
