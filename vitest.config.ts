import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    include: ["lib/**/*.test.ts", "tests/**/*.test.ts"],
    environment: "node",
    globals: false,
    pool: "threads",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      // Stub Next.js' "server-only" import so the modules under test load
      // in node. The marker package only exists to fail builds when
      // server-only code is bundled into the client; tests are server-side
      // by definition.
      "server-only": path.resolve(__dirname, "tests/__stubs__/server-only.ts"),
    },
  },
});
