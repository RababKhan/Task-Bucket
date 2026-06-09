import { auth } from "@/auth";

// Returns the logged-in user's internal id, or null if not authenticated.
export async function currentUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}
