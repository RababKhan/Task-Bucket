/** @type {import('next').NextConfig} */
const nextConfig = {
  // Hide the floating Next.js dev-tools indicator (the "N" badge).
  devIndicators: false,
  // Emit a self-contained server bundle (.next/standalone) so the Docker
  // runtime image can ship without node_modules or the source tree.
  output: "standalone",
};

export default nextConfig;
