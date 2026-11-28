import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { validarCatalogo, carregarCatalogo } from "../catalogo-ecossistema.mjs";

// Pasta temporária isolada com dados de exemplo inventados (nenhum dado real).
function montar() {
  const root = mkdtempSync(join(tmpdir(), "catalogo-"));
  const grava = (rel, txt) => { mkdirSync(dirname(join(root, rel)), { recursive: true }); writeFileSync(join(root, rel), txt); };
  grava("rotas/contato.ts", 'router.post("/exemplo-contato", async () => {});\n');
  grava("testes/contato.test.ts", "// exemplo\n");
  grava("vitrine/exemplo/main.tsx", "// exemplo\n");
  const cat = {
    versao: 1, atualizadoEm: "2026-01-02",
    sites: [
      { id: "s1", nome: "Site exemplo", situacao: "observado", verificadoEm: "2026-01-02", codigo: "vitrine/exemplo" },
      { id: "r1", nome: "Reservado", situacao: "reservado" },
    ],
    botoes: [{ id: "b1", siteId: "s1", tipo: "formulario", destino: "/exemplo-contato", contratoId: "c1" }],
    contratos: [{ id: "c1", metodo: "POST", caminho: "/exemplo-contato", arquivo: "rotas/contato.ts", testes: ["t1"] }],
    testes: [{ id: "t1", arquivo: "testes/contato.test.ts", resultado: "verde", verificadoEm: "2026-01-02" }],
    integracoes: [{ id: "i1", nome: "Exemplo", situacao: "pendente" }],
    railway: [{ id: "p1", nome: "projeto-exemplo", situacao: "observado", verificadoEm: "2026-01-02", servicos: ["a"] }],
  };
  return { root, cat, limpa: () => rmSync(root, { recursive: true, force: true }) };
}
const clone = (x) => JSON.parse(JSON.stringify(x));
const msgs = (cat, root) => validarCatalogo(cat, { root }).map((e) => `${e.secao}:${e.id}:${e.mensagem}`);
const temErro = (cat, root, trecho) => msgs(cat, root).some((m) => m.includes(trecho));

test("catálogo de exemplo consistente passa sem problemas", () => {
  const { root, cat, limpa } = montar();
  try { assert.deepEqual(msgs(cat, root), []); } finally { limpa(); }
});
test("identificador repetido é apontado", () => {
  const { root, cat, limpa } = montar();
  try { const c = clone(cat); c.sites.push({ ...c.sites[0] }); assert.ok(temErro(c, root, "Identificador repetido")); } finally { limpa(); }
});
test("botão para site ou contrato inexistente é apontado", () => {
  const { root, cat, limpa } = montar();
  try {
    const a = clone(cat); a.botoes[0].siteId = "nao-existe"; assert.ok(temErro(a, root, "Site inexistente"));
    const b = clone(cat); b.botoes[0].contratoId = "nao-existe"; assert.ok(temErro(b, root, "Contrato inexistente"));
  } finally { limpa(); }
});
test("destino do formulário divergente do contrato é apontado", () => {
  const { root, cat, limpa } = montar();
  try { const c = clone(cat); c.botoes[0].destino = "/outra-rota"; assert.ok(temErro(c, root, "diverge do contrato")); } finally { limpa(); }
});
test("rota que não existe mais no arquivo é apontada", () => {
  const { root, cat, limpa } = montar();
  try {
    const c = clone(cat); c.contratos[0].caminho = "/rota-removida"; c.botoes[0].destino = "/rota-removida";
    assert.ok(temErro(c, root, "não encontrada no arquivo"));
    const d = clone(cat); d.contratos[0].metodo = "GET"; assert.ok(temErro(d, root, "não encontrada no arquivo"));
  } finally { limpa(); }
});
test("arquivo de rota, de teste e de código ausentes são apontados", () => {
  const { root, cat, limpa } = montar();
  try {
    const a = clone(cat); a.contratos[0].arquivo = "rotas/sumiu.ts"; assert.ok(temErro(a, root, "Arquivo da rota inexistente"));
    const b = clone(cat); b.testes[0].arquivo = "testes/sumiu.ts"; assert.ok(temErro(b, root, "Arquivo de teste inexistente"));
    const c = clone(cat); c.sites[0].codigo = "vitrine/sumiu"; assert.ok(temErro(c, root, "caminho inexistente"));
    const d = clone(cat); d.contratos[0].testes = ["t-fantasma"]; assert.ok(temErro(d, root, "Teste inexistente"));
  } finally { limpa(); }
});
test("espaço reservado não pode ter projeto, código ou domínio", () => {
  const { root, cat, limpa } = montar();
  try {
    for (const campo of ["projetoLovableUrl", "codigo", "dominio"]) {
      const c = clone(cat); c.sites[1][campo] = "x"; assert.ok(temErro(c, root, "projeto falso"), campo);
    }
  } finally { limpa(); }
});
test("observado sem data, data inválida e situação inventada são apontados", () => {
  const { root, cat, limpa } = montar();
  try {
    const a = clone(cat); delete a.sites[0].verificadoEm; assert.ok(temErro(a, root, "exige verificadoEm"));
    const b = clone(cat); b.sites[0].verificadoEm = "2026-02-31"; assert.ok(temErro(b, root, "verificadoEm inválido"));
    const c = clone(cat); c.sites[0].situacao = "concluido"; assert.ok(temErro(c, root, "Situação inválida"));
    const d = clone(cat); d.testes[0].verificadoEm = null; assert.ok(temErro(d, root, "exige data"));
  } finally { limpa(); }
});
test("Railway como 'implantado' não é aceito", () => {
  const { root, cat, limpa } = montar();
  try { const c = clone(cat); c.railway[0].situacao = "implantado"; assert.ok(temErro(c, root, "Situação inválida") || temErro(c, root, "implantado")); } finally { limpa(); }
});
test("padrões óbvios de segredo ou dado pessoal são barrados", () => {
  const { root, cat, limpa } = montar();
  try {
    const amostras = ["postgres://usuario:senhaqualquer@host/banco", "123.456.789-09", "pessoa@exemplo.com", "Bearer abcdefghijklmnop1234"];
    for (const a of amostras) { const c = clone(cat); c.integracoes[0].observacao = a; assert.ok(temErro(c, root, "Possível dado sensível"), a); }
  } finally { limpa(); }
});
test("seção ausente e catálogo vazio são apontados", () => {
  const { root, cat, limpa } = montar();
  try { const c = clone(cat); delete c.botoes; assert.ok(temErro(c, root, "Seção ausente")); assert.ok(validarCatalogo(null).length); } finally { limpa(); }
});
test("catálogo real do repositório passa nas regras (com os arquivos reais)", () => {
  assert.deepEqual(validarCatalogo(carregarCatalogo()), []);
});
