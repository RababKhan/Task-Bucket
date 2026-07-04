import { dbGet } from "@/lib/db";

type Ctx = { params: Promise<{ uid: string }> };

// Serve a user's uploaded avatar. Images are stored in users.image as a
// data URL (keeps them out of the session cookie); this decodes and streams
// the bytes so <img src="/api/avatar/[uid]"> works. The session's image ref
// carries a ?v= version so a new upload busts the browser cache.
export async function GET(_request: Request, { params }: Ctx) {
  const { uid } = await params;
  const row = await dbGet<{ image: string | null }>(
    "SELECT image FROM users WHERE id = ?",
    [uid]
  );
  const img = row?.image;
  const m = img?.match(/^data:(image\/[a-z+]+);base64,(.+)$/i);
  if (!m) return new Response(null, { status: 404 });

  const buf = Buffer.from(m[2], "base64");
  return new Response(buf, {
    headers: {
      "Content-Type": m[1],
      "Cache-Control": "private, max-age=86400",
    },
  });
}
