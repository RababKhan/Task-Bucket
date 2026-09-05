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
};

export default nextConfig;
