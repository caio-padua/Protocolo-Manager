/**
 * Ligações reais do assistente de agendamento do Telegram (banco, agenda, envio).
 * A regra de conversa mora em telegram-agendamento.ts (pura e testada).
 */
import { registrarEvento, podeAtenderAutomatico } from "./mensageria-credito";
import { sql, type SQL } from "drizzle-orm";
import { db } from "@workspace/db";
import { logger } from "./logger";
import { LIMITE_MENSAGENS_VISITANTE_HORA } from "./telegram-contato";
import { getSetting } from "./secure-settings";
import { sendTelegram } from "./telegram";
import { chatAlertaOuNull } from "./telegram-config";
import { brtISODate } from "./brt";
import { criarInterpretador } from "./telegram-interprete";
import { baseUrlFromEnv } from "./messaging/base-url";
import { carregarFrases, comGlobais, semearFrases, type FraseDeps } from "./telegram-frases";
import { normalizar } from "./atendimento-telegram";
import { bookSession, computeResourceSlots } from "./agenda-booking";
import {
  apresentacao, conduzirAgendamento, ehPedidoDeAgendamento, ESTADO_INICIAL, type DepsAgendamento, type EstadoConversa, type Modalidade, type Oferta, type Periodo,
} from "./telegram-agendamento";

export const MARCA_RESERVA_TELEGRAM = "Reservado pelo assistente virtual (Telegram)";
const LIMITE_RESERVAS_24H = 2;
const DIAS_A_FRENTE = 21;
const LIMITE_FALHAS_IDENTIDADE_24H = 5;

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
  await exec.execute(sql`ALTER TABLE telegram_pedidos_agendamento ADD COLUMN IF NOT EXISTS cliente_id INTEGER`);
  await semearFrases(exec);
}

const SEM_CONFERENCIA: DepsAgendamento["conferirIdentidade"] = async () => ({ ok: false });

/** Confere nome + 4 primeiros dígitos do CPF + ano de nascimento. Só aceita UM cadastro compatível da clínica; nunca revela qual dado errou. */
async function conferirIdentidadeReal(chatId: string, empresaId: number, p: { nome: string; cpf4: string; ano: string }): Promise<{ ok: true; clienteId: number } | { ok: false }> {
  const chaveFalhas = `idfalhas:${chatId}`;
  const f = await db.execute(sql`SELECT estado FROM telegram_agendamento_estado WHERE chave=${chaveFalhas} AND atualizado_em > NOW() - interval '24 hours'`);
  const feitas = Number((f.rows[0] as { estado?: { n?: number } } | undefined)?.estado?.n ?? 0);
  if (feitas >= LIMITE_FALHAS_IDENTIDADE_24H) return { ok: false };
  const r = await db.execute(sql`SELECT id, name FROM clients
    WHERE empresa_id=${empresaId} AND deleted_at IS NULL AND status='active'
      AND LEFT(regexp_replace(COALESCE(cpf,''), '[^0-9]', '', 'g'), 4)=${p.cpf4}
      AND LEFT(COALESCE(birth_date,''), 4)=${p.ano}`);
  const tokens = (s: string) => normalizar(s).split(/\s+/).filter(Boolean);
  const dado = tokens(p.nome);
  const achados = (r.rows as Array<{ id: number; name: string }>).filter((c) => {
    const t = tokens(c.name);
    return t.length > 0 && dado[0] === t[0] && dado[dado.length - 1] === t[t.length - 1];
  });
  if (achados.length === 1) return { ok: true, clienteId: Number(achados[0].id) };
  const novo = feitas + 1;
  await db.execute(sql`INSERT INTO telegram_agendamento_estado (chave, estado, atualizado_em) VALUES (${chaveFalhas}, ${JSON.stringify({ n: novo })}::jsonb, ${feitas === 0 ? sql`NOW()` : sql`(SELECT atualizado_em FROM telegram_agendamento_estado WHERE chave=${chaveFalhas})`})
    ON CONFLICT (chave) DO UPDATE SET estado=EXCLUDED.estado, atualizado_em=CASE WHEN telegram_agendamento_estado.atualizado_em > NOW() - interval '24 hours' THEN telegram_agendamento_estado.atualizado_em ELSE NOW() END`);
  return { ok: false };
}

// ─────────────────────────── configuração ───────────────────────────

/**
 * Visitantes: "ligado" atende qualquer pessoa nova (sem senha nem cadastro);
 * "lista" atende só chats autorizados; "desligado" não atende ninguém.
 */
export async function visitanteAutorizado(chatId: string): Promise<boolean> {
  try {
    const modo = (await getSetting("atendimento.ia.modo"))?.trim().toLowerCase();
    if (modo === "ligado") return true;
    if (modo !== "lista") return false;
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
  let frase: FraseDeps;
  try { frase = comGlobais(await carregarFrases(), { clinica: await nomeDaClinica(e.empresaId), primeiroNome: primeiroNome ?? null }); } catch (err) {
    logger.error({ errorType: err instanceof Error ? err.constructor.name : typeof err }, "[telegram-agendamento] frases indisponíveis; sem resposta automática");
    return { tratada: false, pausa: null, alerta: null, resposta: null, desfecho: "frases_indisponiveis" };
  }
  const deps: DepsAgendamento = {
    frase, conferirIdentidade: SEM_CONFERENCIA,
    hojeISO: () => brtISODate(),
    buscarHorarios: buscarHorariosReais,
    reservar: (o) => reservarReal(e.clienteId, e.empresaId, o),
    registrarPedido: async () => 0, // cliente não usa pedido: reserva direta
    encaminharEquipe: async (m) => { motivoEquipe = m; },
    endereco: enderecoReal,
    linkMarcacao: () => `${baseUrlFromEnv()}/agendar`,
    interpretar: criarInterpretador(e.empresaId),
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

export async function atenderVisitante(chatId: string, texto: string, updateId: number | null, empresaPadrao: number, nomeTelegram?: string | null): Promise<void> {
  const ins = await db.execute(sql`INSERT INTO telegram_visitante_mensagens (chat_id, direcao, texto, update_id)
    VALUES (${chatId}, 'entrada', ${texto.slice(0, 2000)}, ${updateId}) ON CONFLICT DO NOTHING RETURNING id`);
  if (!ins.rows.length && updateId !== null) return; // entrega repetida
  // Crédito da clínica: a mensagem recebida é medida; sem saldo ela fica preservada (a equipe vê na Central),
  // sem resposta automática, e a equipe é avisada uma vez.
  const msgId = (ins.rows[0] as { id: number | string } | undefined)?.id;
  const conversaRef = `vis:${chatId}`;
  const rec = await registrarEvento({ empresaId: empresaPadrao, tipo: "recebida", chave: `recebida:vis:${msgId ?? `${chatId}:${updateId}`}`, conversaRef, descricao: "Mensagem recebida de visitante no Telegram" });
  if (!rec.ok || !(await podeAtenderAutomatico(empresaPadrao)).pode) {
    if (rec.avisoSemSaldo || !rec.ok) {
      const equipe = await chatAlertaOuNull();
      if (equipe && equipe !== chatId && rec.avisoSemSaldo) await sendTelegram(equipe, "Crédito de mensagens esgotado: novas respostas automáticas pausadas. As mensagens continuam salvas na Central Telegram. Solicite uma recarga.");
    }
    logger.warn("[telegram-agendamento] sem saldo: mensagem de visitante preservada, sem resposta automática");
    return;
  }
  // Limite por hora: acima disso só registra (a equipe vê na Central), sem resposta automática.
  const recentes = await db.execute(sql`SELECT COUNT(*)::int AS n FROM telegram_visitante_mensagens
    WHERE chat_id=${chatId} AND direcao='entrada' AND recebida_em > NOW() - INTERVAL '1 hour'`);
  if (Number((recentes.rows[0] as { n: number | string }).n) > LIMITE_MENSAGENS_VISITANTE_HORA) {
    logger.warn("[telegram-agendamento] visitante acima do limite por hora; só registrado");
    return;
  }
  const chave = `visitante:${chatId}`;
  const pausado = await db.execute(sql`SELECT 1 FROM telegram_agendamento_estado WHERE chave=${`pausa:${chatId}`}`);
  const alertar = async (t: string) => {
    const chat = await chatAlertaOuNull();
    if (chat && chat !== chatId) await sendTelegram(chat, t);
  };
  if (pausado.rows.length) { await alertar("Visitante no Telegram escreveu de novo. Abra a Central Telegram."); return; }
  let motivo: string | null = null;
  let empresaId = empresaPadrao;
  let frase: FraseDeps;
  // Nome que o próprio Telegram informa (first_name): só letras, para nunca ecoar lixo.
  const primeiroNomeVisitante = nomeTelegram && /^[\p{L}][\p{L}'’-]{0,29}$/u.test(nomeTelegram.trim()) ? nomeTelegram.trim() : null;
  try { frase = comGlobais(await carregarFrases(), { clinica: await nomeDaClinica(empresaId), primeiroNome: primeiroNomeVisitante }); } catch (err) {
    logger.error({ errorType: err instanceof Error ? err.constructor.name : typeof err }, "[telegram-agendamento] frases indisponíveis; visitante preservado, sem resposta automática");
    return;
  }
  const deps: DepsAgendamento = {
    frase, conferirIdentidade: (p) => conferirIdentidadeReal(chatId, empresaPadrao, p),
    hojeISO: () => brtISODate(),
    buscarHorarios: async (p) => { const rec = await recursoDaModalidade(p.modalidade); if (rec) empresaId = rec.empresaId; return buscarHorariosReais(p); },
    reservar: async () => ({ ok: false, motivo: "erro" }), // nunca reserva para visitante
    registrarPedido: async (p) => {
      const r = await db.execute(sql`INSERT INTO telegram_pedidos_agendamento (empresa_id, chat_id, nome, telefone, modalidade, oferta, estado, cliente_id)
        VALUES (${empresaId}, ${chatId}, ${p.nome}, ${p.telefone}, ${p.estado.modalidade ?? null},
          ${p.oferta ? JSON.stringify(p.oferta) : null}::jsonb, ${JSON.stringify(p.estado)}::jsonb, ${p.estado.clienteId ?? null}) RETURNING id`);
      return Number((r.rows[0] as { id: number | string }).id);
    },
    encaminharEquipe: async (m) => { motivo = m; },
    endereco: enderecoReal,
    interpretar: criarInterpretador(empresaPadrao),
  };
  const r = await conduzirAgendamento(await lerEstado(chave), texto, { ehCliente: false, primeiroNome: primeiroNomeVisitante ?? undefined, nomeClinica: await nomeDaClinica(empresaId) }, deps, new Date().toISOString());
  let resposta = r.resposta;
  if (!r.tratada) {
    // Queixa de saúde: sem texto automático (revisão do Dr. Caio pendente). Só avisa a equipe e acolhe sem opinar.
    motivo = "queixa_de_visitante";
    resposta = frase("queixa_visitante", { apresentacao: apresentacao(frase, await nomeDaClinica(empresaId)) });
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
      const saida = await db.execute(sql`INSERT INTO telegram_visitante_mensagens (chat_id, direcao, texto, lida_em) VALUES (${chatId}, 'saida', ${resposta}, NOW()) RETURNING id`);
      const sid = (saida.rows[0] as { id: number | string }).id;
      await registrarEvento({ empresaId: empresaPadrao, tipo: "enviada", chave: `enviada:vis:${sid}`, conversaRef, descricao: "Resposta enviada ao visitante no Telegram" });
      if (r.desfecho === "pedido_registrado") await registrarEvento({ empresaId: empresaPadrao, tipo: "solucionada", chave: `solucionada:vis:${chatId}:${msgId}`, conversaRef, descricao: "Pedido de agendamento registrado" });
    } else {
      logger.warn("[telegram-agendamento] resposta ao visitante não foi aceita pelo Telegram");
    }
  }
}

export { ESTADO_INICIAL };
