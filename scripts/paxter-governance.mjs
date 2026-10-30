import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const CODE = ".agents/skills/paxter-loop/CODIGO-PAXTER.md";
export const SKILL = ".agents/skills/paxter-loop/SKILL.md";
export const OLD = "DIRETRIZES_CENTRAIS_E_PRE_REQUISITOS_CEO_DR_CAIO_26.06.15.md";
export const CURRENT = "DIRETRIZES_CENTRAIS_E_PRE_REQUISITOS_CEO_DR_CAIO_26.10.29.md";
export const JSON_MANIFEST = "paxter-pack/manifest.json";
export const MD_MANIFEST = "paxter-pack/MANIFEST.md";
export const PAIRS = [CODE, SKILL].map(source => ({
  source, target: source.replace(".agents/", "paxter-pack/"),
  entry: source.replace(".agents/skills/", ""),
}));
export const PATHS = [CODE, SKILL, "replit.md", OLD, CURRENT,
  ...PAIRS.map(p => p.target), JSON_MANIFEST, MD_MANIFEST];
export const CYCLE = ["DESENHAR", "ESPECIFICAR", "PREVER FALHAS", "CONSTRUIR",
  "REVISAR", "TESTAR", "HOMOLOGAR", "APRENDER"];
export const sha256 = text => createHash("sha256").update(text).digest("hex");
export const normalize = text => text.normalize("NFD").replace(/\p{M}/gu, "")
  .toLowerCase().replace(/\s+/g, " ");
const lines = text => text.length ? text.split("\n").length : 0;
export function loadDocuments(root = ROOT) {
  return Object.fromEntries(PATHS.map(path => {
    try { return [path, readFileSync(resolve(root, path), "utf8")]; }
    catch { return [path, null]; }
  }));
}
export function validateGovernance(documents) {
  const issues = [];
  const add = (path, message) => issues.push({ path, message });
  for (const path of PATHS) {
    if (typeof documents[path] !== "string") add(path, "Documento obrigatório ausente.");
  }
  if (issues.length) return issues;
  const code = documents[CODE];
  const start = "<!-- PAXTER:HISTORICO:INICIO -->";
  const end = "<!-- PAXTER:HISTORICO:FIM -->";
  if (code.split(start).length !== 2 || code.split(end).length !== 2 ||
      code.indexOf(start) >= code.indexOf(end)) {
    add(CODE, "Delimitação do histórico inválida.");
  }
  const activeCode = code.replace(
    /<!-- PAXTER:HISTORICO:INICIO -->[\s\S]*?<!-- PAXTER:HISTORICO:FIM -->/g, "")
    .replace(/^\| \d{2}\/\d{2}\/\d{4} \|[^\n]*$/gm, "");
  const active = { [CODE]: activeCode, [SKILL]: documents[SKILL],
    "replit.md": documents["replit.md"], [CURRENT]: documents[CURRENT] };
  for (const [path, text] of Object.entries(active)) {
    const norm = normalize(text);
    // The contiguous cycle must exist in the active body, not merely in frontmatter.
    const body = text.replace(/^---\n[\s\S]*?\n---\n/, "");
    const cycle = normalize(CYCLE.join(" -> "));
    if (!normalize(body.replace(/→/g, "->")).includes(cycle)) add(path, "Ciclo de oito fases ausente ou fora de ordem.");
    for (const phrase of ["uma implementacao por vez", "revisao independente sequencial",
      "dados sinteticos", "isolad", "bloquead", "evidencia"]) {
      if (!norm.includes(phrase)) add(path, `Regra obrigatória ausente: ${phrase}.`);
    }
    if (!text.includes(CODE) && path !== CODE) add(path, "Fonte canônica não referenciada.");
    for (const forbidden of [
      /constroi exatamente a spec, nada a mais/,
      /corrige (?:so|apenas) o apontado/,
      /corrigir apenas o apontado/,
      /os 3 executam suas partes/,
      /as tres fases:/,
      /antes de gerar qualquer valor de teste.*procurar o dado real/,
      /economia de orcamento nunca e motivo/,
      /usar os recursos ao maximo/,
      /nao parar enquanto houver qualquer otimizacao/,
      /construir exatamente o que esta escrito/,
    ]) {
      if (forbidden.test(norm)) add(path, `Instrução antiga ativa: ${forbidden.source}.`);
    }
  }
  const articleExpectations = {
    75: ["falhas previsiveis", "dependencias", "especificacao inicial"],
    76: ["gravidade", "causa", "impacto", "bloquear", "especificacao e testes", "acoes destrutivas"],
    77: ["planejado", "em especificacao", "em construcao", "em revisao", "em teste", "bloqueado", "homologado", "plataforma"],
    78: ["produtores", "consumidores", "contratos", "permissoes", "persistencia", "efeitos externos"],
    79: ["inventario", "geradores", "evidencia", "exclusoes", "nao analisados"],
    80: ["uma unica implementacao", "autorizacao expressa", "revisores independentes", "sequenciais", "proxima unidade"],
    81: ["revisao examinada", "inaplicabilidade", "concorrencia", "sessao expirada", "resultado persistido"],
    82: ["dados sinteticos", "ambientes isolados", "servicos externos simulados", "expressamente autorizadas"],
  };
  for (const [article, phrases] of Object.entries(articleExpectations)) {
    const matches = [...activeCode.matchAll(new RegExp(`\\*\\*Art\\. ${article}(?:\\s|\\*)`, "g"))];
    if (matches.length !== 1) { add(CODE, `Artigo ${article} ausente ou duplicado.`); continue; }
    const tail = activeCode.slice(matches[0].index);
    const next = tail.slice(2).search(/\*\*Art\. \d/);
    const section = normalize(next < 0 ? tail : tail.slice(0, next + 2));
    for (const phrase of phrases) if (!section.includes(phrase)) add(CODE, `Artigo ${article}: falta ${phrase}.`);
  }
  if (!code.includes("## HISTÓRICO DE PROMULGAÇÕES") || !code.includes("| 01/08/2026 |") ||
      !code.includes("| 29/10/2026 |")) add(CODE, "Histórico de promulgações incompleto.");
  if (sha256(documents[OLD]) !== "ba2003d0f544b98c751752472cdc6c664b0bbb13af1aa4c7628210768d149e79")
    add(OLD, "Versão histórica alterada.");
  if (!documents[CURRENT].includes(OLD)) add(CURRENT, "Linhagem histórica sem referência.");
  let manifest;
  try {
    manifest = JSON.parse(documents[JSON_MANIFEST]);
    if (!Array.isArray(manifest.files)) throw new Error("files");
  } catch { add(JSON_MANIFEST, "Manifesto inválido."); return issues; }
  if (manifest.governanceSync?.certificationScope !== "paxter-loop-only")
    add(JSON_MANIFEST, "Escopo de certificação parcial não identificado.");
  if (!documents[MD_MANIFEST].includes("NÃO constitui recertificação integral") ||
      documents[MD_MANIFEST].includes("este selo certifica o conteudo das skills"))
    add(MD_MANIFEST, "Selo parcial não pode alegar certificação integral.");
  for (const { source, target, entry } of PAIRS) {
    if (documents[source] !== documents[target]) add(target, "Espelho diverge da fonte canônica.");
    const entries = manifest.files.filter(f => f.path === entry);
    const hash = sha256(documents[target]);
    const count = lines(documents[target]);
    if (entries.length !== 1 || entries[0].sha256 !== hash || entries[0].lines !== count)
      add(JSON_MANIFEST, `Hash/linhas inválidos: ${entry}.`);
    if (!documents[MD_MANIFEST].includes(`| \`${entry}\` | ${hash.slice(0, 16)} | ${count} |`))
      add(MD_MANIFEST, `Registro humano divergente: ${entry}.`);
  }
  return issues;
}

// Deliberately scoped generator: never removes the pack or reseals other skills.
export function syncGovernance(root = ROOT) {
  const docs = loadDocuments(root);
  for (const path of PATHS) if (docs[path] === null) throw new Error(`Ausente: ${path}`);
  const manifest = JSON.parse(docs[JSON_MANIFEST]);
  let md = docs[MD_MANIFEST];
  const writes = [];
  for (const { source, target, entry } of PAIRS) {
    const entries = manifest.files.filter(f => f.path === entry);
    if (entries.length !== 1) throw new Error(`Entrada ausente/duplicada: ${entry}`);
    const hash = sha256(docs[source]), count = lines(docs[source]);
    const rows = md.split("\n").filter(row => row.startsWith(`| \`${entry}\` |`));
    if (rows.length !== 1) throw new Error(`Registro humano ausente/duplicado: ${entry}`);
    md = md.replace(rows[0], `| \`${entry}\` | ${hash.slice(0, 16)} | ${count} |`);
    Object.assign(entries[0], { sha256: hash, lines: count });
    writes.push([target, docs[source]]);
  }
  // This field describes only the new governance subset, not a full pack rebuild.
  manifest.governanceSync = { source: ".agents/skills/paxter-loop",
    certificationScope: "paxter-loop-only", scope: PAIRS.map(p => p.entry) };
  md = md.replace("# Paxter Pack — MANIFEST (selo de certificacao)",
    "# Paxter Pack — MANIFEST (registros por arquivo; atualização parcial)");
  md = md.replace("- **Versao**:", "- **Versao originaria do pack completo**:");
  md = md.replace("- **Gerado em**:", "- **Geracao originaria do pack completo**:");
  md = md.replace(/RESUMO EM 1 LINHA: este selo certifica[^\n]*/,
    "RESUMO EM 1 LINHA: atualização parcial do loop; NÃO constitui recertificação integral do pack ou das demais skills.");
  const note = "> Governança do loop: sincronização parcial por `node scripts/paxter-governance.mjs --sync`; demais skills não recertificadas.";
  if (!md.includes(note)) md += `\n${note}\n`;
  writes.push([JSON_MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`], [MD_MANIFEST, md]);
  // Validate the proposed state in memory before any filesystem write.
  const proposed = { ...docs, ...Object.fromEntries(writes) };
  const issues = validateGovernance(proposed);
  if (issues.length) throw new Error(`Fonte inválida; nada escrito: ${issues.map(i => `${i.path}: ${i.message}`).join("; ")}`);
  for (const [path, content] of writes) writeFileSync(resolve(root, path), content);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.includes("--sync")) syncGovernance();
    const documents = loadDocuments();
    const issues = validateGovernance(documents);
    const revision = execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();
    const report = { scope: "governanca-documental", revision,
      limitation: "Não certifica comportamento clínico, auditoria integral ou autorização de publicação.",
      files: PATHS.map(path => ({ path, sha256: documents[path] === null ? null : sha256(documents[path]) })),
      passed: issues.length === 0, issues };
    if (process.argv.includes("--json")) console.log(JSON.stringify(report, null, 2));
    else {
      console.log(`Governança documental: ${report.passed ? "APROVADA" : "BLOQUEADA"}`);
      console.log(`Revisão-base: ${revision}; conteúdo examinado identificado pelos hashes.`);
      console.log(report.limitation);
      for (const issue of issues) console.error(`${issue.path}: ${issue.message}`);
    }
    if (issues.length) process.exitCode = 1;
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
