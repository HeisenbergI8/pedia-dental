import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

/** apps/web/src. Design guards read source as text: they police the system, not behaviour. */
export const SRC = path.resolve(__dirname, "..");

export const read = (rel: string) => readFileSync(path.join(SRC, rel), "utf8");

/** Every .ts / .tsx / .css file under src except tests, as [path relative to src, text]. */
export function sourceFiles(): [string, string][] {
  const out: [string, string][] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(tsx?|css)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) out.push([path.relative(SRC, p), readFileSync(p, "utf8")]);
    }
  };
  walk(SRC);
  return out;
}

/** Files whose text matches `re`, sorted. */
export const filesMatching = (re: RegExp) =>
  sourceFiles()
    .filter(([, text]) => re.test(text))
    .map(([f]) => f)
    .sort();
