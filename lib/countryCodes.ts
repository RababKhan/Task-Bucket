// Dial codes + ISO alpha-2 (for flag images) for the phone-number country
// selector. Emoji flags don't render on Windows, so the UI uses flag images
// keyed by `iso`.
export type CountryCode = { iso: string; name: string; code: string };

export const DEFAULT_DIAL_CODE = "+880"; // Bangladesh

export const COUNTRY_CODES: CountryCode[] = [
  { iso: "bd", name: "Bangladesh", code: "+880" },
  { iso: "us", name: "United States", code: "+1" },
  { iso: "gb", name: "United Kingdom", code: "+44" },
  { iso: "ca", name: "Canada", code: "+1" },
  { iso: "au", name: "Australia", code: "+61" },
  { iso: "in", name: "India", code: "+91" },
  { iso: "pk", name: "Pakistan", code: "+92" },
  { iso: "np", name: "Nepal", code: "+977" },
  { iso: "lk", name: "Sri Lanka", code: "+94" },
  { iso: "bt", name: "Bhutan", code: "+975" },
  { iso: "mv", name: "Maldives", code: "+960" },
  { iso: "my", name: "Malaysia", code: "+60" },
  { iso: "sg", name: "Singapore", code: "+65" },
  { iso: "id", name: "Indonesia", code: "+62" },
  { iso: "th", name: "Thailand", code: "+66" },
  { iso: "ph", name: "Philippines", code: "+63" },
  { iso: "vn", name: "Vietnam", code: "+84" },
  { iso: "cn", name: "China", code: "+86" },
  { iso: "jp", name: "Japan", code: "+81" },
  { iso: "kr", name: "South Korea", code: "+82" },
  { iso: "ae", name: "UAE", code: "+971" },
  { iso: "sa", name: "Saudi Arabia", code: "+966" },
  { iso: "qa", name: "Qatar", code: "+974" },
  { iso: "kw", name: "Kuwait", code: "+965" },
  { iso: "om", name: "Oman", code: "+968" },
  { iso: "bh", name: "Bahrain", code: "+973" },
  { iso: "tr", name: "Turkey", code: "+90" },
  { iso: "de", name: "Germany", code: "+49" },
  { iso: "fr", name: "France", code: "+33" },
  { iso: "it", name: "Italy", code: "+39" },
  { iso: "es", name: "Spain", code: "+34" },
  { iso: "nl", name: "Netherlands", code: "+31" },
  { iso: "se", name: "Sweden", code: "+46" },
  { iso: "ch", name: "Switzerland", code: "+41" },
  { iso: "ie", name: "Ireland", code: "+353" },
  { iso: "ru", name: "Russia", code: "+7" },
  { iso: "br", name: "Brazil", code: "+55" },
  { iso: "mx", name: "Mexico", code: "+52" },
  { iso: "za", name: "South Africa", code: "+27" },
  { iso: "ng", name: "Nigeria", code: "+234" },
  { iso: "eg", name: "Egypt", code: "+20" },
  { iso: "ke", name: "Kenya", code: "+254" },
  { iso: "nz", name: "New Zealand", code: "+64" },
];

// flagcdn.com flag image (crisp, tiny; renders where emoji flags don't).
export function flagUrl(iso: string): string {
  return `https://flagcdn.com/32x24/${iso}.png`;
}

// Split a stored phone string into a dial code + local number. Falls back to the
// default dial code when no recognizable prefix is present.
export function parsePhone(phone: string): { code: string; number: string } {
  const p = (phone || "").trim();
  if (p.startsWith("+")) {
    const match = COUNTRY_CODES.filter((c) => p.startsWith(c.code)).sort(
      (a, b) => b.code.length - a.code.length
    )[0];
    if (match) {
      return { code: match.code, number: p.slice(match.code.length).trim() };
    }
  }
  return { code: DEFAULT_DIAL_CODE, number: p };
}
