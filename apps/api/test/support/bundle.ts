import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const API_DIR = fileURLToPath(new URL("../..", import.meta.url));

/**
 * `node build.mjs` into a fresh directory under apps/api/dist (git-ignored): the bundle resolves its external npm
 * packages from the node_modules above it, so it can't live in the system temp directory.
 */
export function buildBundle(): string {
  mkdirSync(join(API_DIR, "dist"), { recursive: true });
  const dir = mkdtempSync(join(API_DIR, "dist", "bundle-test-"));
  execFileSync(process.execPath, ["build.mjs", dir], { cwd: API_DIR, timeout: 60_000 });
  return dir;
}

export const removeBundle = (dir: string) => rmSync(dir, { recursive: true, force: true });

const freePort = () =>
  new Promise<number>((resolve, reject) => {
    const server = createServer().listen(0, () => {
      const { port } = server.address() as { port: number };
      server.close(() => resolve(port));
    });
    server.on("error", reject);
  });

/**
 * Starts the bundle as production would (`node dist/main.mjs`), from an empty working directory so apps/api/.env and its
 * demo settings are never loaded. Resolves once it prints "API listening".
 */
export async function startBundle(dir: string, env: Record<string, string>): Promise<{ url: string; stop: () => void; output: () => string }> {
  const port = await freePort();
  const cwd = mkdtempSync(join(tmpdir(), "bundle-cwd-"));
  const child: ChildProcess = spawn(process.execPath, ["--enable-source-maps", join(dir, "main.mjs")], {
    cwd,
    env: { PATH: process.env.PATH ?? "", PORT: String(port), LOG_LEVEL: "info", BACKGROUND_WORK: "false", ...env },
  });
  let output = "";
  child.stdout?.on("data", (chunk) => (output += chunk));
  child.stderr?.on("data", (chunk) => (output += chunk));
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => (child.kill(), reject(new Error(`The bundle did not start in 20 s:\n${output}`))), 20_000);
    child.stdout?.on("data", () => output.includes("API listening") && (clearTimeout(timer), resolve()));
    child.on("exit", (code) => (clearTimeout(timer), reject(new Error(`The bundle exited (${code}):\n${output}`))));
  });
  return { url: `http://127.0.0.1:${port}`, stop: () => child.kill(), output: () => output };
}
