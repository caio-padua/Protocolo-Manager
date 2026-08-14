/**
 * glossario-dicionario-sync.test.ts
 *
 * Confirma que o array GLOSSARIO (slack-glossario.ts) está sincronizado
 * posição por posição com a tabela no DICIONARIO.md do repositório
 * caio-padua/PADUA-SOFTWARE-DESIGN.
 *
 * O que verifica:
 *   1. Número de linhas bate (GLOSSARIO.length === linhas da tabela no MD)
 *   2. Para cada posição i: linha[i].numero === GLOSSARIO[i].numero
 *   3. Para cada posição i: linha[i].termo  === GLOSSARIO[i].termo (case-insensitive)
 *
 * O teste é pulado automaticamente quando GITHUB_PAT não está disponível —
 * isso evita falhas de CI sem credenciais configuradas, mas garante que
 * quando o PAT está presente a conferência sempre roda.
 *
 * Para rodar manualmente:
 *   GITHUB_PAT=ghp_xxx npx vitest run src/tests/glossario-dicionario-sync.test.ts
 */

import { describe, it, expect } from "vitest";
import { GLOSSARIO }            from "../lib/slack-glossario.js";

// ─── Configuração ────────────────────────────────────────────────────────────

const OWNER = "caio-padua";
const REPO  = "PADUA-SOFTWARE-DESIGN";
const FILE  = "DICIONARIO.md";

// ─── Helpers ─────────────────────────────────────────────────────────────────

interface TabelaLinha {
  numero: number;
  termo:  string;
  linha:  number;
}

function parseTabelaMd(md: string): TabelaLinha[] {
  const linhas: TabelaLinha[] = [];

  md.split("\n").forEach((rawLine, idx) => {
    const line = rawLine.trim();
    if (!line.startsWith("|") || !line.endsWith("|")) return;

    const colunas = line
      .slice(1, -1)
      .split("|")
      .map((c) => c.trim());

    if (colunas.length < 2) return;
    if (/^[-:]+$/.test(colunas[0])) return; // separador

    // Número no formato "(N)" — ex: "(1)", "(42)"
    const matchNumero = colunas[0].match(/^\((\d+)\)$/);
    if (!matchNumero) return; // cabeçalho ou linha sem número no formato esperado

    const numero = parseInt(matchNumero[1], 10);

    // Termo pode estar em **negrito** — remover os asteriscos
    const termo = colunas[1].replace(/^\*\*|\*\*$/g, "").trim();
    if (!termo) return;

    linhas.push({ numero, termo, linha: idx + 1 });
  });

  return linhas;
}

async function fetchDicionarioMd(token: string): Promise<string> {
  const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${FILE}`;
  const resp = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "padaxor-glossario-sync-test",
    },
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error(
      `GitHub API ${resp.status} ao buscar ${FILE}: ${body.slice(0, 200)}`,
    );
  }

  const json = await resp.json() as { content?: string; encoding?: string };
  if (json.encoding !== "base64" || !json.content) {
    throw new Error("Resposta inesperada da GitHub API: content ausente ou encoding != base64.");
  }

  return Buffer.from(json.content, "base64").toString("utf-8");
}

// ─── Testes ──────────────────────────────────────────────────────────────────

describe("GLOSSARIO ↔ DICIONARIO.md — sincronia posição por posição", () => {
  const token = process.env.GITHUB_PAT;

  if (!token) {
    it.skip("GITHUB_PAT não definido — conferência remota ignorada", () => {});
    return;
  }

  // Carregamos o MD uma vez para todos os testes do bloco
  let tabela: TabelaLinha[] = [];

  it("consegue buscar e parsear o DICIONARIO.md", async () => {
    const md = await fetchDicionarioMd(token);
    tabela = parseTabelaMd(md);

    expect(
      tabela.length,
      `Nenhuma linha de dados encontrada em ${FILE}. ` +
      `Verifique se o arquivo contém uma tabela Markdown com colunas Nº e Termo.`,
    ).toBeGreaterThan(0);
  }, 15_000);

  it("número de termos bate entre GLOSSARIO e DICIONARIO.md", async () => {
    // Se o fetch anterior falhou, tabela estará vazia — já coberto pelo teste acima
    if (tabela.length === 0) return;

    expect(
      tabela.length,
      `Tamanho diverge: GLOSSARIO=${GLOSSARIO.length} termos, ${FILE}=${tabela.length} linhas.\n` +
      `Dica: novos termos entram SEMPRE no final do array GLOSSARIO e no final do ${FILE}.`,
    ).toBe(GLOSSARIO.length);
  });

  it("cada posição tem numero e termo iguais nos dois lados", async () => {
    if (tabela.length === 0) return;

    const limite = Math.min(GLOSSARIO.length, tabela.length);
    const divergencias: string[] = [];

    for (let i = 0; i < limite; i++) {
      const g = GLOSSARIO[i];
      const t = tabela[i];

      if (g.numero !== t.numero) {
        divergencias.push(
          `[pos ${i + 1}] Nº: GLOSSARIO=${g.numero}  ≠  DICIONARIO.md=${t.numero} (linha ${t.linha})`,
        );
      }

      if (g.termo.toLowerCase() !== t.termo.toLowerCase()) {
        divergencias.push(
          `[pos ${i + 1}] Termo: GLOSSARIO="${g.termo}"  ≠  DICIONARIO.md="${t.termo}" (linha ${t.linha})`,
        );
      }
    }

    expect(
      divergencias,
      `${divergencias.length} divergência(s) encontrada(s):\n` +
      divergencias.map((d) => `  • ${d}`).join("\n") +
      `\n\nRegra: campo "numero" é PERMANENTE. Não reordene o array; atualize ${FILE} após adicionar termos.`,
    ).toEqual([]);
  });
});
