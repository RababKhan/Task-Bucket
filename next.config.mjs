/** @type {import('next').NextConfig} */
const nextConfig = {
  // Hide the floating Next.js dev-tools indicator (the "N" badge).
  devIndicators: false,

  // Emit a self-contained server bundle (.next/standalone) so the Docker
  // runtime image can ship without node_modules or the source tree.
  //
  // Vercel produces its own build output and does not use .next/standalone;
  // leaving it on there wastes build time and has been a source of conflicts.
  // VERCEL is set on every Vercel build, so this keeps both targets working
  // from one config.
  ...(process.env.VERCEL ? {} : { output: "standalone" }),

  experimental: {
    // The auth middleware (middleware.ts) runs on every request, including
    // task-attachment uploads, and Next buffers the body to hand it through.
    // The default cap here is 10MB — well under MAX_ATTACHMENT_BYTES
    // (lib/attachments.ts, 20MB) — so a large upload was silently truncated
    // into a broken multipart body before it ever reached the route handler,
    // which then failed with a confusing "No file provided." rather than the
    // real "Files must be 20MB or smaller." 25MB leaves headroom for
    // multipart's own framing overhead on top of a genuine 20MB file.
    middlewareClientMaxBodySize: "25mb",
  },
};

export default nextConfig;
