import { createHash } from "node:crypto";
import type { EventEmitter } from "node:events";

/**
 * The same kind of error gets the same 12-character id across requests, instances and deploys: the error's name plus
 * the function names of its first three frames. Never the message (it can quote patient data) or line numbers (they
 * move with every build; in the bundle every frame is dist/main.mjs).
 */
export function errorFingerprint(error: unknown): string {
  const name = error instanceof Error ? error.name : typeof error;
  const frames = (error instanceof Error ? (error.stack ?? "") : "")
    .split("\n")
    .filter((line) => line.trimStart().startsWith("at "))
    .slice(0, 3)
    .map((line) => line.trim().replace(/^at (async )?/, "").replace(/\s*\(.*\)$/, "").replace(/:\d+:\d+$/, ""));
  return createHash("sha256").update([name, ...frames].join("|")).digest("hex").slice(0, 12);
}

/**
 * Prisma errors quote the query's arguments (patient data) in their message, so only their kind, code and stack
 * frames are logged. Everything else is logged as is.
 */
export function loggable(exception: unknown): unknown {
  if (!(exception instanceof Error) || !exception.name.startsWith("PrismaClient")) return exception;
  const code = (exception as { code?: unknown }).code;
  const frames = exception.stack?.split("\n").filter((line) => line.trimStart().startsWith("at ")).join("\n");
  return `${exception.name}${typeof code === "string" ? ` ${code}` : ""} (message withheld: may hold patient data)\n${frames ?? ""}`;
}

type FatalLog = (fields: Record<string, unknown>, message: string) => void;

/**
 * Last resort: a rejection nobody awaited or an exception nobody caught. Logged once with its fingerprint, counted, then
 * the process exits 1 so ECS replaces it: its state is unknown. Installed by main.ts only.
 */
export function installProcessHandlers(fatal: FatalLog, count: () => void, target: EventEmitter = process, exit: (code: number) => void = process.exit) {
  const die = (kind: string) => (error: unknown) => {
    count();
    fatal({ fingerprint: errorFingerprint(error), err: loggable(error) }, kind);
    exit(1);
  };
  target.on("unhandledRejection", die("Unhandled promise rejection"));
  target.on("uncaughtException", die("Uncaught exception"));
}
