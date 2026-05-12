"use client";

import { useEffect, useState } from "react";

export type Locale = "en" | "zh";

export const LOCALE_STORAGE_KEY = "butterfly-locale";

const LOCALE_CHANGE_EVENT = "butterfly-locale-change";

function isLocale(value: string | null): value is Locale {
  return value === "en" || value === "zh";
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
  window.dispatchEvent(new CustomEvent<Locale>(LOCALE_CHANGE_EVENT, { detail: locale }));
}

export function useLocale(defaultLocale: Locale = "en") {
  const [locale, setLocaleState] = useState<Locale>(defaultLocale);

  useEffect(() => {
    setLocaleState(readStoredLocale(defaultLocale));

    function handleStorage(event: StorageEvent) {
      if (event.key === LOCALE_STORAGE_KEY && isLocale(event.newValue)) {
        setLocaleState(event.newValue);
      }
    }

    function handleLocaleChange(event: Event) {
      const nextLocale = (event as CustomEvent<Locale>).detail;
      if (isLocale(nextLocale)) {
        setLocaleState(nextLocale);
      }
    }

    window.addEventListener("storage", handleStorage);
    window.addEventListener(LOCALE_CHANGE_EVENT, handleLocaleChange);

    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(LOCALE_CHANGE_EVENT, handleLocaleChange);
    };
  }, [defaultLocale]);

  function setLocale(nextLocale: Locale) {
    setLocaleState(nextLocale);
    setStoredLocale(nextLocale);
  }

  return [locale, setLocale] as const;
}
