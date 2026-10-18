// The API's production build (B13a, E3): one ESM file, dist/main.mjs. `node build.mjs [outdir]`.
// esbuild resolves and bundles; @swc/core compiles each TypeScript file, because esbuild can't emit the decorator
// metadata Nest's constructor injection reads. The API's own npm dependencies stay external (the image installs them
// with `pnpm deploy --prod`); everything else is inlined: the workspace's TypeScript-source packages (@pedia/shared,
// @pedia/seed), their own npm dependencies (not installed beside the API) and the generated Prisma client.
// The bundle resolves its externals from the node_modules above it: run it from apps/api/<dir>, never a copy elsewhere.
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { isBuiltin } from "node:module";
import { transform } from "@swc/core";
import { build } from "esbuild";

const outdir = process.argv[2] ?? "dist";

const { dependencies } = JSON.parse(readFileSync(new URL("package.json", import.meta.url), "utf8"));
/** "@scope/name/sub" → "@scope/name"; "name/sub" → "name". */
const packageOf = (path) => path.split("/").slice(0, path.startsWith("@") ? 2 : 1).join("/");

/** Node's built-ins and the API's own npm dependencies stay external; @pedia/* (workspace source) never does. */
const externalNpm = {
  name: "external-npm",
  setup(b) {
    b.onResolve({ filter: /^[^./]/ }, ({ path }) => {
      const name = packageOf(path);
      return isBuiltin(path) || (!name.startsWith("@pedia/") && name in dependencies) ? { path, external: true } : undefined;
    });
  },
};

/** The same transform @swc-node/register applies in dev: legacy decorators with metadata, class names kept. */
const swcTypescript = {
  name: "swc-typescript",
  setup(b) {
    b.onLoad({ filter: /\.ts$/ }, async ({ path }) => {
      const { code } = await transform(await readFile(path, "utf8"), {
        filename: path,
        sourceMaps: "inline",
        jsc: {
          parser: { syntax: "typescript", decorators: true },
          target: "es2023",
          keepClassNames: true,
          transform: { legacyDecorator: true, decoratorMetadata: true },
        },
        module: { type: "es6" },
      });
      return { contents: code, loader: "js" };
    });
  },
};

await build({
  entryPoints: ["src/main.ts"],
  outfile: `${outdir}/main.mjs`,
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  sourcemap: true,
  // Nest names loggers and errors after classes (`new Logger(Foo.name)`); esbuild would rename clashing ones (Foo2).
  keepNames: true,
  // A CommonJS package required from the ESM bundle needs `require`.
  banner: { js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);" },
  plugins: [externalNpm, swcTypescript],
  logLevel: "warning",
});
