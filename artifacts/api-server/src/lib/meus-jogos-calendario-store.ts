import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { getJsonSetting, setJsonSetting } from "./secure-settings";
import {
  calendarioValido, conferirProximoComCalendario, opcoesDeConcurso,
  type CalendarioOficial, type OpcaoConcurso,
} from "./meus-jogos-calendario";
import { atualizarCalendarioOficial, buscarFonteCaixa, htmTexto, type ResultadoAtualizacaoCalendario, type BuscarFonte } from "./meus-jogos-calendario-oficial";
import { atualizarResultados, proximoConcurso } from "./meus-jogos-resultados";
import { conferirTextoOficial, MODALIDADES, REGRAS, type ConferenciaFonte, type Modalidade } from "./meus-jogos-regras";
import { brtISODate, parseBrtParts } from "./brt";

const rows = (r: unknown): any[] => (r as { rows: any[] }).rows;
const SETTING = "meus_jogos.calendario.oficial";
const TENTATIVA = "meus_jogos.calendario.tentativa";
const AGENDAMENTO = "meus_jogos.calendario.agendamento";
const SUCESSO = "meus_jogos.calendario.sucesso";
const MAX_HISTORICO = 100;
const MAX_IDADE_API_MS = 10 * 60_000;

export async function ensureMeusJogosCalendarioTables(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS meus_jogos_extracoes (
      id BIGSERIAL PRIMARY KEY,
      tipo TEXT NOT NULL,
      origem TEXT NOT NULL,
      ok BOOLEAN NOT NULL,
      impresso_digital TEXT,
      extraido_em TIMESTAMPTZ NOT NULL,
      valido_ate TIMESTAMPTZ,
      detalhe JSONB NOT NULL DEFAULT '{}'::jsonb
    )`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_meus_jogos_extracoes_tipo_data ON meus_jogos_extracoes (tipo, extraido_em DESC)`);
}

export interface EstadoCalendario {
  estado: "verificado" | "desatualizado" | "indisponivel";
  extraidoEm: string | null;
  validoAte: string | null;
  impressoDigital: string | null;
  agendamento: AgendamentoCalendario;
  meses: string[];
  fontes: ResultadoAtualizacaoCalendario["fontes"];
  erros: string[];
  modalidades: Array<{ modalidade: Modalidade; ok: boolean; divergencias: string[]; fonteUrl: string }>;
  ultimasExtracoes: Array<{ id: number; tipo: string; origem: string; ok: boolean; extraidoEm: string; validoAte: string | null; detalhe: unknown }>;
}

function isCalendario(value: unknown): value is CalendarioOficial {
  if (!value || typeof value !== "object") return false;
  const x = value as Partial<CalendarioOficial>;
  return typeof x.geradoEm === "string" && typeof x.validoAte === "string" &&
    Array.isArray(x.meses) && Array.isArray(x.sorteios) && Array.isArray(x.feriados) &&
    Boolean(x.regras && typeof x.regras === "object");
}

export async function lerCalendarioOficial(): Promise<CalendarioOficial | null> {
  const saved = await getJsonSetting<unknown>(SETTING);
  return isCalendario(saved) ? saved : null;
}

export async function conferirPrecoModalidade(
  modalidade: Modalidade,
  agora: Date = new Date(),
  buscar: BuscarFonte = buscarFonteCaixa,
): Promise<ConferenciaFonte> {
  const url = REGRAS[modalidade].fonteUrl;
  let conferencia: ConferenciaFonte;
  try {
    const resposta = await buscar(url, "texto");
    if (resposta.status !== 200 || !resposta.texto) throw new Error(`HTTP ${resposta.status}`);
    conferencia = conferirTextoOficial(modalidade, htmTexto(resposta.texto), agora);
  } catch (e) {
    conferencia = {
      modalidade, ok: false, verificadoEm: agora.toISOString(),
      divergencias: [`página oficial indisponível: ${String((e as Error).message ?? e).slice(0, 100)}`],
    };
  }
  await setJsonSetting(`meus_jogos.fonte.${modalidade}`, conferencia);
  await gravarExtracao({
    tipo: `preco_regras_${modalidade}`, origem: url, ok: conferencia.ok, hash: null,
    extraidoEm: conferencia.verificadoEm, validoAte: null, detalhe: { divergencias: conferencia.divergencias },
  });
  return conferencia;
}

async function gravarExtracao(input: {
  tipo: string; origem: string; ok: boolean; hash: string | null; extraidoEm: string;
  validoAte: string | null; detalhe: unknown;
}): Promise<void> {
  await db.execute(sql`
    INSERT INTO meus_jogos_extracoes (tipo, origem, ok, impresso_digital, extraido_em, valido_ate, detalhe)
    VALUES (${input.tipo}, ${input.origem}, ${input.ok}, ${input.hash}, ${input.extraidoEm}, ${input.validoAte}, ${JSON.stringify(input.detalhe)}::jsonb)`);
  await db.execute(sql`
    DELETE FROM meus_jogos_extracoes
     WHERE id IN (
       SELECT id FROM meus_jogos_extracoes
        WHERE tipo = ${input.tipo} ORDER BY extraido_em DESC, id DESC OFFSET ${MAX_HISTORICO}
     )`);
}

/** Le fontes oficiais, conserva o último calendário bom e sempre audita cada fonte consultada. */
export async function atualizarCalendarioPersistido(agora: Date = new Date()): Promise<ResultadoAtualizacaoCalendario> {
  const resultado = await atualizarCalendarioOficial({ agora });
  await setJsonSetting(TENTATIVA, {
    tentadoEm: resultado.extraidoEm, ok: resultado.ok, erros: resultado.erros,
    fontes: resultado.fontes, impressoDigital: resultado.impressaoDigital,
  });
  for (const fonte of resultado.fontes) {
    await gravarExtracao({
      tipo: fonte.tipo, origem: fonte.url, ok: fonte.ok, hash: resultado.impressaoDigital,
      extraidoEm: resultado.extraidoEm, validoAte: resultado.calendario?.validoAte ?? null,
      detalhe: { resumo: fonte.detalhe, erros: resultado.erros },
    });
  }
  // Preço e regras permanecem bloqueados quando a leitura oficial falha ou diverge.
  for (const conf of resultado.regrasPreco) {
    if (conf.ok || conf.divergencias.length > 0) {
      await setJsonSetting(`meus_jogos.fonte.${conf.modalidade}`, {
        modalidade: conf.modalidade, ok: conf.ok, verificadoEm: resultado.extraidoEm, divergencias: conf.divergencias,
      });
    }
  }
  if (resultado.calendario) {
    await setJsonSetting(SETTING, resultado.calendario);
    await setJsonSetting(SUCESSO, { concluidoEm: resultado.extraidoEm, ok: true });
  }
  return resultado;
}

export interface AgendamentoCalendario {
  habilitado: boolean; diaSemana: number; hora: string; fuso: "America/Sao_Paulo";
}
export const AGENDAMENTO_PADRAO: AgendamentoCalendario = {
  habilitado: true, diaSemana: 1, hora: "06:00", fuso: "America/Sao_Paulo",
};
export async function lerAgendamentoCalendario(): Promise<AgendamentoCalendario> {
  const value = await getJsonSetting<Partial<AgendamentoCalendario>>(AGENDAMENTO);
  const dia = Number(value?.diaSemana);
  const hora = typeof value?.hora === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value.hora) ? value.hora : AGENDAMENTO_PADRAO.hora;
  return {
    habilitado: value?.habilitado !== false,
    diaSemana: Number.isInteger(dia) && dia >= 0 && dia <= 6 ? dia : AGENDAMENTO_PADRAO.diaSemana,
    hora, fuso: "America/Sao_Paulo",
  };
}
export async function gravarAgendamentoCalendario(input: unknown): Promise<{ ok: true; agendamento: AgendamentoCalendario } | { ok: false }> {
  if (!input || typeof input !== "object") return { ok: false };
  const v = input as Partial<AgendamentoCalendario>;
  if (typeof v.habilitado !== "boolean" || !Number.isInteger(v.diaSemana) || v.diaSemana! < 0 || v.diaSemana! > 6 || typeof v.hora !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(v.hora)) return { ok: false };
  const agendamento: AgendamentoCalendario = { habilitado: v.habilitado, diaSemana: v.diaSemana!, hora: v.hora, fuso: "America/Sao_Paulo" };
  await setJsonSetting(AGENDAMENTO, agendamento);
  await gravarExtracao({
    tipo: "agendamento_semanal", origem: "configuração do gestor da plataforma", ok: true,
    hash: null, extraidoEm: new Date().toISOString(), validoAte: null,
    detalhe: { agendamento },
  });
  return { ok: true, agendamento };
}

const diaSemanaIsoBrt = (date: string) => new Date(`${date}T12:00:00-03:00`).getUTCDay();
const dataInicioSemana = (date: string) => {
  const dia = diaSemanaIsoBrt(date);
  const deslocamento = dia === 0 ? -6 : 1 - dia;
  const d = new Date(`${date}T12:00:00-03:00`);
  d.setUTCDate(d.getUTCDate() + deslocamento);
  return new Date(d.getTime() - 3 * 3_600_000).toISOString().slice(0, 10);
};
export function ehAtualizacaoSemanalDevida(
  agora: Date, agendamento: AgendamentoCalendario, ultimoSucesso: string | null,
): boolean {
  if (!agendamento.habilitado) return false;
  const partes = parseBrtParts(agora);
  const dataAtual = brtISODate(agora);
  const semanaAtual = dataInicioSemana(dataAtual);
  const diaAgendadoOffset = agendamento.diaSemana === 0 ? 6 : agendamento.diaSemana - 1;
  const dataAgendadaDate = new Date(`${semanaAtual}T12:00:00-03:00`);
  dataAgendadaDate.setUTCDate(dataAgendadaDate.getUTCDate() + diaAgendadoOffset);
  const dataAgendada = new Date(dataAgendadaDate.getTime() - 3 * 3_600_000).toISOString().slice(0, 10);
  if (dataAtual < dataAgendada || (dataAtual === dataAgendada && `${partes.hour}:${partes.minute}` < agendamento.hora)) return false;
  return !ultimoSucesso || dataInicioSemana(brtISODate(new Date(ultimoSucesso))) !== semanaAtual;
}
/** Executa a atualização devida uma vez por semana; falha continua elegível para nova tentativa. */
export async function executarAtualizacaoSemanalSeDevida(agora: Date = new Date()): Promise<{ devida: boolean; resultado?: ResultadoAtualizacaoCalendario }> {
  const agendamento = await lerAgendamentoCalendario();
  const sucesso = await getJsonSetting<{ concluidoEm?: string; ok?: boolean }>(SUCESSO);
  const sucessoEm = sucesso?.ok ? sucesso.concluidoEm ?? null : null;
  if (!ehAtualizacaoSemanalDevida(agora, agendamento, sucessoEm)) return { devida: false };
  return { devida: true, resultado: await atualizarCalendarioPersistido(agora) };
}

export async function lerEstadoCalendario(agora: Date = new Date()): Promise<EstadoCalendario> {
  const calendario = await lerCalendarioOficial();
  const tentativa = await getJsonSetting<{
    tentadoEm?: string; ok?: boolean; erros?: string[];
    fontes?: ResultadoAtualizacaoCalendario["fontes"]; impressoDigital?: string | null;
  }>(TENTATIVA);
  const hist = rows(await db.execute(sql`
    SELECT id, tipo, origem, ok, extraido_em, valido_ate, detalhe
      FROM meus_jogos_extracoes ORDER BY extraido_em DESC, id DESC LIMIT 5`));
  const valido = calendarioValido(calendario, agora);
  const estado = valido ? "verificado" : calendario ? "desatualizado" : "indisponivel";
  const modalidades = await Promise.all(MODALIDADES.map(async (modalidade) => {
    const conf = await getJsonSetting<ConferenciaFonte>(`meus_jogos.fonte.${modalidade}`);
    const recente = Boolean(conf?.ok) && Number.isFinite(new Date(conf!.verificadoEm).getTime()) &&
      agora.getTime() - new Date(conf!.verificadoEm).getTime() <= MAX_IDADE_API_MS;
    return {
      modalidade, ok: recente,
      divergencias: conf?.divergencias ?? [],
      fonteUrl: REGRAS[modalidade].fonteUrl,
    };
  }));
  return {
    estado, extraidoEm: calendario?.geradoEm ?? tentativa?.tentadoEm ?? null,
    validoAte: calendario?.validoAte ?? null,
    impressoDigital: tentativa?.impressoDigital ?? null,
    agendamento: await lerAgendamentoCalendario(),
    meses: calendario?.meses ?? [], fontes: tentativa?.fontes ?? [], erros: tentativa?.erros ?? [],
    modalidades,
    ultimasExtracoes: hist.map((r) => ({
      id: Number(r.id), tipo: String(r.tipo), origem: String(r.origem), ok: Boolean(r.ok),
      extraidoEm: new Date(r.extraido_em).toISOString(),
      validoAte: r.valido_ate ? new Date(r.valido_ate).toISOString() : null, detalhe: r.detalhe,
    })),
  };
}

export interface VerificacaoVenda {
  ok: boolean; motivo: "calendario_indisponivel" | "calendario_desatualizado" | "proximo_indisponivel" | "dados_divergentes" | "precos_indisponiveis" | "precos_divergentes" | null;
  detalhe: string | null; calendario: CalendarioOficial | null; opcoes: OpcaoConcurso[];
}

/**
 * Confere a fonte atual antes da venda: calendário válido + próximo concurso recente da API pública
 * da CAIXA + concordância entre data e número no PDF. É somente leitura na CAIXA.
 */
export async function verificarVendaCalendario(
  modalidade: Modalidade, agora: Date, margemMinutos: number, atualizarApi = true, conferirPrecoAgora = true,
): Promise<VerificacaoVenda> {
  let calendario = await lerCalendarioOficial();
  if (!calendario) return { ok: false, motivo: "calendario_indisponivel", detalhe: "Ainda não há calendário mensal validado.", calendario: null, opcoes: [] };
  if (!calendarioValido(calendario, agora)) return { ok: false, motivo: "calendario_desatualizado", detalhe: "O calendário oficial ultrapassou a validade; pedidos ficam bloqueados até nova conferência.", calendario, opcoes: [] };
  const conferencia = conferirPrecoAgora
    ? await conferirPrecoModalidade(modalidade, agora)
    : await getJsonSetting<ConferenciaFonte>(`meus_jogos.fonte.${modalidade}`);
  if (!conferencia || !Number.isFinite(new Date(conferencia.verificadoEm).getTime()) ||
      (conferirPrecoAgora && agora.getTime() - new Date(conferencia.verificadoEm).getTime() > MAX_IDADE_API_MS)) {
    return { ok: false, motivo: "precos_indisponiveis", detalhe: "Preço e regras da modalidade não foram confirmados nos últimos dez minutos.", calendario, opcoes: [] };
  }
  if (!conferencia.ok) return { ok: false, motivo: "precos_divergentes", detalhe: conferencia.divergencias.join("; "), calendario, opcoes: [] };
  let prox = await proximoConcurso(modalidade);
  if (!prox || agora.getTime() - new Date(prox.obtidoEm).getTime() > MAX_IDADE_API_MS) {
    if (atualizarApi) {
      try { await atualizarResultados(modalidade, undefined, agora); } catch { /* falha registrada no atualizador */ }
      prox = await proximoConcurso(modalidade);
    }
  }
  if (!prox || !Number.isFinite(new Date(prox.obtidoEm).getTime()) ||
      (atualizarApi && agora.getTime() - new Date(prox.obtidoEm).getTime() > MAX_IDADE_API_MS)) {
    return { ok: false, motivo: "proximo_indisponivel", detalhe: "A API oficial não confirmou um próximo concurso nos últimos dez minutos.", calendario, opcoes: [] };
  }
  const consistencia = conferirProximoComCalendario(modalidade, { concurso: prox.concurso, data: prox.data }, calendario);
  if (!consistencia.ok) return { ok: false, motivo: "dados_divergentes", detalhe: consistencia.detalhe, calendario, opcoes: [] };
  const opcoes = opcoesDeConcurso(modalidade, calendario, agora, margemMinutos);
  return { ok: true, motivo: null, detalhe: null, calendario, opcoes };
}
