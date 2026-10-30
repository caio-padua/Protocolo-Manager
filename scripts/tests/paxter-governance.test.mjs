import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import {
  loadDocuments, validateGovernance, syncGovernance, CODE, SKILL, CURRENT, OLD,
  PAIRS, PATHS, JSON_MANIFEST, MD_MANIFEST,
} from "../paxter-governance.mjs";

const baseline = loadDocuments();
const clone = () => ({ ...baseline });
const rejects = (docs, message) => assert.ok(validateGovernance(docs).length, message);
const rejectsAt = (docs, path, message) => assert.ok(
  validateGovernance(docs).some(issue => issue.path === path), message ?? path);

test("normas atuais, espelhos e manifestos concordam", () => {
  assert.deepEqual(validateGovernance(baseline), []);
});
test("cada documento obrigatório ausente bloqueia", () => {
  for (const path of PATHS) { const docs = clone(); delete docs[path]; rejects(docs, path); }
});
test("código ou skill divergentes no pack bloqueiam", () => {
  for (const { target } of PAIRS) { const docs = clone(); docs[target] += "alteração"; rejects(docs, target); }
});
test("cada um dos oito artigos é obrigatório", () => {
  for (let n = 75; n <= 82; n++) {
    const docs = clone(); docs[CODE] = docs[CODE].replace(`**Art. ${n}`, `**Removido ${n}`);
    rejectsAt(docs, CODE, String(n));
  }
});
test("artigo duplicado bloqueia", () => {
  const docs = clone(); docs[CODE] = "**Art. 75 — Duplicado.**\n" + docs[CODE]; rejectsAt(docs, CODE);
});
test("cada fase deve existir no ciclo de todos os documentos vigentes", () => {
  for (const path of [CODE, SKILL, CURRENT, "replit.md"]) {
    const docs = clone(); docs[path] = docs[path].replaceAll("PREVER FALHAS", "PULAR RISCOS");
    rejectsAt(docs, path);
  }
});
test("instruções incompatíveis ativas bloqueiam", () => {
  for (const rule of ["constroi EXATAMENTE a spec, nada a mais", "corrige so o apontado",
    "os 3 executam suas partes", "As tres fases:", "economia de orcamento NUNCA e motivo",
    "usar os recursos ao maximo", "nao parar enquanto houver qualquer otimizacao",
    "construir EXATAMENTE o que esta escrito"]) {
    const docs = clone(); docs[SKILL] += `\n${rule}`; rejectsAt(docs, SKILL, rule);
  }
});
test("registro histórico não autoriza paralelismo", () => {
  const docs = clone(); docs[CODE] = docs[CODE].replace("<!-- PAXTER:HISTORICO:INICIO -->", "");
  rejectsAt(docs, CODE);
});
test("história central antiga não pode ser reescrita", () => {
  const docs = clone(); docs[OLD] += "\nmodificado"; rejectsAt(docs, OLD);
});
test("linhagem deve manter referência à versão anterior", () => {
  const docs = clone(); docs[CURRENT] = docs[CURRENT].replaceAll(OLD, "outra.md"); rejectsAt(docs, CURRENT);
});
test("cada manifesto adulterado bloqueia", () => {
  for (const path of [JSON_MANIFEST, MD_MANIFEST]) {
    const docs = clone(); docs[path] = path.endsWith(".json") ? "{}" : "selo falso"; rejects(docs);
  }
});
test("selo parcial não pode alegar certificação integral", () => {
  const docs = clone(); docs[MD_MANIFEST] += "\neste selo certifica o conteudo das skills";
  rejectsAt(docs, MD_MANIFEST);
});
test("dados sintéticos e isolamento são obrigatórios", () => {
  const docs = clone(); docs[CURRENT] = docs[CURRENT].replace("dados sinteticos", "dados reais");
  rejectsAt(docs, CURRENT);
});
test("sincronização é restrita, repetível e preserva outros selos", () => {
  const root = mkdtempSync(join(tmpdir(), "paxter-governance-"));
  try {
    for (const [path, content] of Object.entries(baseline)) {
      mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), content);
    }
    const unrelated = "paxter-pack/skills/layout-preservado.txt";
    mkdirSync(dirname(join(root, unrelated)), { recursive: true });
    writeFileSync(join(root, unrelated), "NÃO ALTERAR");
    const manifestBefore = JSON.parse(baseline[JSON_MANIFEST]);
    // Simulate a stale distributed copy without touching workspace source files.
    writeFileSync(join(root, PAIRS[0].target), "cópia antiga");
    syncGovernance(root);
    assert.deepEqual(validateGovernance(loadDocuments(root)), []);
    const first = loadDocuments(root);
    syncGovernance(root);
    assert.deepEqual(loadDocuments(root), first);
    assert.equal(readFileSync(join(root, unrelated), "utf8"), "NÃO ALTERAR");
    const after = JSON.parse(first[JSON_MANIFEST]);
    const other = entries => entries.filter(f => !PAIRS.some(p => p.entry === f.path));
    assert.deepEqual(other(after.files), other(manifestBefore.files));
  } finally { rmSync(root, { recursive: true, force: true }); }
});
test("sincronização recusa manifesto incompleto antes de escrever", () => {
  const root = mkdtempSync(join(tmpdir(), "paxter-governance-invalid-"));
  try {
    for (const [path, content] of Object.entries(baseline)) {
      mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), content);
    }
    const manifest = JSON.parse(baseline[JSON_MANIFEST]);
    manifest.files = manifest.files.filter(f => f.path !== PAIRS[1].entry);
    writeFileSync(join(root, JSON_MANIFEST), JSON.stringify(manifest));
    writeFileSync(join(root, PAIRS[0].target), "preservar mesmo com falha");
    assert.throws(() => syncGovernance(root));
    assert.equal(readFileSync(join(root, PAIRS[0].target), "utf8"), "preservar mesmo com falha");
  } finally { rmSync(root, { recursive: true, force: true }); }
});
test("sincronização recusa fonte inválida sem modificar qualquer arquivo", () => {
  const root = mkdtempSync(join(tmpdir(), "paxter-governance-source-"));
  try {
    for (const [path, content] of Object.entries(baseline)) {
      mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), content);
    }
    writeFileSync(join(root, CODE), baseline[CODE] + "\nusar os recursos ao maximo");
    const before = loadDocuments(root);
    assert.throws(() => syncGovernance(root), /Fonte inválida; nada escrito/);
    assert.deepEqual(loadDocuments(root), before);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
