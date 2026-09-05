import { NextResponse } from "next/server";
import { dbGet } from "@/lib/db";

// Liveness/readiness probe for load balancers and container orchestrators.
// Unauthenticated by design, and deliberately leaks nothing about the app
// beyond whether it can reach its database.
export const dynamic = "force-dynamic";

export async function GET() {
  const startedAt = Date.now();
  try {
    await dbGet("SELECT 1 AS ok");
    return NextResponse.json(
      { status: "ok", database: "up", latencyMs: Date.now() - startedAt },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    // No error detail in the body — this endpoint is public.
    return NextResponse.json(
      { status: "error", database: "down" },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
