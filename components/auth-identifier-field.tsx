"use client";

import { useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { getPhoneCountry, getRegionFromLocale, phoneCountries } from "@/lib/phone-countries";
import type { CopyLocale } from "@/lib/locale";

type AuthIdentifierFieldProps = {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  countryCode: string;
  locale: CopyLocale;
  onValueChange: (value: string) => void;
  onCountryChange: (countryCode: string) => void;
};

export function AuthIdentifierField({
  id,
  label,
  placeholder,
  value,
  countryCode,
  locale,
  onValueChange,
  onCountryChange
}: AuthIdentifierFieldProps) {
  const initialCountryCode = useRef(countryCode);

  useEffect(() => {
    let isMounted = true;

    async function detectCountry() {
      const localeRegion = getRegionFromLocale(navigator.language);
      const fallbackCountry = localeRegion && phoneCountries.some((country) => country.code === localeRegion) ? localeRegion : initialCountryCode.current;

      try {
        const response = await fetch("/api/geo/country", { cache: "no-store" });
        const result = (await response.json()) as { countryCode?: string };
        const detectedCountry = result.countryCode?.toUpperCase();

        if (detectedCountry && phoneCountries.some((country) => country.code === detectedCountry)) {
          if (isMounted) onCountryChange(detectedCountry);
          return;
        }
      } catch {
        // The API only has country data on deployed hosts that provide IP geo headers.
      }

      if (isMounted && fallbackCountry !== initialCountryCode.current) {
        onCountryChange(fallbackCountry);
      }
    }

    void detectCountry();

    return () => {
      isMounted = false;
    };
  }, [onCountryChange]);

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium" htmlFor={id}>
        {label}
      </label>
      <div className="flex min-w-0 rounded-md border border-slate-200 bg-white transition focus-within:border-slate-400 focus-within:ring-2 focus-within:ring-slate-200">
        <select
          aria-label={locale === "zh" ? "选择国家或地区区号" : "Select country calling code"}
          value={countryCode}
          onChange={(event) => onCountryChange(event.target.value)}
          className="h-12 w-[118px] shrink-0 rounded-l-md border-0 border-r border-slate-200 bg-slate-50 px-3 text-sm font-medium text-foreground outline-none"
        >
          {phoneCountries.map((country) => (
            <option key={country.code} value={country.code}>
              {locale === "zh" ? country.localName : country.code} +{country.callingCode}
            </option>
          ))}
        </select>
        <Input
          id={id}
          autoComplete="tel-national"
          inputMode="tel"
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
          placeholder={`${placeholder} +${getPhoneCountry(countryCode).callingCode}`}
          className="h-12 min-w-0 rounded-l-none rounded-r-md border-0 text-sm shadow-none focus-visible:ring-0"
        />
      </div>
    </div>
  );
}
