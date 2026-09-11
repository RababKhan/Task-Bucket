/**
 * Turn a stored avatar into something small enough to ship in JSON.
 *
 * Uploaded avatars live in `users.image` as data URLs, which are far too large
 * to embed in a session cookie or repeat across a list of members. Reference
 * them by endpoint instead, versioned by length so a new upload busts the
 * browser cache. Remote OAuth URLs are already references, so they pass
 * through unchanged.
 */
export function avatarRef(
  uid: string,
  image: string | null | undefined
): string | null {
  if (!image) return null;
  if (image.startsWith("data:")) return `/api/avatar/${uid}?v=${image.length}`;
  return image;
}
