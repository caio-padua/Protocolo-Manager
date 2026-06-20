import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..");
const packRoot = join(repoRoot, "paxter-pack");

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const targetRoot = resolve(arg("--target") ?? join(repoRoot, ".agents", "skills"));

const mjson = join(packRoot, "manifest.json");
if (!existsSync(mjson)) {
  console.error("[paxter:audit] manifest.json nao encontrado. Rode 'paxter:pack' primeiro.");
  process.exit(2);
}

type Entry = { path: string; sha256: string; lines: number };
const manifest = JSON.parse(readFileSync(mjson, "utf8")) as { version: string; files: Entry[] };

function sha256(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

function walk(dir: string): string[] {
  const out: string[] = [];
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(full));
    else if (e.isFile()) out.push(full);
  }
  return out;
}

const SKILLS = ["paxter-loop", "skill-layout-paxter"];
const manifestPaths = new Set(manifest.files.map((f) => f.path));

type Row = { path: string; status: "OK" | "MODIFICADO" | "FALTANDO" | "EXTRA" };
const rows: Row[] = [];
let drift = 0;

for (const f of manifest.files) {
  const targetFile = join(targetRoot, f.path);
  if (!existsSync(targetFile)) {
    rows.push({ path: f.path, status: "FALTANDO" });
    drift++;
    continue;
  }
  const h = sha256(readFileSync(targetFile));
  if (h === f.sha256) {
    rows.push({ path: f.path, status: "OK" });
  } else {
    rows.push({ path: f.path, status: "MODIFICADO" });
    drift++;
  }
}

for (const skill of SKILLS) {
  for (const full of walk(join(targetRoot, skill))) {
    const rel = relative(targetRoot, full).split("\\").join("/");
    if (!manifestPaths.has(rel)) {
      rows.push({ path: rel, status: "EXTRA" });
      drift++;
    }
  }
}

rows.sort((a, b) => a.path.localeCompare(b.path));

console.log(`\nAUDITORIA PAXTER PACK — selo v${manifest.version}`);
console.log(`Alvo: ${targetRoot}\n`);
console.log("| Arquivo | Estado |");
console.log("|---|---|");
for (const r of rows) console.log(`| ${r.path} | ${r.status} |`);

const okCount = rows.filter((r) => r.status === "OK").length;
console.log(`\nTotal: ${rows.length} | OK: ${okCount} | Drift: ${drift}`);

if (drift > 0) {
  console.log(
    "RESULTADO: DRIFT detectado (sistema fora do selo). Rode 'paxter:pack' ou alinhe o alvo.",
  );
  process.exit(1);
}
console.log("RESULTADO: CERTIFICADO (100% alinhado ao selo).");
