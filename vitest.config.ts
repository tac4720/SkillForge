import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    include: ["tests/**/*.spec.ts", "tests/**/*.contract.ts"],
    coverage: {
      provider: "v8",
      enabled: false,
      all: true,
      include: ["src/**/*.ts"],
      exclude: [
        "src/cli/bin.ts",
        "src/drivers/**",
        "src/security/approval-gate.ts",
        "src/security/secret-store.ts",
        "src/types/**"
      ],
      reporter: ["text", "json-summary", "html"],
      reportsDirectory: "./coverage",
      thresholds: {
        lines: 85,
        branches: 80,
        functions: 85,
        statements: 85,
        "src/security/**": {
          lines: 95,
          branches: 95,
          functions: 95,
          statements: 95
        },
        "src/replay/**": {
          lines: 90,
          branches: 90,
          functions: 90,
          statements: 90
        },
        "src/exporters/openclaw/**": {
          lines: 90,
          branches: 90,
          functions: 90,
          statements: 90
        },
        "src/core/input-validator.ts": {
          lines: 95,
          branches: 95,
          functions: 95,
          statements: 95
        },
        "src/core/path-sanitizer.ts": {
          lines: 95,
          branches: 95,
          functions: 95,
          statements: 95
        }
      }
    }
  },
  esbuild: {
    target: "node22"
  }
});
