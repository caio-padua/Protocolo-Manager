/**
 * Ligações reais do assistente de agendamento do Telegram (banco, agenda, envio).
 * A regra de conversa mora em telegram-agendamento.ts (pura e testada).
 */
import { sql, type SQL } from "drizzle-orm";
import { db } from "@workspace/db";
import { logger } from "./logger";
import { getSetting } from "./secure-settings";
import { sendTelegram } from "./telegram";
import { chatAlertaOuNull } from "./telegram-config";
import { brtISODate } from "./brt";
import { normalizar } from "./atendimento-telegram";
import { bookSession, computeResourceSlots } from "./agenda-booking";
import {
  apresentacao, conduzirAgendamento, ehPedidoDeAgendamento, ESTADO_INICIAL, type DepsAgendamento, type EstadoConversa, type Modalidade, type Oferta, type Periodo,
} from "./telegram-agendamento";

export const MARCA_RESERVA_TELEGRAM = "Reservado pelo assistente virtual (Telegram)";
const LIMITE_RESERVAS_24H = 2;
const DIAS_A_FRENTE = 21;

export async function aplicarMigracaoAgendamentoTelegram(exec: { execute: (q: SQL) => Promise<unknown> }): Promise<void> {
  await exec.execute(sql`CREATE TABLE IF NOT EXISTS telegram_agendamento_estado (
    chave TEXT PRIMARY KEY, estado JSONB NOT NULL, atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await exec.execute(sql`CREATE TABLE IF NOT EXISTS telegram_visitante_mensagens (
    id BIGSERIAL PRIMARY KEY, chat_id TEXT NOT NULL, direcao TEXT NOT NULL, texto TEXT NOT NULL,
    update_id BIGINT, recebida_em TIMESTAMPTZ NOT NULL DEFAULT NOW(), lida_em TIMESTAMPTZ)`);
  await exec.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS ux_visitante_msg_update
    ON telegram_visitante_mensagens (chat_id, update_id) WHERE update_id IS NOT NULL AND direcao='entrada'`);
  await exec.execute(sql`CREATE INDEX IF NOT EXISTS ix_visitante_msg_chat ON telegram_visitante_mensagens (chat_id, recebida_em)`);
  await exec.execute(sql`CREATE TABLE IF NOT EXISTS telegram_pedidos_agendamento (
    id BIGSERIAL PRIMARY KEY, empresa_id INTEGER NOT NULL, chat_id TEXT NOT NULL, nome TEXT NOT NULL, telefone TEXT NOT NULL,
    modalidade TEXT, oferta JSONB, estado JSONB, status TEXT NOT NULL DEFAULT 'novo',
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(), tratado_em TIMESTAMPTZ)`);
}

// ─────────────────────────── configuração ───────────────────────────

/** Visitantes: só atende chat que esteja na lista E com a assistente fora de "desligado". */
export async function visitanteAutorizado(chatId: string): Promise<boolean> {
  try {
    const modo = (await getSetting("atendimento.ia.modo"))?.trim().toLowerCase();
    if (modo !== "lista" && modo !== "ligado") return false;
    const raw = await getSetting("atendimento.visitantes.permitidos");
    if (!raw) return false;
    const arr: unknown = JSON.parse(raw);
    return Array.isArray(arr) && arr.map(String).includes(chatId);
  } catch { return false; }
}

// ─────────────────────────── agenda ───────────────────────────

async function recursoDaModalidade(m: Modalidade): Promise<{ id: number; empresaId: number } | null> {
  const modalidadeDb = m === "online" ? "online" : "local";
  const r = await db.execute(sql`SELECT r.id, COALESCE(r.empresa_id, l.empresa_id) AS empresa_id
    FROM agenda_resources r
    JOIN professionals p ON p.id = r.professional_id AND p.is_primary_doctor AND p.active
    LEFT JOIN locations l ON l.id = r.location_id
    WHERE r.active AND r.kind='medico' AND r.modality=${modalidadeDb}
    ORDER BY r.id LIMIT 1`);
  const x = r.rows[0] as { id: number; empresa_id: number } | undefined;
  return x ? { id: Number(x.id), empresaId: Number(x.empresa_id) } : null;
}

const periodoDaHora = (h: string): Exclude<Periodo, "qualquer"> => {
  const hh = Number(h.slice(0, 2));
  return hh < 12 ? "manha" : hh < 18 ? "tarde" : "noite";
};

function somar(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
}

export async function buscarHorariosReais(p: Parameters<DepsAgendamento["buscarHorarios"]>[0]): ReturnType<DepsAgendamento["buscarHorarios"]> {
  const rec = await recursoDaModalidade(p.modalidade);
  if (!rec) return { ofertas: [], semAgenda: true };
  const hoje = brtISODate();
  const datas = p.datas ? p.datas.filter((d) => d >= hoje) : Array.from({ length: DIAS_A_FRENTE }, (_, i) => somar(hoje, i));
  const achados: Oferta[][] = [];
  for (const data of datas) {
    const wd = new Date(`${data}T12:00:00Z`).getUTCDay();
    if (p.dias && !p.dias.includes(wd)) continue;
    const c = await computeResourceSlots(rec.id, data);
    if (!c) continue;
    const livres = c.result.slots
      .filter((s) => s.state === "aberto" && (p.periodo === "qualquer" || periodoDaHora(s.time) === p.periodo))
      .map((s): Oferta => ({ data, hora: s.time, recursoId: rec.id, modalidade: p.modalidade }))
      .filter((o) => !p.excluir.includes(`${o.recursoId}|${o.data}|${o.hora}`));
    if (livres.length) achados.push(livres);
    if (achados.length >= p.max && !p.datas) break;
  }
  // Um horário por dia primeiro (variedade); depois completa com os seguintes do mesmo dia.
  const saida: Oferta[] = [];
  for (const dia of achados) if (saida.length < p.max) saida.push(dia[0]);
  for (const dia of achados) for (const o of dia.slice(1)) if (saida.length < p.max) saida.push(o);
  saida.sort((a, b) => (a.data + a.hora).localeCompare(b.data + b.hora));
  return { ofertas: saida, semAgenda: false };
}

async function reservarReal(clienteId: number, empresaId: number, o: Oferta): ReturnType<DepsAgendamento["reservar"]> {
  try {
    const rec = await db.execute(sql`SELECT id FROM sessions WHERE client_id=${clienteId} AND resource_id=${o.recursoId}
      AND scheduled_date=${o.data} AND scheduled_time=${o.hora} AND status IN ('scheduled','confirmed') LIMIT 1`);
    if (rec.rows[0]) return { ok: true, sessionId: Number((rec.rows[0] as { id: number }).id) }; // repetição: já gravada
    const lim = await db.execute(sql`SELECT COUNT(*)::int AS n FROM sessions WHERE client_id=${clienteId}
      AND notes=${MARCA_RESERVA_TELEGRAM} AND created_at > NOW() - interval '24 hours'`);
    if (Number((lim.rows[0] as { n: number }).n) >= LIMITE_RESERVAS_24H) return { ok: false, motivo: "limite" };
    const r = await bookSession({
      resourceId: o.recursoId, clientId: clienteId, consultaAvulsa: true, date: o.data, time: o.hora,
      syncGoogle: false, empresaId,
    });
    if (r.ok && r.session) {
      await db.execute(sql`UPDATE sessions SET notes=${MARCA_RESERVA_TELEGRAM} WHERE id=${r.session.id}`);
      return { ok: true, sessionId: r.session.id };
    }
    return { ok: false, motivo: r.status === 409 ? "indisponivel" : "erro" };
  } catch (err) {
    logger.error({ errorType: err instanceof Error ? err.constructor.name : typeof err }, "[telegram-agendamento] falha ao reservar");
    return { ok: false, motivo: "erro" };
  }
}

async function enderecoReal(m: Modalidade): Promise<string | null> {
  if (m !== "presencial") return null;
  const r = await db.execute(sql`SELECT l.address FROM agenda_resources r
    JOIN professionals p ON p.id=r.professional_id AND p.is_primary_doctor AND p.active
    JOIN locations l ON l.id=r.location_id
    WHERE r.active AND r.kind='medico' AND r.modality='local' ORDER BY r.id LIMIT 1`);
  const a = (r.rows[0] as { address?: string } | undefined)?.address?.trim();
  return a || null;
}

// ─────────────────────────── estado ───────────────────────────

async function lerEstado(chave: string): Promise<EstadoConversa | null> {
  const r = await db.execute(sql`SELECT estado FROM telegram_agendamento_estado WHERE chave=${chave}`);
  return (r.rows[0] as { estado?: EstadoConversa } | undefined)?.estado ?? null;
}
async function gravarEstado(chave: string, e: EstadoConversa): Promise<void> {
  await db.execute(sql`INSERT INTO telegram_agendamento_estado (chave, estado) VALUES (${chave}, ${JSON.stringify(e)}::jsonb)
    ON CONFLICT (chave) DO UPDATE SET estado=EXCLUDED.estado, atualizado_em=NOW()`);
}

// ─────────────────────────── cliente cadastrado (pipeline durável) ───────────────────────────

export interface PlanoAgendamentoCliente {
  tratada: boolean;
  pausa: string | null;
  alerta: string | null;
  resposta: string | null;
  desfecho: string;
}

/** Só PLANEJA e grava a reserva real quando o cliente escolheu o horário. O envio é do pipeline durável. */
export async function planejarAgendamentoCliente(e: { empresaId: number; clienteId: number; texto: string }): Promise<PlanoAgendamentoCliente> {
  const chave = `cliente:${e.clienteId}`;
  const anterior = await lerEstado(chave);
  const emAndamento = !!anterior && anterior.etapa !== "inicio" && anterior.etapa !== "concluido";
  // Conversa que não é de agendamento nem está em andamento: não toca em mais nada, segue o fluxo de orientações.
  if (!emAndamento && !ehPedidoDeAgendamento(e.texto) && !/\b(atendente|humano|secretaria|equipe)\b/.test(normalizar(e.texto))) {
    return { tratada: false, pausa: null, alerta: null, resposta: null, desfecho: "fora_do_assunto" };
  }
  const nomeRow = await db.execute(sql`SELECT name FROM clients WHERE id=${e.clienteId} AND empresa_id=${e.empresaId}`);
  const nome = (nomeRow.rows[0] as { name?: string } | undefined)?.name ?? "";
  const primeiro = nome.trim().split(/\s+/)[0];
  const primeiroNome = primeiro ? primeiro.charAt(0).toUpperCase() + primeiro.slice(1).toLowerCase() : undefined;
  let motivoEquipe: string | null = null;
  const deps: DepsAgendamento = {
    hojeISO: () => brtISODate(),
    buscarHorarios: buscarHorariosReais,
    reservar: (o) => reservarReal(e.clienteId, e.empresaId, o),
    registrarPedido: async () => 0, // cliente não usa pedido: reserva direta
    encaminharEquipe: async (m) => { motivoEquipe = m; },
    endereco: enderecoReal,
  };
  const agora = new Date().toISOString();
  const r = await conduzirAgendamento(anterior, e.texto, { ehCliente: true, primeiroNome, nomeClinica: await nomeDaClinica(e.empresaId) }, deps, agora);
  if (!r.tratada) return { tratada: false, pausa: null, alerta: null, resposta: null, desfecho: r.desfecho };
  await gravarEstado(chave, r.estado);
  return {
    tratada: true,
    pausa: motivoEquipe ? `agendamento_${motivoEquipe}` : null,
    alerta: motivoEquipe ? `Agendamento pelo Telegram precisa da equipe (${motivoEquipe}), cliente #${e.clienteId}. Abra a conversa no Cockpit protegido.` : null,
    resposta: r.resposta,
    desfecho: r.desfecho,
  };
}

// ─────────────────────────── visitante (sem cadastro) ───────────────────────────

/** Atende quem ainda não é cliente. Nunca cria cliente nem reserva: grava mensagem e, no fim, um pedido para a equipe. */
async function nomeDaClinica(empresaId: number): Promise<string | undefined> {
  const r = await db.execute(sql`SELECT nome FROM empresas WHERE id=${empresaId}`);
  return (r.rows[0] as { nome?: string } | undefined)?.nome?.trim() || undefined;
}

export async function atenderVisitante(chatId: string, texto: string, updateId: number | null, empresaPadrao: number): Promise<void> {
  const ins = await db.execute(sql`INSERT INTO telegram_visitante_mensagens (chat_id, direcao, texto, update_id)
    VALUES (${chatId}, 'entrada', ${texto.slice(0, 2000)}, ${updateId}) ON CONFLICT DO NOTHING RETURNING id`);
  if (!ins.rows.length && updateId !== null) return; // entrega repetida
  const chave = `visitante:${chatId}`;
  const pausado = await db.execute(sql`SELECT 1 FROM telegram_agendamento_estado WHERE chave=${`pausa:${chatId}`}`);
  const alertar = async (t: string) => {
    const chat = await chatAlertaOuNull();
    if (chat && chat !== chatId) await sendTelegram(chat, t);
  };
  if (pausado.rows.length) { await alertar("Visitante no Telegram escreveu de novo. Abra a Central Telegram."); return; }
  let motivo: string | null = null;
  let empresaId = empresaPadrao;
  const deps: DepsAgendamento = {
    hojeISO: () => brtISODate(),
    buscarHorarios: async (p) => { const rec = await recursoDaModalidade(p.modalidade); if (rec) empresaId = rec.empresaId; return buscarHorariosReais(p); },
    reservar: async () => ({ ok: false, motivo: "erro" }), // nunca reserva para visitante
    registrarPedido: async (p) => {
      const r = await db.execute(sql`INSERT INTO telegram_pedidos_agendamento (empresa_id, chat_id, nome, telefone, modalidade, oferta, estado)
        VALUES (${empresaId}, ${chatId}, ${p.nome}, ${p.telefone}, ${p.estado.modalidade ?? null},
          ${p.oferta ? JSON.stringify(p.oferta) : null}::jsonb, ${JSON.stringify(p.estado)}::jsonb) RETURNING id`);
      return Number((r.rows[0] as { id: number | string }).id);
    },
    encaminharEquipe: async (m) => { motivo = m; },
    endereco: enderecoReal,
  };
  const r = await conduzirAgendamento(await lerEstado(chave), texto, { ehCliente: false, nomeClinica: await nomeDaClinica(empresaId) }, deps, new Date().toISOString());
  let resposta = r.resposta;
  if (!r.tratada) {
    // Queixa de saúde: sem texto automático (revisão do Dr. Caio pendente). Só avisa a equipe e acolhe sem opinar.
    motivo = "queixa_de_visitante";
    resposta = `${apresentacao(await nomeDaClinica(empresaId))} Recebi sua mensagem e já avisei a equipe, que responde por aqui. Se for algo urgente, procure o pronto-socorro ou ligue 192 (SAMU).`;
  }
  await gravarEstado(chave, r.estado);
  if (r.desfecho === "pedido_registrado") await alertar("Novo pedido de agendamento pelo Telegram (visitante sem cadastro). Abra a Central Telegram.");
  if (motivo) {
    const pausar = ["queixa_de_visitante", "cancelar_ou_remarcar", "pediu_pessoa"].includes(motivo);
    if (pausar) await db.execute(sql`INSERT INTO telegram_agendamento_estado (chave, estado) VALUES (${`pausa:${chatId}`}, ${JSON.stringify({ motivo })}::jsonb) ON CONFLICT DO NOTHING`);
    await alertar(`Visitante no Telegram precisa da equipe (${motivo}). Abra a Central Telegram.`);
  }
  if (resposta) {
    const env = await sendTelegram(chatId, resposta);
    if (env.sent && !env.mock) {
      await db.execute(sql`INSERT INTO telegram_visitante_mensagens (chat_id, direcao, texto, lida_em) VALUES (${chatId}, 'saida', ${resposta}, NOW())`);
    } else {
      logger.warn("[telegram-agendamento] resposta ao visitante não foi aceita pelo Telegram");
    }
  }
}

export { ESTADO_INICIAL };
