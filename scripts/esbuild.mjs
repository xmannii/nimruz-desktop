import { build, context } from "esbuild";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const watch = process.argv.includes("--watch");

const alias = {
  "@": path.join(root, "src"),
};

/** Shared options for bundling the Electron processes. */
const shared = {
  bundle: true,
  platform: "node",
  target: "node24",
  sourcemap: true,
  alias,
  // Electron and Node built-ins are provided at runtime.
  external: ["electron", "node:sqlite"],
  loader: {
    ".md": "text",
    ".ttf": "file",
  },
  logLevel: "info",
};

const mainConfig = {
  ...shared,
  entryPoints: [path.join(root, "electron/main.ts")],
  outfile: path.join(root, "dist-electron/main.js"),
  format: "esm",
  // Preserve import.meta.url and avoid bundler shims fighting ESM output.
  banner: {
    js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);",
  },
};

const preloadConfig = {
  ...shared,
  entryPoints: [path.join(root, "electron/preload.ts")],
  outfile: path.join(root, "dist-electron/preload.cjs"),
  // Sandboxed preload scripts must be CommonJS.
  format: "cjs",
};

async function run() {
  if (watch) {
    const [mainCtx, preloadCtx] = await Promise.all([
      context(mainConfig),
      context(preloadConfig),
    ]);
    await Promise.all([mainCtx.watch(), preloadCtx.watch()]);
    console.log("[esbuild] watching electron main + preload...");
  } else {
    await Promise.all([build(mainConfig), build(preloadConfig)]);
    console.log("[esbuild] built electron main + preload.");
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
