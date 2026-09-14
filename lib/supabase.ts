import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Supabase is used for two things only — realtime broadcast (live board/chat
// updates) and file storage (attachments). It is NOT this app's database;
// that stays Postgres via lib/db.ts + DATABASE_URL. Nothing here reads or
// writes task/user data.
//
// Two clients, two trust levels:
//   - the "admin" client (service role key) can bypass every access rule and
//     must only ever run on the server — inside an API route or server
//     component, never sent to the browser.
//   - the "browser" client (anon key) is safe to ship to the client; it's
//     what the anon key is for.

function supabaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!url) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL is not set — add it to .env.local"
    );
  }
  return url;
}

let adminClient: SupabaseClient | null = null;

// Server-only client using the service role key. Import this from API routes
// and other server-side code — never from a "use client" component.
export function getSupabaseAdmin(): SupabaseClient {
  if (adminClient) return adminClient;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set — add it to .env.local"
    );
  }
  adminClient = createClient(supabaseUrl(), key, {
    auth: { persistSession: false },
  });
  return adminClient;
}

let browserClient: SupabaseClient | null = null;

// Client-safe client using the public anon key. Safe to call from "use
// client" components (e.g. to subscribe to a realtime channel).
export function getSupabaseBrowser(): SupabaseClient {
  if (browserClient) return browserClient;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_ANON_KEY is not set — add it to .env.local"
    );
  }
  browserClient = createClient(supabaseUrl(), key);
  return browserClient;
}
