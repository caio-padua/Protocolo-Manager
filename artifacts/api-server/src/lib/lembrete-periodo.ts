// MOTOR DO LEMBRETE POR PERÍODO (portado do IHE, nativo).
//
// REGRA DE OURO: o disparo é POR JANELA/PERÍODO do dia, nunca por fórmula. Cada
// lembrete tem uma lista de horários de envio (ex.: ["07:00","18:00"]). A cada
// tick (1 min), se a hora local (BRT) casar com um horário — no horário ou até a
// tolerância (5 min) depois, NUNCA antes — sai UMA mensagem com todas as fórmulas
// daquela lista. Idempotência pela unique (lembrete_id, janela): um marcador
// PENDENTE é gravado ANTES do disparo; o status final (ENVIADO/FALHOU) só depois.
//
// Manager é single-tenant: sem unidade, fuso FIXO America/Sao_Paulo.
import {
  db,
  lembretesPrescricaoTable,
  lembreteEnviosTable,
  clientsTable,
  type LembretePeriodoJson,
} from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { logger } from "./logger";
import { sendWhatsapp } from "./whatsapp";
import { montarSaudacao, templateLembretePrescricao, type Genero } from "./lembrete-templates";
import { montarMensagemOpus } from "./mensageria-opus";

const TIMEZONE = "America/Sao_Paulo";

export interface ExecutarLembretesOptions {
  now?: Date;
  toleranciaMinutos?: number;
}

export interface LembreteEnvioResult {
  lembreteId: number;
  clienteId: number;
  janela: string;
  sucesso: boolean;
  jaEnviado?: boolean;
  erro?: string;
  whatsappLogId?: number;
}

export interface ExecutarLembretesResult {
  examinados: number;
  enviados: number;
  falhas: number;
  pulados: number;
  detalhes: LembreteEnvioResult[];
}

interface LocalParts {
  data: string;
  horaMin: number;
}

// Calcula HH:MM (em minutos) e a data YYYY-MM-DD em uma timezone arbitrária.
export function partsParaTimezone(now: Date, timezone: string): LocalParts {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  const data = `${get("year")}-${get("month")}-${get("day")}`;
  const hh = parseInt(get("hour"), 10);
  const mm = parseInt(get("minute"), 10);
  const horaMin = (hh % 24) * 60 + mm; // Intl pode devolver "24" à meia-noite
  return { data, horaMin };
}

function parseHorario(horario: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(horario.trim());
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const mn = parseInt(m[2], 10);
  if (h < 0 || h > 23 || mn < 0 || mn > 59) return null;
  return h * 60 + mn;
}

function janelaKey(data: string, horario: string): string {
  return `${data} ${horario.trim()}`;
}

// Identifica qual horário configurado está dentro da janela de envio.
// Dispara SÓ se `horaMinAgora >= alvo` e `horaMinAgora - alvo <= tolerância`:
// no horário marcado ou até `tolerância` minutos depois, nunca antes.
export function horarioDentroDaJanela(
  horarios: string[],
  horaMinAgora: number,
  toleranciaMinutos: number,
): string | null {
  for (const horario of horarios) {
    const alvo = parseHorario(horario);
    if (alvo == null) continue;
    const delta = horaMinAgora - alvo;
    if (delta >= 0 && delta <= toleranciaMinutos) {
      return horario.trim();
    }
  }
  return null;
}

interface LembreteComContexto {
  id: number;
  clienteId: number;
  periodos: LembretePeriodoJson[];
  horariosEnvio: string[];
  clienteNome: string;
  clienteTelefone: string | null;
}

async function carregarLembretesAtivos(): Promise<LembreteComContexto[]> {
  const rows = await db
    .select({
      id: lembretesPrescricaoTable.id,
      clienteId: lembretesPrescricaoTable.clienteId,
      periodos: lembretesPrescricaoTable.periodos,
      horariosEnvio: lembretesPrescricaoTable.horariosEnvio,
      clienteNome: clientsTable.name,
      clienteTelefone: clientsTable.phone,
    })
    .from(lembretesPrescricaoTable)
    .innerJoin(clientsTable, eq(clientsTable.id, lembretesPrescricaoTable.clienteId))
    .where(
      and(
        eq(lembretesPrescricaoTable.ativo, true),
        eq(clientsTable.status, "active"),
      ),
    );

  return rows.map((r) => ({
    id: r.id,
    clienteId: r.clienteId,
    periodos: Array.isArray(r.periodos) ? r.periodos : [],
    horariosEnvio: Array.isArray(r.horariosEnvio) ? r.horariosEnvio : [],
    clienteNome: r.clienteNome,
    clienteTelefone: r.clienteTelefone,
  }));
}

// ============================================================================
// PONTE DO COCKPIT → MOTOR RICO (substitui o motor simples `mensageria.ts`).
//
// O Cockpit ("Finalizar e Emitir Tudo") monta uma lista de itens (fórmula,
// injetável, exame). Aqui traduzimos os PERÍODOS antigos (manha/tarde/noite) do
// motor simples para os PERÍODOS CANÔNICOS do IHE (sigla + janela) e gravamos
// UM lembrete por cliente em `lembretes_prescricao`. Os `horariosEnvio` saem do
// janela_inicio de cada período usado. Regra de ouro: 1 mensagem por janela.
// ============================================================================

type PeriodoAntigo = "manha" | "tarde" | "noite";

// Item recebido do Cockpit (mesmo formato do motor simples, sem depender dele).
export interface ItemLembretePrescricao {
  tipo: "formula" | "injetavel" | "exame";
  nome: string;
  detalhe?: string;
  periodos?: PeriodoAntigo[];
}

// Mapa período antigo → canônico do IHE (sigla, nome, janela_inicio HH:MM).
const MAPA_PERIODO: Record<PeriodoAntigo, { sigla: string; nome: string; inicio: string }> = {
  manha: { sigla: "IM", nome: "Início da Manhã", inicio: "07:00" },
  tarde: { sigla: "IT", nome: "Início da Tarde", inicio: "13:30" },
  noite: { sigla: "NO", nome: "Noite", inicio: "18:00" },
};

// Períodos padrão por tipo (igual ao motor simples): fórmula de manhã e à noite,
// injetável e exame pela manhã. Pode ser sobrescrito por item.periodos.
function periodosPadrao(tipo: ItemLembretePrescricao["tipo"]): PeriodoAntigo[] {
  if (tipo === "formula") return ["manha", "noite"];
  return ["manha"];
}

export interface SincronizarLembreteResult {
  lembreteId: number;
  periodos: number;
  horarios: string[];
  formulas: number;
  ativo: boolean;
}

// Grava/atualiza o lembrete de prescrição do cliente a partir dos itens do
// Cockpit. Idempotente por cliente: um único lembrete ativo. Sem itens →
// desativa o lembrete existente (nada dispara), preservando o histórico.
export async function sincronizarLembretePrescricao(
  clienteId: number,
  itens: ItemLembretePrescricao[],
): Promise<SincronizarLembreteResult> {
  // Agrupa fórmulas por período canônico (sigla). Ordem estável (JE..CE via inicio).
  const porSigla = new Map<string, LembretePeriodoJson>();
  const horariosSet = new Set<string>();
  let formulas = 0;

  for (const item of itens) {
    const periodos = item.periodos?.length ? item.periodos : periodosPadrao(item.tipo);
    for (const p of periodos) {
      const canon = MAPA_PERIODO[p];
      if (!canon) continue;
      horariosSet.add(canon.inicio);
      let bloco = porSigla.get(canon.sigla);
      if (!bloco) {
        bloco = { sigla: canon.sigla, nome: canon.nome, tipo: "tomar", formulas: [] };
        porSigla.set(canon.sigla, bloco);
      }
      bloco.formulas.push({ nome: item.nome, posologia: item.detalhe });
      formulas += 1;
    }
  }

  const horarios = [...horariosSet].sort();
  const periodos = [...porSigla.values()];
  const temItens = periodos.length > 0;

  // Upsert atômico por cliente (unique em cliente_id): sem corrida de 2 lembretes.
  const [linha] = await db
    .insert(lembretesPrescricaoTable)
    .values({ clienteId, periodos, horariosEnvio: horarios, ativo: temItens })
    .onConflictDoUpdate({
      target: lembretesPrescricaoTable.clienteId,
      set: { periodos, horariosEnvio: horarios, ativo: temItens, updatedAt: new Date() },
    })
    .returning({ id: lembretesPrescricaoTable.id });
  return { lembreteId: linha.id, periodos: periodos.length, horarios, formulas, ativo: temItens };
}

export async function executarLembretesPeriodo(
  options: ExecutarLembretesOptions = {},
): Promise<ExecutarLembretesResult> {
  const now = options.now ?? new Date();
  const tolerancia = options.toleranciaMinutos ?? 5;

  const lembretes = await carregarLembretesAtivos();
  const detalhes: LembreteEnvioResult[] = [];
  let enviados = 0;
  let falhas = 0;
  let pulados = 0;

  const local = partsParaTimezone(now, TIMEZONE);

  for (const ctx of lembretes) {
    if (ctx.horariosEnvio.length === 0) {
      pulados += 1;
      continue;
    }

    const horarioMatch = horarioDentroDaJanela(ctx.horariosEnvio, local.horaMin, tolerancia);
    if (!horarioMatch) {
      pulados += 1;
      continue;
    }

    const janela = janelaKey(local.data, horarioMatch);

    // Idempotência: tenta inserir o marcador PENDENTE. Se a unique bater, pula.
    const claimRows = await db
      .insert(lembreteEnviosTable)
      .values({
        lembreteId: ctx.id,
        clienteId: ctx.clienteId,
        janela,
        status: "PENDENTE",
      })
      .onConflictDoNothing({
        target: [lembreteEnviosTable.lembreteId, lembreteEnviosTable.janela],
      })
      .returning({ id: lembreteEnviosTable.id });
    const claim = claimRows[0];
    if (!claim) {
      detalhes.push({ lembreteId: ctx.id, clienteId: ctx.clienteId, janela, sucesso: true, jaEnviado: true });
      pulados += 1;
      continue;
    }
    const envioId = claim.id;

    // Sem telefone: não há como enviar. Marca FALHOU e segue (visível na tela).
    if (!ctx.clienteTelefone || !ctx.clienteTelefone.trim()) {
      falhas += 1;
      const erro = "cliente sem telefone";
      await db.update(lembreteEnviosTable).set({ status: "FALHOU", erro }).where(eq(lembreteEnviosTable.id, envioId));
      detalhes.push({ lembreteId: ctx.id, clienteId: ctx.clienteId, janela, sucesso: false, erro });
      continue;
    }

    // Gênero não existe hoje em `clients` → tratamento cai no primeiro nome.
    const genero: Genero = "nao_informado";
    // Mensagem RICA (Mensageria Opus). Falha-segura: qualquer erro OU catálogo
    // vazio cai no template simples — o envio NUNCA quebra por causa da riqueza.
    let mensagem: string;
    try {
      const primeiroNome = (ctx.clienteNome || "").trim().split(/\s+/)[0] || ctx.clienteNome;
      const rica = await montarMensagemOpus({
        nome: primeiroNome,
        agora: now,
        periodos: ctx.periodos,
      });
      mensagem = rica ?? templateLembretePrescricao({
        clienteNome: ctx.clienteNome,
        clienteGenero: genero,
        agora: now,
        saudacao: montarSaudacao(ctx.clienteNome, genero, now),
        periodos: ctx.periodos,
      });
    } catch (err) {
      logger.warn(
        { lembreteId: ctx.id, clienteId: ctx.clienteId, erro: err instanceof Error ? err.message : String(err) },
        "[lembrete-periodo] montagem Opus falhou; usando template simples",
      );
      mensagem = templateLembretePrescricao({
        clienteNome: ctx.clienteNome,
        clienteGenero: genero,
        agora: now,
        saudacao: montarSaudacao(ctx.clienteNome, genero, now),
        periodos: ctx.periodos,
      });
    }

    let resultado: Awaited<ReturnType<typeof sendWhatsapp>>;
    try {
      resultado = await sendWhatsapp(ctx.clienteTelefone, mensagem, {
        contexto: "lembrete_prescricao",
        clienteId: ctx.clienteId,
      });
    } catch (err) {
      resultado = { sent: false, via: "link", link: "", error: err instanceof Error ? err.message : String(err) };
    }

    if (resultado.sent) {
      enviados += 1;
      await db
        .update(lembreteEnviosTable)
        .set({ status: "ENVIADO", whatsappLogId: resultado.logId ?? null, erro: null, enviadoEm: new Date() })
        .where(eq(lembreteEnviosTable.id, envioId));
      detalhes.push({ lembreteId: ctx.id, clienteId: ctx.clienteId, janela, sucesso: true, whatsappLogId: resultado.logId });
    } else if (resultado.via === "link" && !resultado.error) {
      // Twilio não configurado: não é falha de entrega, é ausência de canal.
      // Marca SEM_TWILIO (não conta como falha; fica separado na tela de status).
      pulados += 1;
      await db
        .update(lembreteEnviosTable)
        .set({ status: "SEM_TWILIO", whatsappLogId: resultado.logId ?? null, erro: null })
        .where(eq(lembreteEnviosTable.id, envioId));
      detalhes.push({ lembreteId: ctx.id, clienteId: ctx.clienteId, janela, sucesso: false, jaEnviado: false, erro: "sem twilio", whatsappLogId: resultado.logId });
    } else {
      falhas += 1;
      const erro = resultado.error ?? "falha no envio";
      await db
        .update(lembreteEnviosTable)
        .set({ status: "FALHOU", whatsappLogId: resultado.logId ?? null, erro })
        .where(eq(lembreteEnviosTable.id, envioId));
      logger.warn({ lembreteId: ctx.id, clienteId: ctx.clienteId, janela, erro }, "[lembrete-periodo] falha no envio");
      detalhes.push({ lembreteId: ctx.id, clienteId: ctx.clienteId, janela, sucesso: false, erro, whatsappLogId: resultado.logId });
    }
  }

  return { examinados: lembretes.length, enviados, falhas, pulados, detalhes };
}
