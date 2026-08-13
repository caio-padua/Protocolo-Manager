// Central de Pesquisa (Apify) — Task 235.
//
// Cliente HTTP fino para a API REST do Apify (sem SDK): dispara um actor de
// forma ASSINCRONA (start-run), permite consultar o status da execucao e ler
// o dataset de resultado quando terminar. Deliberadamente NAO usa o endpoint
// sincrono "run-sync-get-dataset-items" do Apify (pode bloquear ate 300s) —
// este servidor tem teto de ~120s por request (ver memoria "exam-extraction-motor").
//
// Token e actor sao resolvidos pelo Cofre de Integracoes (cofre cifrado ->
// fallback env), igual a asaas.ts/telegram.ts: nunca hardcoded.
import { getSecret, getSetting } from "./secure-settings.js";
import type { PesquisaPrecoInsumoAmostra, PesquisaPrecoInsumoResultado } from "@workspace/db";

const APIFY_BASE_URL = "https://api.apify.com/v2";

// Actor padrao (scraper de resultados do Google, generico e publico). Fica
// editavel na tela (Cofre de Integracoes > Apify) sem precisar de deploy.
const DEFAULT_PRECO_INSUMO_ACTOR_ID = "apify/google-search-scraper";

async function resolveApiToken(): Promise<string> {
  const token = await getSecret("apify.apiToken");
  if (!token) {
    throw new Error(
      "Token do Apify nao configurado. Defina em Central de Pesquisa > Cofre de Integracoes.",
    );
  }
  return token;
}

async function resolvePrecoInsumoActorId(): Promise<string> {
  const fromDb = await getSetting("apify.precoInsumoActorId");
  return (fromDb && fromDb.trim()) || DEFAULT_PRECO_INSUMO_ACTOR_ID;
}

async function apifyFetch(path: string, init?: RequestInit): Promise<any> {
  const token = await resolveApiToken();
  const sep = path.includes("?") ? "&" : "?";
  const res = await fetch(`${APIFY_BASE_URL}${path}${sep}token=${encodeURIComponent(token)}`, {
    ...init,
    // Teto de 20s: as chamadas aqui sao so start/poll/leitura de dataset —
    // nunca a execucao do actor em si (essa roda assincrona do lado do Apify).
    signal: init?.signal ?? AbortSignal.timeout(20000),
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!res.ok) {
    const msg = json?.error?.message || `Apify erro HTTP ${res.status}`;
    throw new Error(msg);
  }
  return json;
}

export type ApifyRunStatus =
  | "READY"
  | "RUNNING"
  | "SUCCEEDED"
  | "FAILED"
  | "ABORTED"
  | "ABORTING"
  | "TIMED-OUT"
  | "TIMING-OUT";

export const APIFY_RUN_STATUS_TERMINAL_OK = new Set<ApifyRunStatus>(["SUCCEEDED"]);
export const APIFY_RUN_STATUS_TERMINAL_ERRO = new Set<ApifyRunStatus>([
  "FAILED",
  "ABORTED",
  "TIMED-OUT",
]);

// Dispara a pesquisa de preco de insumo. Assincrono: retorna assim que o
// Apify aceita a execucao (nao espera o robo terminar de rodar).
export async function apifyStartPrecoInsumoRun(
  alimentoNome: string,
  cidade: string,
): Promise<{ actorId: string; runId: string; datasetId: string }> {
  const actorId = await resolvePrecoInsumoActorId();
  const query = `preço médio de ${alimentoNome} em ${cidade}`;
  const input = {
    queries: query,
    maxPagesPerQuery: 1,
    resultsPerPage: 10,
    countryCode: "br",
    languageCode: "pt",
  };
  const data = await apifyFetch(`/acts/${encodeURIComponent(actorId)}/runs`, {
    method: "POST",
    body: JSON.stringify(input),
  });
  const run = data?.data;
  if (!run?.id || !run?.defaultDatasetId) {
    throw new Error("Resposta inesperada do Apify ao iniciar a pesquisa (sem id/defaultDatasetId).");
  }
  return { actorId, runId: run.id as string, datasetId: run.defaultDatasetId as string };
}

export async function apifyGetRunStatus(runId: string): Promise<ApifyRunStatus> {
  const data = await apifyFetch(`/actor-runs/${encodeURIComponent(runId)}`);
  const status = data?.data?.status;
  if (!status) throw new Error("Resposta inesperada do Apify ao consultar status da execucao.");
  return status as ApifyRunStatus;
}

export async function apifyGetDatasetItems(datasetId: string): Promise<unknown[]> {
  const data = await apifyFetch(`/datasets/${encodeURIComponent(datasetId)}/items`);
  return Array.isArray(data) ? data : [];
}

// ---------------------------------------------------------------------------
// Extracao GENERICA de preco a partir do dataset bruto.
//
// Decisao de design: em vez de depender dos nomes exatos de campo que o actor
// devolve (schema pode variar entre actors/versoes do Apify), varremos TODO o
// JSON retornado procurando padroes de moeda brasileira ("R$ 12,34"). Isso
// deixa o extrator resiliente a troca de actor ou a mudanca de schema do
// output, ao custo de precisar de limites de sanidade para nao confundir
// numero de telefone/CEP com preco.
// ---------------------------------------------------------------------------

const PRECO_REGEX = /R\$\s*([\d.,]+)/g;
const PRECO_MIN = 0.01;
const PRECO_MAX = 100000; // acima disso, quase certamente nao e preco de 1 unidade de insumo alimentar

function parseBRLNumber(raw: string): number | null {
  const cleaned = raw.trim().replace(/[.,]+$/, ""); // remove pontuacao de fim de frase colada no numero
  if (cleaned.length === 0) return null;

  if (cleaned.includes(",")) {
    // Padrao BR: "." = milhar, "," = decimal (ex.: "1.234,56" ou "12,34")
    const n = Number(cleaned.replace(/\./g, "").replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  // Sem virgula: numero simples (com ou sem ponto decimal residual)
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

interface RawSample {
  preco: number;
  contexto: string;
  fonte?: string;
}

function extractPriceSamplesFromNode(node: unknown, out: RawSample[]): void {
  if (node == null) return;
  if (Array.isArray(node)) {
    for (const item of node) extractPriceSamplesFromNode(item, out);
    return;
  }
  if (typeof node !== "object") return;

  const obj = node as Record<string, unknown>;

  // Fonte candidata: primeiro campo deste MESMO objeto que pareca uma URL
  // (ex.: "url"/"link" ao lado de "title"/"description" no item do Apify).
  let fonte: string | undefined;
  for (const v of Object.values(obj)) {
    if (typeof v === "string" && /^https?:\/\//i.test(v)) {
      fonte = v;
      break;
    }
  }

  for (const v of Object.values(obj)) {
    if (typeof v === "string") {
      for (const m of v.matchAll(PRECO_REGEX)) {
        const preco = parseBRLNumber(m[1] ?? "");
        if (preco === null || preco < PRECO_MIN || preco > PRECO_MAX) continue;
        const idx = m.index ?? 0;
        const contexto = v.slice(Math.max(0, idx - 40), idx + m[0].length + 40).trim();
        out.push({ preco, contexto, fonte });
      }
    } else if (typeof v === "object" && v !== null) {
      extractPriceSamplesFromNode(v, out);
    }
  }
}

// Retorna null quando nenhum preco valido foi encontrado — o chamador deve
// marcar a pesquisa como erro em vez de fabricar um resultado (falha explicita).
export function extractPrecoInsumoResultado(
  datasetItems: unknown[],
): PesquisaPrecoInsumoResultado | null {
  const raw: RawSample[] = [];
  extractPriceSamplesFromNode(datasetItems, raw);
  if (raw.length === 0) return null;

  // Deduplica ocorrencias identicas (mesmo preco extraido do mesmo trecho de
  // texto, ex.: titulo e descricao repetindo a mesma frase) para nao inflar a
  // media com a mesma mencao contada 2x. Trechos DIFERENTES concordando no
  // mesmo preco continuam contando (reforca a media, nao e duplicata).
  const seen = new Set<string>();
  const dedup: RawSample[] = [];
  for (const s of raw) {
    const k = `${s.preco}|${s.contexto}`;
    if (seen.has(k)) continue;
    seen.add(k);
    dedup.push(s);
  }

  const precoMedio = dedup.reduce((sum, s) => sum + s.preco, 0) / dedup.length;
  const amostras: PesquisaPrecoInsumoAmostra[] = dedup.slice(0, 20).map((s) => ({
    preco: s.preco,
    contexto: s.contexto,
    ...(s.fonte ? { fonte: s.fonte } : {}),
  }));

  return {
    precoMedio: Math.round(precoMedio * 100) / 100,
    amostras,
  };
}
