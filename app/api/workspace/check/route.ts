import { NextResponse } from "next/server";
import { validateSubdomain, isSubdomainAvailable } from "@/lib/workspace";

// Public endpoint used during signup to validate a subdomain live.
export function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const subdomain = (searchParams.get("subdomain") ?? "").trim().toLowerCase();

  const formatError = validateSubdomain(subdomain);
  if (formatError) {
    return NextResponse.json({ available: false, error: formatError });
  }

  if (!isSubdomainAvailable(subdomain)) {
    return NextResponse.json({
      available: false,
      error: "That subdomain is already taken.",
    });
  }

  return NextResponse.json({ available: true });
}
