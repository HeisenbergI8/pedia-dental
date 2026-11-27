import { readFileSync } from "node:fs";

/** One Terraform file's text. The tests check its security settings as text (no Terraform binary in `pnpm run check`). */
export const readTf = (file: string) => readFileSync(new URL(`../../terraform/${file}`, import.meta.url), "utf8");

/** apis.tf's `local.names`: the workflow and the runbooks use these. tf-names.test.ts proves they agree. */
export const NAMES = {
  registry: "primolar",
  image: "primolar-api",
  service: "primolar-api",
  releaseJob: "primolar-release",
  deployAccount: "primolar-deploy",
  sqlInstance: "primolar-db",
  githubEnv: "production",
} as const;

export const REGION = "asia-southeast1";
