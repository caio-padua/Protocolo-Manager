import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { getJsonSetting, setJsonSetting } from "./secure-settings";
import { REGRAS, conferirTextoOficial, htmlParaTexto, type ConferenciaFonte, type Modalidade, MODALIDADES } from "./meus-jogos-regras";

/**
 * Resultados oficiais (CAIXA) por modalidade. Fonte unica: API publica do Portal de Loterias.
 * Regra: so entra no banco o que passa na validacao (quantidade de dezenas sorteadas, universo, data real).
 * Falha de rede, resposta fora do formato ou indisponibilidade NUNCA geram dado: a tela mostra "indisponivel".
 */

const rows = (r: unknown): any[] => (r as { rows: any[] }).rows;
const API = "https://servicebus2.caixa.gov.br/portaldeloterias/api";

export type FetchTexto = (url: string) => Promise<{ status: number; texto: string }>;

export const fetchOficial: FetchTexto = async (url) => {
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (PaxterManager)", Accept: "application/json,text/html" }, signal: AbortSignal.timeout(8000), redirect: "error" });
  return { status: res.status, texto: await res.text() };
};

export interface ResultadoOficial { concurso: number; dataApuracao: string; dezenas: number[]; proximo: { concurso: number; data: string } | null; anteriorConcurso: number | null }

const dataBR = (s: unknown): string | null => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(s ?? ""));
  if (!m) return null;
  const iso = `${m[3]}-${m[2]}-${m[1]}`;
  const d = new Date(`${iso}T12:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso ? null : iso;
};

/** Normaliza a resposta da CAIXA. Qualquer divergencia de formato devolve null (nunca "melhor esforco"). */
export function normalizarResultado(modalidade: Modalidade, json: unknown): ResultadoOficial | null {
  const r = REGRAS[modalidade];
  const j = json as any;
  if (!j || typeof j !== "object") return null;
  const concurso = Number(j.numero);
  const data = dataBR(j.dataApuracao);
  const lista: unknown = j.listaDezenas;
  if (!Number.isSafeInteger(concurso) || concurso <= 0 || !data || !Array.isArray(lista)) return null;
  const dezenas = lista.map((d) => (typeof d === "string" && /^\d{1,2}$/.test(d) ? Number(d) : NaN));
  if (dezenas.length !== r.sorteadas) return null;
  if (!dezenas.every((n) => Number.isInteger(n) && n >= r.dezenaMin && n <= r.dezenaMax) || new Set(dezenas).size !== dezenas.length) return null;
  const proxC = Number(j.numeroConcursoProximo); const proxD = dataBR(j.dataProximoConcurso);
  const ant = Number(j.numeroConcursoAnterior);
  return {
    concurso, dataApuracao: data, dezenas: dezenas.sort((a, b) => a - b),
    proximo: Number.isSafeInteger(proxC) && proxC > concurso && proxD ? { concurso: proxC, data: proxD } : null,
    anteriorConcurso: Number.isSafeInteger(ant) && ant > 0 && ant < concurso ? ant : null,
  };
}

export async function ensureMeusJogosResultadosTables(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS meus_jogos_resultados (
      modalidade TEXT NOT NULL CHECK (modalidade IN ('megasena','lotofacil','quina','lotomania')),
      concurso INTEGER NOT NULL CHECK (concurso > 0),
      data_apuracao DATE NOT NULL,
      dezenas INTEGER[] NOT NULL,
      fonte_url TEXT NOT NULL,
      obtido_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (modalidade, concurso)
    )`);
}

interface EstadoBusca { tentativaEm: string; ok: boolean; erro: string | null; sucessoEm: string | null }
const kBusca = (m: Modalidade) => `meus_jogos.resultados.${m}`;
const kProximo = (m: Modalidade) => `meus_jogos.proximo.${m}`;

export interface ProximoConcurso { concurso: number; data: string; obtidoEm: string }
export async function proximoConcurso(m: Modalidade): Promise<ProximoConcurso | null> {
  return getJsonSetting<ProximoConcurso>(kProximo(m));
}

const emVoo = new Map<Modalidade, Promise<void>>();

/** Busca o ultimo concurso e os 4 anteriores. Falhas parciais mantem o que ja existe e registram o erro. */
export async function atualizarResultados(m: Modalidade, buscar: FetchTexto = fetchOficial, agora: Date = new Date()): Promise<void> {
  const atual = emVoo.get(m);
  if (atual) return atual;
  const p = (async () => {
    const estadoAnterior = await getJsonSetting<EstadoBusca>(kBusca(m));
    let erro: string | null = null; let obtidos = 0;
    try {
      const url0 = `${API}/${REGRAS[m].apiSlug}`;
      const r0 = await buscar(url0);
      const ultimo = r0.status === 200 ? normalizarResultado(m, safeJson(r0.texto)) : null;
      if (!ultimo) throw new Error(`resposta oficial inválida (HTTP ${r0.status})`);
      const fila: ResultadoOficial[] = [ultimo];
      let prox = ultimo;
      for (let i = 0; i < 4 && prox.anteriorConcurso; i++) {
        const url = `${API}/${REGRAS[m].apiSlug}/${prox.anteriorConcurso}`;
        const ri = await buscar(url);
        const x = ri.status === 200 ? normalizarResultado(m, safeJson(ri.texto)) : null;
        if (!x || x.concurso !== prox.anteriorConcurso) throw new Error(`resposta oficial inválida no concurso ${prox.anteriorConcurso}`);
        fila.push(x); prox = x;
      }
      for (const x of fila) {
        await db.execute(sql`
          INSERT INTO meus_jogos_resultados (modalidade, concurso, data_apuracao, dezenas, fonte_url, obtido_em)
          VALUES (${m}, ${x.concurso}, ${x.dataApuracao}, ${`{${x.dezenas.join(",")}}`}::int[], ${`${API}/${REGRAS[m].apiSlug}/${x.concurso}`}, ${agora.toISOString()})
          ON CONFLICT (modalidade, concurso) DO UPDATE SET data_apuracao = EXCLUDED.data_apuracao, dezenas = EXCLUDED.dezenas, obtido_em = EXCLUDED.obtido_em`);
        obtidos++;
      }
      if (ultimo.proximo) await setJsonSetting(kProximo(m), { concurso: ultimo.proximo.concurso, data: ultimo.proximo.data, obtidoEm: agora.toISOString() } satisfies ProximoConcurso);
    } catch (e) {
      erro = String((e as Error).message ?? e).slice(0, 200);
    }
    await setJsonSetting(kBusca(m), {
      tentativaEm: agora.toISOString(), ok: erro === null && obtidos > 0, erro,
      sucessoEm: erro === null && obtidos > 0 ? agora.toISOString() : estadoAnterior?.sucessoEm ?? null,
    } satisfies EstadoBusca);
  })().finally(() => { emVoo.delete(m); });
  emVoo.set(m, p);
  return p;
}

function safeJson(t: string): unknown { try { return JSON.parse(t); } catch { return null; } }

export interface ResultadoVisto { concurso: number; data: string; dezenas: number[] }
export interface ResultadosModalidade {
  modalidade: Modalidade; nome: string; estado: "ok" | "desatualizado" | "indisponivel";
  /** Ultima vez em que a fonte oficial respondeu com sucesso (ISO); null se nunca. */
  atualizadoEm: string | null; ultimaTentativaEm: string | null; erro: string | null;
  fonte: string; itens: ResultadoVisto[];
}

export async function lerResultados(m: Modalidade): Promise<ResultadosModalidade> {
  const r = rows(await db.execute(sql`
    SELECT concurso, to_char(data_apuracao, 'YYYY-MM-DD') AS data, dezenas FROM meus_jogos_resultados
     WHERE modalidade = ${m} ORDER BY concurso DESC LIMIT 5`));
  const est = await getJsonSetting<EstadoBusca>(kBusca(m));
  const itens = r.map((x) => ({ concurso: x.concurso as number, data: x.data as string, dezenas: x.dezenas as number[] }));
  const estado = itens.length === 0 ? "indisponivel" : est?.ok ? "ok" : "desatualizado";
  return { modalidade: m, nome: REGRAS[m].nome, estado, atualizadoEm: est?.sucessoEm ?? null, ultimaTentativaEm: est?.tentativaEm ?? null, erro: est?.ok ? null : est?.erro ?? null, fonte: REGRAS[m].fonteUrl, itens };
}

const TTL_MS = 10 * 60_000;
/** Atualiza so o que esta velho (10 min) e devolve o estado de todas as modalidades. */
export async function resultadosAtuais(buscar: FetchTexto = fetchOficial, agora: Date = new Date()): Promise<ResultadosModalidade[]> {
  await Promise.all(MODALIDADES.map(async (m) => {
    const est = await getJsonSetting<EstadoBusca>(kBusca(m));
    if (!est || agora.getTime() - new Date(est.tentativaEm).getTime() > TTL_MS) await atualizarResultados(m, buscar, agora);
  }));
  return Promise.all(MODALIDADES.map((m) => lerResultados(m)));
}

// ---------------------------------------------------------------- conferencia das regras com a pagina oficial
const kConf = (m: Modalidade) => `meus_jogos.fonte.${m}`;
export const lerConferencia = (m: Modalidade) => getJsonSetting<ConferenciaFonte>(kConf(m));

/** Compara a pagina oficial com o cadastro de regras/precos e grava o resultado (ok ou divergencias). */
export async function conferirFonte(buscar: FetchTexto = fetchOficial, agora: Date = new Date()): Promise<ConferenciaFonte[]> {
  const out: ConferenciaFonte[] = [];
  for (const m of MODALIDADES) {
    let conf: ConferenciaFonte;
    let obteve = false;
    try {
      const r = await buscar(REGRAS[m].fonteUrl);
      obteve = r.status === 200;
      conf = obteve ? conferirTextoOficial(m, htmlParaTexto(r.texto), agora)
        : { modalidade: m, ok: false, verificadoEm: agora.toISOString(), divergencias: [`página oficial respondeu HTTP ${r.status}`] };
    } catch (e) {
      conf = { modalidade: m, ok: false, verificadoEm: agora.toISOString(), divergencias: [`página oficial inacessível: ${String((e as Error).message ?? e).slice(0, 80)}`] };
    }
    // Falha de acesso nao prova que a regra mudou: so grava quando a pagina foi realmente lida.
    if (obteve) await setJsonSetting(kConf(m), conf);
    out.push(conf);
  }
  return out;
}
