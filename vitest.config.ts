import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const rootDir = fileURLToPath(new URL(".", import.meta.url));

/** Apps and packages that can contain tests. Excludes packages/config (tooling only). */
const workspaceRoots = [
  "apps/web",
  "apps/server",
  "packages/auth",
  "packages/agents",
  "packages/databricks",
  "packages/db",
  "packages/env",
  "packages/evals",
  "packages/rag",
  "packages/ui",
] as const;

function project(name: (typeof workspaceRoots)[number], environment: "node" | "jsdom") {
  return {
    root: resolve(rootDir, name),
    test: {
      name,
      environment,
      include: ["**/*.{test,spec}.{ts,tsx}"],
      exclude: ["**/node_modules/**", "**/dist/**", "**/.git/**"],
    },
  };
}

export default defineConfig({
  test: {
    projects: [
      project("apps/web", "jsdom"),
      project("apps/server", "node"),
      project("packages/auth", "node"),
      project("packages/agents", "node"),
      project("packages/databricks", "node"),
      project("packages/db", "node"),
      project("packages/env", "node"),
      project("packages/evals", "node"),
      project("packages/rag", "node"),
      project("packages/ui", "node"),
    ],
  },
});
