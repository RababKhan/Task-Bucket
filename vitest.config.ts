import { defineConfig } from "vitest/config";
import path from "node:path";

// Unit tests run in plain Node and import pure logic from `lib/` via the `@`
// alias (matching tsconfig paths). Tests deliberately avoid DB-touching modules
// so they need no Turso/SQLite connection.
export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname) },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
