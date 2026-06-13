"use client";

import { useEffect, useState } from "react";

export type Locale = "en" | "zh";

export type CopyLocale = "en" | "zh";

export const LOCALE_OPTIONS: Array<{ value: Locale; label: string; shortLabel: string }> = [
  { value: "en", label: "English", shortLabel: "EN" },
  { value: "zh", label: "中文", shortLabel: "中文" }
];

export const LOCALE_STORAGE_KEY = "butterfly-locale";
const LOCALE_USER_STORAGE_KEY = "butterfly-locale-user-id";
const LOCALE_DIRTY_STORAGE_KEY = "butterfly-locale-dirty";

const LOCALE_CHANGE_EVENT = "butterfly-locale-change";
const localeCookieMaxAge = 60 * 60 * 24 * 365;

function isLocale(value: string | null): value is Locale {
  return value === "en" || value === "zh";
}

export function getCopyLocale(locale: Locale): CopyLocale {
  return locale === "zh" ? "zh" : "en";
}

export function getHtmlLang(locale: Locale) {
  if (locale === "zh") {
    return "zh-CN";
  }

  return locale;
}

export function getLocaleShortLabel(locale: Locale) {
  return LOCALE_OPTIONS.find((option) => option.value === locale)?.shortLabel ?? "EN";
}

function readStoredLocale(defaultLocale: Locale) {
  if (typeof window === "undefined") {
    return defaultLocale;
  }

  const savedLocale = window.localStorage.getItem(LOCALE_STORAGE_KEY);
  return isLocale(savedLocale) ? savedLocale : defaultLocale;
}

export function setStoredLocale(locale: Locale) {
  window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  document.cookie = `${LOCALE_STORAGE_KEY}=${locale}; path=/; max-age=${localeCookieMaxAge}; samesite=lax`;
  window.dispatchEvent(new CustomEvent<Locale>(LOCALE_CHANGE_EVENT, { detail: locale }));
}

async function loadUserLocalePreference() {
  const response = await fetch("/api/user/locale", { cache: "no-store" });

  if (!response.ok) return null;

  const payload = await response.json().catch(() => null);

  if (!payload?.ok || !isLocale(payload.locale)) return null;

  return {
    userId: typeof payload.userId === "string" ? payload.userId : "",
    locale: payload.locale as Locale
  };
}

async function saveUserLocalePreference(locale: Locale) {
  const response = await fetch("/api/user/locale", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ locale })
  }).catch(() => undefined);

  if (response?.ok) {
    window.localStorage.removeItem(LOCALE_DIRTY_STORAGE_KEY);
  }
}

export function useLocale(defaultLocale: Locale = "en") {
  const [locale, setLocaleState] = useState<Locale>(defaultLocale);
  const [isReady, setIsReady] = useState(false);
  const [userLocaleId, setUserLocaleId] = useState<string | null>(null);

  useEffect(() => {
    let isCancelled = false;
    const storedLocale = readStoredLocale(defaultLocale);

    document.cookie = `${LOCALE_STORAGE_KEY}=${storedLocale}; path=/; max-age=${localeCookieMaxAge}; samesite=lax`;
    setLocaleState(storedLocale);
    setIsReady(true);

    async function syncUserLocale() {
      const userLocale = await loadUserLocalePreference().catch(() => null);

      if (isCancelled || !userLocale?.userId) return;

      const savedUserId = window.localStorage.getItem(LOCALE_USER_STORAGE_KEY);
      const hasUnsavedLocalChange = window.localStorage.getItem(LOCALE_DIRTY_STORAGE_KEY) === "1";
      const latestStoredLocale = readStoredLocale(defaultLocale);
      const shouldUseLocalPreference =
        (hasUnsavedLocalChange || savedUserId === userLocale.userId) &&
        latestStoredLocale !== userLocale.locale;
      const nextLocale = shouldUseLocalPreference ? latestStoredLocale : userLocale.locale;

      window.localStorage.setItem(LOCALE_USER_STORAGE_KEY, userLocale.userId);
      window.localStorage.setItem(LOCALE_STORAGE_KEY, nextLocale);
      setUserLocaleId(userLocale.userId);
      setLocaleState(nextLocale);
      setIsReady(true);

      if (shouldUseLocalPreference) {
        await saveUserLocalePreference(nextLocale);
      }
    }

    void syncUserLocale();

    function handleStorage(event: StorageEvent) {
      if (event.key === LOCALE_STORAGE_KEY && isLocale(event.newValue)) {
        setLocaleState(event.newValue);
        setIsReady(true);
      }
    }

    function handleLocaleChange(event: Event) {
      const nextLocale = (event as CustomEvent<Locale>).detail;
      if (isLocale(nextLocale)) {
        setLocaleState(nextLocale);
        setIsReady(true);
      }
    }

    window.addEventListener("storage", handleStorage);
    window.addEventListener(LOCALE_CHANGE_EVENT, handleLocaleChange);

    return () => {
      isCancelled = true;
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(LOCALE_CHANGE_EVENT, handleLocaleChange);
    };
  }, [defaultLocale]);

  function setLocale(nextLocale: Locale) {
    setLocaleState(nextLocale);
    setIsReady(true);
    setStoredLocale(nextLocale);
    window.localStorage.setItem(LOCALE_DIRTY_STORAGE_KEY, "1");

    if (userLocaleId) {
      window.localStorage.setItem(LOCALE_USER_STORAGE_KEY, userLocaleId);
    }

    void saveUserLocalePreference(nextLocale);
  }

  return [locale, setLocale, isReady] as const;
}
