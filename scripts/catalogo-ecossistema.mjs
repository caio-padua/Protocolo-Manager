// Conferência automática do catálogo do ecossistema (docs/arquitetura/catalogo/catalogo-ecossistema.json).
// Só leitura. Aponta: referências ausentes, identificadores repetidos, datas inválidas, arquivos e rotas
// que o catálogo cita e não existem, plano apresentado como implantado, projetos falsos em espaços
// reservados e padrões óbvios de segredo ou dado pessoal.
// LIMITE: isto detecta o que está escrito no catálogo contra o que está nos arquivos. Não prova que o
// site publicado, o Railway ou o banco estejam como o catálogo diz.
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const CATALOGO = "docs/arquitetura/catalogo/catalogo-ecossistema.json";

const SITUACOES = ["observado", "pendente", "pretendido", "reservado"];
const RESULTADOS = ["verde", "vermelho", "nao-executado", "nao-verificado"];
const SECOES = ["sites", "botoes", "contratos", "testes", "integracoes", "railway"];
const dataValida = (d) => {
  if (typeof d !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const x = new Date(`${d}T00:00:00Z`);
  return !Number.isNaN(x.getTime()) && x.toISOString().slice(0, 10) === d;
};
const SEGREDOS = [
  [/[a-z]+:\/\/[^\s/:@]+:[^\s/@]+@/i, "endereço com usuário e senha"],
  [/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\./, "token JWT"],
  [/\b(sk|pk|rk)[-_](live|test|ant|proj)?[-_]?[A-Za-z0-9]{16,}/, "chave de API"],
  [/\bBearer\s+[A-Za-z0-9._-]{12,}/i, "cabeçalho Bearer"],
  [/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/, "CPF"],
  [/\b\d{11}\b/, "sequência de 11 dígitos (possível CPF)"],
  [/[\w.+-]+@[\w-]+\.[\w.-]+/, "endereço de e-mail"],
];

export function validarCatalogo(cat, { root = ROOT } = {}) {
  const erros = [];
  const add = (secao, id, mensagem) => erros.push({ secao, id: id ?? "-", mensagem });
  if (!cat || typeof cat !== "object") return [{ secao: "raiz", id: "-", mensagem: "Catálogo inválido." }];
  if (!dataValida(cat.atualizadoEm)) add("raiz", "-", "atualizadoEm ausente ou inválido (AAAA-MM-DD).");
  for (const s of SECOES) if (!Array.isArray(cat[s])) add(s, "-", "Seção ausente ou não é lista.");
  if (erros.length) return erros;

  const ids = {};
  for (const s of SECOES) {
    ids[s] = new Set();
    for (const item of cat[s]) {
      if (!item || typeof item.id !== "string" || !item.id) { add(s, "-", "Item sem id."); continue; }
      if (ids[s].has(item.id)) add(s, item.id, "Identificador repetido.");
      ids[s].add(item.id);
      if (item.situacao !== undefined && !SITUACOES.includes(item.situacao))
        add(s, item.id, `Situação inválida: ${item.situacao}.`);
      if (item.situacao === "observado" && !dataValida(item.verificadoEm))
        add(s, item.id, "Situação 'observado' exige verificadoEm válido.");
      if (item.verificadoEm != null && !dataValida(item.verificadoEm)) add(s, item.id, "verificadoEm inválido.");
      if (item.ultimaRevisao != null && !dataValida(item.ultimaRevisao)) add(s, item.id, "ultimaRevisao inválida.");
      const texto = JSON.stringify(item);
      for (const [re, nome] of SEGREDOS) if (re.test(texto)) add(s, item.id, `Possível dado sensível: ${nome}.`);
    }
  }

  for (const site of cat.sites) {
    if (site.situacao === "reservado") {
      for (const campo of ["projetoLovableUrl", "codigo", "dominio", "publicacaoLovable"])
        if (site[campo]) add("sites", site.id, `Espaço reservado não pode ter ${campo} (projeto falso).`);
    }
    if (site.situacao === "pretendido" || site.situacao === "pendente") {
      if (/implantad|concluíd|concluid|no ar/i.test(`${site.estado ?? ""}`))
        add("sites", site.id, "Plano apresentado como implantado.");
    }
    for (const campo of ["codigo", "regraDeDominio"])
      if (site[campo] && !existsSync(resolve(root, site[campo])))
        add("sites", site.id, `${campo} aponta para caminho inexistente: ${site[campo]}.`);
  }

  for (const c of cat.contratos) {
    if (!["GET", "POST", "PATCH", "PUT", "DELETE"].includes(c.metodo)) add("contratos", c.id, "Método inválido.");
    if (typeof c.caminho !== "string" || !c.caminho.startsWith("/")) add("contratos", c.id, "Caminho deve começar com /.");
    const arq = resolve(root, c.arquivo ?? "");
    if (!c.arquivo || !existsSync(arq)) { add("contratos", c.id, `Arquivo da rota inexistente: ${c.arquivo}.`); }
    else if (typeof c.caminho === "string") {
      const fonte = readFileSync(arq, "utf8");
      const procura = `.${String(c.metodo).toLowerCase()}("${c.caminho}"`;
      if (!fonte.includes(procura)) add("contratos", c.id, `Rota ${c.metodo} ${c.caminho} não encontrada no arquivo.`);
    }
    for (const t of c.testes ?? []) if (!ids.testes.has(t)) add("contratos", c.id, `Teste inexistente no catálogo: ${t}.`);
  }

  for (const t of cat.testes) {
    if (!RESULTADOS.includes(t.resultado)) add("testes", t.id, `Resultado inválido: ${t.resultado}.`);
    if (t.resultado === "verde" || t.resultado === "vermelho")
      if (!dataValida(t.verificadoEm)) add("testes", t.id, "Resultado verde/vermelho exige data da verificação.");
    if (!t.arquivo || !existsSync(resolve(root, t.arquivo))) add("testes", t.id, `Arquivo de teste inexistente: ${t.arquivo}.`);
  }

  const porId = new Map(cat.contratos.map((c) => [c.id, c]));
  for (const b of cat.botoes) {
    if (!ids.sites.has(b.siteId)) add("botoes", b.id, `Site inexistente: ${b.siteId}.`);
    if (b.contratoId != null) {
      const c = porId.get(b.contratoId);
      if (!c) add("botoes", b.id, `Contrato inexistente: ${b.contratoId}.`);
      else if (b.tipo === "formulario" && !String(b.destino ?? "").includes(c.caminho))
        add("botoes", b.id, `Destino '${b.destino}' diverge do contrato ${c.caminho}.`);
    }
  }

  for (const r of cat.railway) {
    if (!Array.isArray(r.servicos)) add("railway", r.id, "servicos deve ser lista.");
    if (r.situacao === "implantado") add("railway", r.id, "Estado 'implantado' não é aceito no catálogo; use 'observado' com data.");
  }
  return erros;
}

export function carregarCatalogo(root = ROOT) {
  return JSON.parse(readFileSync(resolve(root, CATALOGO), "utf8"));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let erros;
  try { erros = validarCatalogo(carregarCatalogo()); }
  catch (e) { erros = [{ secao: "raiz", id: "-", mensagem: `Falha ao ler o catálogo: ${e.message}` }]; }
  if (erros.length) {
    console.error(`CATÁLOGO COM ${erros.length} PROBLEMA(S):`);
    for (const e of erros) console.error(`- [${e.secao}] ${e.id}: ${e.mensagem}`);
    process.exit(1);
  }
  console.log("Catálogo conferido: nenhuma divergência detectável pelas regras atuais (isso não prova o ambiente publicado).");
}
