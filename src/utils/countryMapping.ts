// Maps full country names to ISO 3166-1 alpha-2 country codes (Exactly 10 allowed countries)
export const countryNameToCode: Record<string, string> = {
  "Australia": "AU",
  "Canada": "CA",
  "France": "FR",
  "Germany": "DE",
  "India": "IN",
  "Japan": "JP",
  "Singapore": "SG",
  "United Arab Emirates": "AE",
  "United Kingdom": "GB",
  "United States": "US",
  "UAE": "AE",
};

export const ALLOWED_COUNTRIES = [
  "Australia",
  "Canada",
  "France",
  "Germany",
  "India",
  "Japan",
  "Singapore",
  "United Arab Emirates",
  "United Kingdom",
  "United States",
];

export const ALLOWED_COUNTRY_CODES = [
  "AU", "CA", "FR", "DE", "IN", "JP", "SG", "AE", "GB", "US"
] as const;

// Helper to get country code from name, defaults to India
export function getCountryCode(countryName: string | null | undefined): string {
  if (!countryName) return "IN";
  return countryNameToCode[countryName] || "IN";
}
