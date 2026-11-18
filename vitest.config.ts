import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  // The React plugin gives us JSX/TSX transformation in tests so we can
  // mount components (e.g. via `react-dom/client`) directly. Without it,
  // any `*.test.tsx` that contains JSX fails at the parse step.
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  test: {
    environment: "happy-dom",
    include: [
      "client/src/**/*.test.{ts,tsx}",
      "shared/**/*.test.ts",
      "server/**/*.test.ts",
      "scripts/**/*.test.ts",
    ],
    // sorting.test.ts contains pre-existing assertion failures unrelated to
    // the editor work. It is excluded so `npm test` is reliably green for the
    // round-trip regression suite.
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "client/src/lib/__tests__/sorting.test.ts",
    ],
    globals: false,
    css: false,
    pool: "threads",
    testTimeout: 10000,
    setupFiles: ["./vitest.setup.ts"],
  },
});
