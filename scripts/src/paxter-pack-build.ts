import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..");
const skillsRoot = join(repoRoot, ".agents", "skills");
const packRoot = join(repoRoot, "paxter-pack");
const packSkills = join(packRoot, "skills");

const SKILLS = ["paxter-loop", "skill-layout-paxter"];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

function sha256(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

function countLines(buf: Buffer): number {
  const s = buf.toString("utf8");
  return s.length === 0 ? 0 : s.split("\n").length;
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function resolveVersion(): string {
  const cli = arg("--version");
  if (cli) return cli;
  const mjson = join(packRoot, "manifest.json");
  if (existsSync(mjson)) {
    try {
      const prev = JSON.parse(readFileSync(mjson, "utf8")) as { version?: string };
      if (typeof prev.version === "string") return prev.version;
    } catch {
      /* manifesto invalido: cai no default */
    }
  }
  return "1.0.0";
}

function brDate(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

type Entry = { path: string; sha256: string; lines: number };

mkdirSync(packRoot, { recursive: true });
rmSync(packSkills, { recursive: true, force: true });
mkdirSync(packSkills, { recursive: true });

const files: Entry[] = [];

for (const skill of SKILLS) {
  const src = join(skillsRoot, skill);
  if (!existsSync(src)) {
    console.error(`[paxter:pack] skill nao encontrada: ${src}`);
    process.exit(1);
  }
  for (const full of walk(src)) {
    const relInSkill = relative(skillsRoot, full).split("\\").join("/");
    const dest = join(packSkills, relInSkill);
    const buf = readFileSync(full);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, buf);
    files.push({ path: relInSkill, sha256: sha256(buf), lines: countLines(buf) });
  }
}

files.sort((a, b) => a.path.localeCompare(b.path));

const version = resolveVersion();
const generatedAt = brDate();

const manifest = {
  name: "Paxter Pack",
  version,
  generatedAt,
  skillsRoot: ".agents/skills",
  files,
};

writeFileSync(join(packRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

const rows = files
  .map((f) => `| \`${f.path}\` | ${f.sha256.slice(0, 16)} | ${f.lines} |`)
  .join("\n");

const md = `# Paxter Pack — MANIFEST (selo de certificacao)

> NAO EDITAR A MAO. Gerado por \`pnpm --filter @workspace/scripts run paxter:pack\`.
> Fonte viva = \`.agents/skills/\`. Este pack e um ESPELHO gerado dela.

- **Pack**: Paxter Pack
- **Versao**: ${version}
- **Gerado em**: ${generatedAt}
- **Arquivos**: ${files.length}

| Arquivo (relativo a skills/) | SHA-256 (16) | Linhas |
|---|---|---|
${rows}

RESUMO EM 1 LINHA: este selo certifica o conteudo das skills Paxter na versao ${version}; a auditoria compara qualquer sistema contra estes hashes.
`;

writeFileSync(join(packRoot, "MANIFEST.md"), md);

console.log(
  `[paxter:pack] OK — versao ${version}, ${files.length} arquivos, gerado em ${generatedAt}.`,
);
console.log(
  "[paxter:pack] espelho em paxter-pack/skills/ ; selo em paxter-pack/MANIFEST.md + manifest.json",
);
