/**
 * check-dicionario.ts
 *
 * Verifica que o array GLOSSARIO em slack-glossario.ts está em sincronia
 * posição por posição com a tabela do DICIONARIO.md no repo
 * caio-padua/PADUA-SOFTWARE-DESIGN.
 *
 * O que confere:
 *   1. Número de linhas bate (GLOSSARIO.length === linhas da tabela)
 *   2. Para cada posição i: linha[i].numero === GLOSSARIO[i].numero
 *   3. Para cada posição i: linha[i].termo  === GLOSSARIO[i].termo  (case-insensitive)
 *
 * Falha com código 1 e mensagem clara se qualquer divergência for encontrada.
 *
 * Uso:
 *   GITHUB_PAT=ghp_xxx npx tsx src/scripts/check-dicionario.ts
 *
 * Ou com o token já em env (Railway / Replit Secret):
 *   npx tsx src/scripts/check-dicionario.ts
 */

import { GLOSSARIO } from "../lib/slack-glossario.js";

// ─── Busca o DICIONARIO.md no GitHub ────────────────────────────────────────

const OWNER = "caio-padua";
const REPO  = "PADUA-SOFTWARE-DESIGN";
const FILE  = "DICIONARIO.md";

async function fetchDicionarioMd(): Promise<string> {
  const token = process.env.GITHUB_PAT;
  const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${FILE}`;

  const headers: Record<string, string> = {
    Accept:     "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "padaxor-check-dicionario",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const resp = await fetch(url, { headers });

  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error(
      `GitHub API devolveu ${resp.status} ao buscar ${FILE}.\n` +
      `URL: ${url}\n` +
      (resp.status === 401 || resp.status === 403
        ? "→ Verifique se GITHUB_PAT está definido e tem permissão de leitura.\n"
        : resp.status === 404
          ? "→ O arquivo não foi encontrado. Confirme o nome e o repositório.\n"
          : "") +
      body,
    );
  }

  const json = await resp.json() as { content?: string; encoding?: string };
  if (json.encoding !== "base64" || !json.content) {
    throw new Error("Resposta inesperada da GitHub API: campo 'content' ausente ou encoding != base64.");
  }

  return Buffer.from(json.content, "base64").toString("utf-8");
}

// ─── Parser da tabela Markdown ───────────────────────────────────────────────
//
// Espera linhas no formato:
//   | (1) | **AI Gateway** | ... |
//
// A primeira coluna é o Nº no formato (N) e a segunda é o Termo em **negrito**.
// Linhas de cabeçalho e separador (|---|) são ignoradas.

interface TabelaLinha {
  numero: number;
  termo:  string;
  linha:  number; // número da linha no arquivo (1-based), para mensagem de erro
}

function parseTabelaMd(md: string): TabelaLinha[] {
  const linhas: TabelaLinha[] = [];

  md.split("\n").forEach((rawLine, idx) => {
    const lineNum = idx + 1;
    const line = rawLine.trim();

    // Só processa linhas de tabela
    if (!line.startsWith("|") || !line.endsWith("|")) return;

    // Remove as barras externas e divide por |
    const colunas = line
      .slice(1, -1)
      .split("|")
      .map((c) => c.trim());

    if (colunas.length < 2) return;

    // Linha de separador (|---|---|)
    if (/^[-:]+$/.test(colunas[0])) return;

    // Número no formato "(N)" — ex: "(1)", "(42)"
    const matchNumero = colunas[0].match(/^\((\d+)\)$/);
    if (!matchNumero) return; // cabeçalho ou linha sem número

    const numero = parseInt(matchNumero[1], 10);

    // Termo pode estar em **negrito** — remover os asteriscos
    const termo = colunas[1].replace(/^\*\*|\*\*$/g, "").trim();
    if (!termo) return;

    linhas.push({ numero, termo, linha: lineNum });
  });

  return linhas;
}

// ─── Comparação posição por posição ─────────────────────────────────────────

interface Divergencia {
  posicao:     number; // índice 0-based
  descricao:   string;
}

function comparar(
  glossario: typeof GLOSSARIO,
  tabela:    TabelaLinha[],
): Divergencia[] {
  const erros: Divergencia[] = [];

  // 1. Tamanhos devem bater
  if (glossario.length !== tabela.length) {
    erros.push({
      posicao: -1,
      descricao:
        `Tamanho diverge: GLOSSARIO tem ${glossario.length} termo(s), ` +
        `DICIONARIO.md tem ${tabela.length} linha(s) de dados.\n` +
        `  → Provável causa: termo adicionado num lugar mas não no outro.`,
    });
    // Ainda compara até onde der
  }

  const limite = Math.min(glossario.length, tabela.length);

  for (let i = 0; i < limite; i++) {
    const g = glossario[i];
    const t = tabela[i];

    const detalhes: string[] = [];

    if (g.numero !== t.numero) {
      detalhes.push(
        `  Nº  → GLOSSARIO: ${g.numero}  |  DICIONARIO.md: ${t.numero} (linha ${t.linha})`,
      );
    }

    if (g.termo.toLowerCase() !== t.termo.toLowerCase()) {
      detalhes.push(
        `  Termo → GLOSSARIO: "${g.termo}"  |  DICIONARIO.md: "${t.termo}" (linha ${t.linha})`,
      );
    }

    if (detalhes.length > 0) {
      erros.push({
        posicao: i,
        descricao:
          `Posição ${i + 1} (GLOSSARIO[${i}]):\n` + detalhes.join("\n"),
      });
    }
  }

  // Termos extras em algum dos lados (quando tamanhos diferem)
  if (glossario.length > tabela.length) {
    for (let i = limite; i < glossario.length; i++) {
      erros.push({
        posicao: i,
        descricao:
          `Posição ${i + 1}: presente no GLOSSARIO (numero=${glossario[i].numero}, ` +
          `"${glossario[i].termo}") mas ausente no DICIONARIO.md.`,
      });
    }
  } else if (tabela.length > glossario.length) {
    for (let i = limite; i < tabela.length; i++) {
      erros.push({
        posicao: i,
        descricao:
          `Posição ${i + 1}: presente no DICIONARIO.md (linha ${tabela[i].linha}: ` +
          `numero=${tabela[i].numero}, "${tabela[i].termo}") mas ausente no GLOSSARIO.`,
      });
    }
  }

  return erros;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n📖 Buscando ${FILE} em ${OWNER}/${REPO}…`);

  let md: string;
  try {
    md = await fetchDicionarioMd();
  } catch (err) {
    console.error(`\n❌ ERRO ao buscar ${FILE}:\n${(err as Error).message}`);
    process.exit(1);
  }

  const tabela = parseTabelaMd(md);

  console.log(
    `✅ ${FILE} obtido. Linhas de dados: ${tabela.length}  |  GLOSSARIO: ${GLOSSARIO.length} termos.\n`,
  );

  if (tabela.length === 0) {
    console.error(
      `❌ ERRO: nenhuma linha de dados foi encontrada no ${FILE}.\n` +
      `  → Verifique se o arquivo tem uma tabela Markdown com colunas Nº e Termo.`,
    );
    process.exit(1);
  }

  const divergencias = comparar(GLOSSARIO, tabela);

  if (divergencias.length === 0) {
    console.log(
      `✅ GLOSSARIO e DICIONARIO.md estão sincronizados (${GLOSSARIO.length} termos, sem divergências).\n`,
    );
    process.exit(0);
  }

  console.error(
    `\n❌ ${divergencias.length} divergência(s) encontrada(s) entre GLOSSARIO e ${FILE}:\n`,
  );
  for (const d of divergencias) {
    console.error(`  —  ${d.descricao}\n`);
  }
  console.error(
    `Regra: o campo "numero" é PERMANENTE — nunca reordene o array GLOSSARIO;\n` +
    `novos termos entram SEMPRE no final. Atualize o ${FILE} após adicionar.\n`,
  );
  process.exit(1);
}

main().catch((err) => {
  console.error("Erro inesperado:", err);
  process.exit(1);
});
