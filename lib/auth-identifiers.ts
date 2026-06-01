import { getPhoneCountry, fallbackPhoneCountryCode } from "@/lib/phone-countries";

export function normalizeAuthIdentifier(value: string, countryCode = fallbackPhoneCountryCode) {
  const trimmed = value.trim();

  if (trimmed.includes("@")) {
    return trimmed;
  }

  const compactPhone = trimmed.replace(/[\s().-]/g, "");

  if (compactPhone.startsWith("+")) {
    return compactPhone;
  }

  const country = getPhoneCountry(countryCode);
  const nationalNumber = country.stripLeadingZero ? compactPhone.replace(/^0+/, "") : compactPhone;

  return nationalNumber ? `+${country.callingCode}${nationalNumber}` : "";
}

export function isEmailIdentifier(value: string) {
  return value.includes("@");
}
