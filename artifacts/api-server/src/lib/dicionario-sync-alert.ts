/**
 * dicionario-sync-alert.ts
 *
 * Verifica se o GLOSSARIO em slack-glossario.ts está sincronizado com o
 * DICIONARIO.md no GitHub. Se houver divergência, posta um alerta no Slack
 * (#padaxor-projeto) com a lista de termos ausentes.
 *
 * Chamado no boot do api-server (fire-and-forget, não bloqueia o listen).
 * Falhas de rede ou da API do GitHub são absorvidas — nunca derrubam o boot.
 */

import { GLOSSARIO } from "./slack-glossario.js";
import { postSlackAlert } from "./slack-reporter.js";
import { logger } from "./logger.js";

// ─── Configuração ─────────────────────────────────────────────────────────────

const OWNER = "caio-padua";
const REPO  = "PADUA-SOFTWARE-DESIGN";
const FILE  = "DICIONARIO.md";
const SLACK_CHANNEL = process.env["PADAXOR_SLACK_CHANNEL_ID"] ?? "C0BLW5S7GQL";

// ─── Fetch do DICIONARIO.md ───────────────────────────────────────────────────

async function fetchDicionarioMd(): Promise<string> {
  const token = process.env["GITHUB_PAT"];
  const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${FILE}`;

  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "padaxor-dicionario-sync-alert",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const resp = await fetch(url, { headers });

  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error(
      `GitHub API devolveu ${resp.status} ao buscar ${FILE}: ${body}`,
    );
  }

  const json = await resp.json() as { content?: string; encoding?: string };
  if (json.encoding !== "base64" || !json.content) {
    throw new Error(
      "Resposta inesperada da GitHub API: campo 'content' ausente ou encoding != base64.",
    );
  }

  return Buffer.from(json.content, "base64").toString("utf-8");
}

// ─── Parser da tabela Markdown ────────────────────────────────────────────────
//
// Espera linhas no formato:
//   | (1) | **AI Gateway** | ... |

interface TabelaLinha {
  numero: number;
  termo:  string;
}

function parseTabelaMd(md: string): TabelaLinha[] {
  const linhas: TabelaLinha[] = [];

  for (const rawLine of md.split("\n")) {
    const line = rawLine.trim();
    if (!line.startsWith("|") || !line.endsWith("|")) continue;

    const colunas = line
      .slice(1, -1)
      .split("|")
      .map((c) => c.trim());

    if (colunas.length < 2) continue;
    if (/^[-:]+$/.test(colunas[0])) continue; // linha de separador

    const matchNumero = colunas[0].match(/^\((\d+)\)$/);
    if (!matchNumero) continue; // cabeçalho

    const numero = parseInt(matchNumero[1], 10);
    const termo  = colunas[1].replace(/^\*\*|\*\*$/g, "").trim();
    if (!termo) continue;

    linhas.push({ numero, termo });
  }

  return linhas;
}

// ─── Comparação ───────────────────────────────────────────────────────────────

interface Divergencia {
  descricao: string;
}

function comparar(
  glossario: typeof GLOSSARIO,
  tabela: TabelaLinha[],
): Divergencia[] {
  const erros: Divergencia[] = [];

  if (glossario.length !== tabela.length) {
    erros.push({
      descricao:
        `Tamanho diverge: GLOSSARIO tem *${glossario.length}* termo(s), ` +
        `DICIONARIO.md tem *${tabela.length}* linha(s).`,
    });
  }

  const limite = Math.min(glossario.length, tabela.length);

  for (let i = 0; i < limite; i++) {
    const g = glossario[i];
    const t = tabela[i];

    if (g.numero !== t.numero) {
      erros.push({
        descricao:
          `Posição ${i + 1}: número diverge — GLOSSARIO: ${g.numero}, DICIONARIO.md: ${t.numero}`,
      });
    } else if (g.termo.toLowerCase() !== t.termo.toLowerCase()) {
      erros.push({
        descricao:
          `Posição ${i + 1} (nº ${g.numero}): termo diverge — GLOSSARIO: "${g.termo}", DICIONARIO.md: "${t.termo}"`,
      });
    }
  }

  // Termos extras no GLOSSARIO mas ausentes no .md
  for (let i = limite; i < glossario.length; i++) {
    const g = glossario[i];
    erros.push({
      descricao:
        `Termo *${g.numero}. ${g.termo}* está no GLOSSARIO mas ausente no DICIONARIO.md`,
    });
  }

  // Linhas extras no .md mas ausentes no GLOSSARIO
  for (let i = limite; i < tabela.length; i++) {
    const t = tabela[i];
    erros.push({
      descricao:
        `Linha ${i + 1} do DICIONARIO.md (nº ${t.numero}, "${t.termo}") não tem entrada no GLOSSARIO`,
    });
  }

  return erros;
}

// ─── Ponto de entrada público ─────────────────────────────────────────────────

/**
 * Executa a verificação de sincronismo e posta no Slack se houver divergência.
 * Nunca lança — absorve todas as falhas de rede/parse.
 */
export async function checkDicionarioAndAlert(): Promise<void> {
  try {
    const md = await fetchDicionarioMd();
    const tabela = parseTabelaMd(md);

    if (tabela.length === 0) {
      logger.warn("[dicionario-sync] Nenhuma linha encontrada no DICIONARIO.md — verifique o formato da tabela.");
      return;
    }

    const divergencias = comparar(GLOSSARIO, tabela);

    if (divergencias.length === 0) {
      logger.info(
        { termos: GLOSSARIO.length },
        "[dicionario-sync] GLOSSARIO e DICIONARIO.md estão sincronizados.",
      );
      return;
    }

    // Monta mensagem de alerta para o Slack
    const linhas = divergencias.map((d) => `• ${d.descricao}`).join("\n");
    const mensagem =
      `:books: *DICIONARIO.md desatualizado* — ${divergencias.length} divergência(s) detectada(s) no boot:\n\n` +
      linhas +
      `\n\n_Adicione os termos faltantes ao DICIONARIO.md no repositório \`${OWNER}/${REPO}\` e atualize ambos em sincronia._`;

    logger.warn(
      { divergencias: divergencias.length },
      "[dicionario-sync] Divergências encontradas — postando alerta no Slack.",
    );

    await postSlackAlert(SLACK_CHANNEL, mensagem);
  } catch (err: unknown) {
    // Fail-open: erros de rede ou parse não devem comprometer o boot
    logger.warn(
      { err: (err as Error).message },
      "[dicionario-sync] Falha ao verificar DICIONARIO.md (ignorada no boot).",
    );
  }
}
