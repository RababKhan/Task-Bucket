// Dial codes for the phone-number country selector. Kept compact (flag + code)
// for the dropdown; extend as needed.
export type CountryCode = { flag: string; name: string; code: string };

export const DEFAULT_DIAL_CODE = "+880"; // Bangladesh

export const COUNTRY_CODES: CountryCode[] = [
  { flag: "🇧🇩", name: "Bangladesh", code: "+880" },
  { flag: "🇺🇸", name: "United States", code: "+1" },
  { flag: "🇬🇧", name: "United Kingdom", code: "+44" },
  { flag: "🇨🇦", name: "Canada", code: "+1" },
  { flag: "🇦🇺", name: "Australia", code: "+61" },
  { flag: "🇮🇳", name: "India", code: "+91" },
  { flag: "🇵🇰", name: "Pakistan", code: "+92" },
  { flag: "🇳🇵", name: "Nepal", code: "+977" },
  { flag: "🇱🇰", name: "Sri Lanka", code: "+94" },
  { flag: "🇧🇹", name: "Bhutan", code: "+975" },
  { flag: "🇲🇻", name: "Maldives", code: "+960" },
  { flag: "🇲🇾", name: "Malaysia", code: "+60" },
  { flag: "🇸🇬", name: "Singapore", code: "+65" },
  { flag: "🇮🇩", name: "Indonesia", code: "+62" },
  { flag: "🇹🇭", name: "Thailand", code: "+66" },
  { flag: "🇵🇭", name: "Philippines", code: "+63" },
  { flag: "🇻🇳", name: "Vietnam", code: "+84" },
  { flag: "🇨🇳", name: "China", code: "+86" },
  { flag: "🇯🇵", name: "Japan", code: "+81" },
  { flag: "🇰🇷", name: "South Korea", code: "+82" },
  { flag: "🇦🇪", name: "UAE", code: "+971" },
  { flag: "🇸🇦", name: "Saudi Arabia", code: "+966" },
  { flag: "🇶🇦", name: "Qatar", code: "+974" },
  { flag: "🇰🇼", name: "Kuwait", code: "+965" },
  { flag: "🇴🇲", name: "Oman", code: "+968" },
  { flag: "🇧🇭", name: "Bahrain", code: "+973" },
  { flag: "🇹🇷", name: "Turkey", code: "+90" },
  { flag: "🇩🇪", name: "Germany", code: "+49" },
  { flag: "🇫🇷", name: "France", code: "+33" },
  { flag: "🇮🇹", name: "Italy", code: "+39" },
  { flag: "🇪🇸", name: "Spain", code: "+34" },
  { flag: "🇳🇱", name: "Netherlands", code: "+31" },
  { flag: "🇸🇪", name: "Sweden", code: "+46" },
  { flag: "🇨🇭", name: "Switzerland", code: "+41" },
  { flag: "🇮🇪", name: "Ireland", code: "+353" },
  { flag: "🇷🇺", name: "Russia", code: "+7" },
  { flag: "🇧🇷", name: "Brazil", code: "+55" },
  { flag: "🇲🇽", name: "Mexico", code: "+52" },
  { flag: "🇿🇦", name: "South Africa", code: "+27" },
  { flag: "🇳🇬", name: "Nigeria", code: "+234" },
  { flag: "🇪🇬", name: "Egypt", code: "+20" },
  { flag: "🇰🇪", name: "Kenya", code: "+254" },
  { flag: "🇳🇿", name: "New Zealand", code: "+64" },
];

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
