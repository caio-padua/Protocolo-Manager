import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build as esbuild } from "esbuild";
import esbuildPluginPino from "esbuild-plugin-pino";
import { rm } from "node:fs/promises";

globalThis.require = createRequire(import.meta.url);

const artifactDir = path.dirname(fileURLToPath(import.meta.url));

async function buildAll() {
  const distDir = path.resolve(artifactDir, "dist");
  await rm(distDir, { recursive: true, force: true });

  await esbuild({
    entryPoints: [path.resolve(artifactDir, "src/index.ts")],
    platform: "node",
    bundle: true,
    format: "esm",
    outdir: distDir,
    outExtension: { ".js": ".mjs" },
    logLevel: "info",
    external: [
      "*.node",
      "@replit/connectors-sdk",
      "node-cron",
      "pino",
      "sharp",
      "better-sqlite3",
      "sqlite3",
      "canvas",
    ],
    plugins: [esbuildPluginPino({ transports: [] })],
    sourcemap: true,
    minify: false,
  });
}

buildAll().catch((e) => {
  console.error(e);
  process.exit(1);
});
