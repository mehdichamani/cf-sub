export interface GeoLocation {
  countryCode: string;
  countryName: string;
  city?: string;
  flagEmoji: string;
  ip: string;
}

// Convert 2-letter ISO country code to Emoji Flag
export function countryCodeToEmoji(countryCode: string): string {
  if (!countryCode || countryCode.length !== 2) return '🌐';
  const code = countryCode.toUpperCase();
  const offset = 127397;
  return String.fromCodePoint(...[...code].map((c) => c.charCodeAt(0) + offset));
}

// Country code to English name
export const COUNTRY_NAMES: Record<string, string> = {
  US: 'United States',
  DE: 'Germany',
  NL: 'Netherlands',
  GB: 'United Kingdom',
  UK: 'United Kingdom',
  FR: 'France',
  CA: 'Canada',
  JP: 'Japan',
  SG: 'Singapore',
  IR: 'Iran',
  TR: 'Turkey',
  FI: 'Finland',
  PL: 'Poland',
  SE: 'Sweden',
  CH: 'Switzerland',
  IN: 'India',
  RU: 'Russia',
  IT: 'Italy',
  ES: 'Spain',
  AU: 'Australia',
  HK: 'Hong Kong',
  KR: 'South Korea',
};

// Map full name or common variations to 2-letter ISO code
export const NAME_TO_COUNTRY_CODE: Record<string, string> = {
  'united kingdom': 'GB',
  'uk': 'GB',
  'great britain': 'GB',
  'the netherlands': 'NL',
  'netherlands': 'NL',
  'holland': 'NL',
  'germany': 'DE',
  'deutschland': 'DE',
  'united states': 'US',
  'usa': 'US',
  'america': 'US',
  'canada': 'CA',
  'france': 'FR',
  'japan': 'JP',
  'singapore': 'SG',
  'india': 'IN',
  'turkey': 'TR',
  'finland': 'FI',
  'poland': 'PL',
  'sweden': 'SE',
  'switzerland': 'CH',
  'russia': 'RU',
  'italy': 'IT',
  'spain': 'ES',
  'australia': 'AU',
  'hong kong': 'HK',
  'south korea': 'KR',
  'korea': 'KR',
};

export function getCountryName(countryCode: string): string {
  return COUNTRY_NAMES[countryCode.toUpperCase()] || countryCode.toUpperCase();
}

/**
 * Deduce country information from an existing remark string
 * e.g. "United%20Kingdom", "The Netherlands", "DE", "Frankfurt", "US-Server"
 */
export function extractGeoFromRemark(remark: string): GeoLocation | null {
  if (!remark) return null;
  const decoded = decodeURIComponent(remark).trim().toLowerCase();

  // 1. Direct match with full names
  for (const [name, code] of Object.entries(NAME_TO_COUNTRY_CODE)) {
    if (decoded.includes(name)) {
      return {
        countryCode: code,
        countryName: getCountryName(code),
        flagEmoji: countryCodeToEmoji(code),
        ip: '',
      };
    }
  }

  // 2. 2-letter country code match (e.g. "DE - Server" or "US_01")
  const isoMatch = decoded.match(/\b([a-z]{2})\b/);
  if (isoMatch) {
    const code = isoMatch[1].toUpperCase();
    if (COUNTRY_NAMES[code]) {
      return {
        countryCode: code,
        countryName: COUNTRY_NAMES[code],
        flagEmoji: countryCodeToEmoji(code),
        ip: '',
      };
    }
  }

  return null;
}
