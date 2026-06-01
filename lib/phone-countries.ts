export type PhoneCountry = {
  code: string;
  callingCode: string;
  name: string;
  localName: string;
  stripLeadingZero?: boolean;
};

export const phoneCountries: PhoneCountry[] = [
  { code: "US", callingCode: "1", name: "United States", localName: "美国" },
  { code: "CN", callingCode: "86", name: "China", localName: "中国大陆" },
  { code: "HK", callingCode: "852", name: "Hong Kong", localName: "中国香港" },
  { code: "TW", callingCode: "886", name: "Taiwan", localName: "中国台湾", stripLeadingZero: true },
  { code: "MO", callingCode: "853", name: "Macau", localName: "中国澳门" },
  { code: "CA", callingCode: "1", name: "Canada", localName: "加拿大" },
  { code: "GB", callingCode: "44", name: "United Kingdom", localName: "英国", stripLeadingZero: true },
  { code: "AU", callingCode: "61", name: "Australia", localName: "澳大利亚", stripLeadingZero: true },
  { code: "JP", callingCode: "81", name: "Japan", localName: "日本", stripLeadingZero: true },
  { code: "KR", callingCode: "82", name: "South Korea", localName: "韩国", stripLeadingZero: true },
  { code: "SG", callingCode: "65", name: "Singapore", localName: "新加坡" },
  { code: "MY", callingCode: "60", name: "Malaysia", localName: "马来西亚", stripLeadingZero: true },
  { code: "TH", callingCode: "66", name: "Thailand", localName: "泰国", stripLeadingZero: true },
  { code: "VN", callingCode: "84", name: "Vietnam", localName: "越南", stripLeadingZero: true },
  { code: "PH", callingCode: "63", name: "Philippines", localName: "菲律宾", stripLeadingZero: true },
  { code: "ID", callingCode: "62", name: "Indonesia", localName: "印度尼西亚", stripLeadingZero: true },
  { code: "IN", callingCode: "91", name: "India", localName: "印度", stripLeadingZero: true },
  { code: "DE", callingCode: "49", name: "Germany", localName: "德国", stripLeadingZero: true },
  { code: "FR", callingCode: "33", name: "France", localName: "法国", stripLeadingZero: true },
  { code: "IT", callingCode: "39", name: "Italy", localName: "意大利" },
  { code: "ES", callingCode: "34", name: "Spain", localName: "西班牙" },
  { code: "NL", callingCode: "31", name: "Netherlands", localName: "荷兰", stripLeadingZero: true },
  { code: "BR", callingCode: "55", name: "Brazil", localName: "巴西", stripLeadingZero: true },
  { code: "MX", callingCode: "52", name: "Mexico", localName: "墨西哥" }
];

export const fallbackPhoneCountryCode = "US";

export function getPhoneCountry(countryCode: string) {
  return phoneCountries.find((country) => country.code === countryCode) || phoneCountries[0];
}

export function getRegionFromLocale(locale: string | undefined) {
  if (!locale) return null;

  try {
    const region = new Intl.Locale(locale).region;
    return region ? region.toUpperCase() : null;
  } catch {
    const match = locale.match(/[-_]([a-z]{2})\b/i);
    return match?.[1]?.toUpperCase() || null;
  }
}
