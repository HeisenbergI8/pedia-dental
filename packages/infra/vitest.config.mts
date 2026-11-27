import { defineConfig } from "vitest/config";

export default defineConfig({
  // Text-level checks of the Terraform files and the workflows: fast, offline, no Terraform binary.
  test: { include: ["test/**/*.test.ts"] },
});
