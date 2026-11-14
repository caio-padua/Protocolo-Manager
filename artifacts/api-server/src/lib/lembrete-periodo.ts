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
  type LembreteFormulaJson,
} from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import { logger } from "./logger";
import { sendWhatsapp, registrarLogMensagem } from "./whatsapp";
import { montarSaudacao, templateLembretePrescricao, type Genero } from "./lembrete-templates";
import { montarMensagemPaxmed } from "./mensageria-paxmed";
import { reminderConsentFilter } from "./reminder-consent";
import { lerConfigLembreteTelegram, usaTelegram, enviarLembreteTelegram } from "./lembrete-telegram";

const TIMEZONE = "America/Sao_Paulo";

export interface ExecutarLembretesOptions {
  now?: Date;
  toleranciaMinutos?: number;
  /** Máximo de lembretes processados simultaneamente por tick (padrão: 10). */
  concorrencia?: number;
  /**
   * Teste controlado: processa SOMENTE este cliente. Os demais lembretes não são
   * carregados, avaliados nem enviados, por nenhum canal. Não altera nem pausa nada.
   */
  clienteId?: number;
  /**
   * Quando verdadeiro, só o Telegram pode ser usado: se o Telegram não estiver liberado
   * ou vinculado para o cliente, NADA é enviado nem gravado (sem recuo para WhatsApp).
   * Padrão: verdadeiro quando `clienteId` é informado; falso na execução normal.
   */
  somenteTelegram?: boolean;
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

/**
 * Períodos que pertencem a ESTA janela de envio. Cada período canônico tem um horário de início
 * (MAPA_PERIODO); a mensagem das 18:00 leva só os períodos das 18:00, nunca as doses (nem a abertura)
 * da manhã. Se nenhum período casar (horários editados à mão, dado antigo), mantém o comportamento
 * anterior e devolve todos — e o chamador registra aviso.
 */
export function periodosDaJanela(
  periodos: LembretePeriodoJson[],
  horario: string,
): { periodos: LembretePeriodoJson[]; casou: boolean } {
  const alvo = parseHorario(horario);
  const doHorario = periodos.filter((p) => {
    const inicio = Object.values(MAPA_PERIODO).find((m) => m.sigla === p.sigla)?.inicio;
    return inicio != null && alvo != null && parseHorario(inicio) === alvo;
  });
  return doHorario.length > 0 ? { periodos: doHorario, casou: true } : { periodos, casou: false };
}

interface LembreteComContexto {
  id: number;
  clienteId: number;
  periodos: LembretePeriodoJson[];
  horariosEnvio: string[];
  clienteNome: string;
  clienteTelefone: string | null;
  telegramChatId: string | null;
  empresaId: number | null;
}

async function carregarLembretesAtivos(clienteId?: number): Promise<LembreteComContexto[]> {
  const rows = await db
    .select({
      id: lembretesPrescricaoTable.id,
      clienteId: lembretesPrescricaoTable.clienteId,
      periodos: lembretesPrescricaoTable.periodos,
      horariosEnvio: lembretesPrescricaoTable.horariosEnvio,
      clienteNome: clientsTable.name,
      clienteTelefone: clientsTable.phone,
      telegramChatId: clientsTable.telegramChatId,
      empresaId: clientsTable.empresaId,
    })
    .from(lembretesPrescricaoTable)
    .innerJoin(clientsTable, eq(clientsTable.id, lembretesPrescricaoTable.clienteId))
    .where(
      and(
        eq(lembretesPrescricaoTable.ativo, true),
        eq(clientsTable.status, "active"),
        reminderConsentFilter(),
        ...(clienteId !== undefined ? [eq(lembretesPrescricaoTable.clienteId, clienteId)] : []),
      ),
    );

  return rows
    // Defesa em profundidade: mesmo que a consulta mude, nunca devolve outro cliente.
    .filter((r) => clienteId === undefined || r.clienteId === clienteId)
    .map((r) => ({
    id: r.id,
    clienteId: r.clienteId,
    periodos: Array.isArray(r.periodos) ? r.periodos : [],
    horariosEnvio: Array.isArray(r.horariosEnvio) ? r.horariosEnvio : [],
    clienteNome: r.clienteNome,
    clienteTelefone: r.clienteTelefone,
    telegramChatId: r.telegramChatId ?? null,
    empresaId: r.empresaId,
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

// Chaves internas dos 9 períodos canônicos (espelho da tabela `periodos_dia`,
// cânone herdado do IHE). "manha/tarde/noite" preservam compatibilidade com o
// motor simples; os demais foram abertos em 09/07/2026 (ordem do CEO: posologia
// amarrada aos períodos canônicos — jejum, almoço, ceia etc.).
export type PeriodoAntigo =
  | "jejum"
  | "manha"
  | "meio_manha"
  | "almoco"
  | "tarde"
  | "meio_tarde"
  | "noite"
  | "final_noite"
  | "ceia";

// Item recebido do Cockpit (mesmo formato do motor simples, sem depender dele).
// Campos ricos (Opção A) são OPCIONAIS: quando vierem, fluem até o template; quando
// não vierem, o merge (abaixo) preserva o que já foi enriquecido à mão na tela.
export interface ItemLembretePrescricao {
  tipo: "formula" | "injetavel" | "exame";
  nome: string;
  detalhe?: string;
  periodos?: PeriodoAntigo[];
  ativoPrincipal?: string;
  dose?: string;
  horario?: string;
  observacaoRefeicao?: string;
  posologia?: string;
}

// Mapa período antigo → canônico do IHE (sigla, nome, janela_inicio HH:MM).
export const MAPA_PERIODO: Record<PeriodoAntigo, { sigla: string; nome: string; inicio: string }> = {
  jejum: { sigla: "JE", nome: "Jejum", inicio: "05:00" },
  manha: { sigla: "IM", nome: "Início da Manhã", inicio: "07:00" },
  meio_manha: { sigla: "MM", nome: "Meio da Manhã", inicio: "09:00" },
  almoco: { sigla: "AL", nome: "Almoço", inicio: "11:00" },
  tarde: { sigla: "IT", nome: "Início da Tarde", inicio: "13:30" },
  meio_tarde: { sigla: "MT", nome: "Meio da Tarde", inicio: "16:00" },
  noite: { sigla: "NO", nome: "Noite", inicio: "18:00" },
  final_noite: { sigla: "FN", nome: "Final da Noite", inicio: "20:00" },
  ceia: { sigla: "CE", nome: "Ceia", inicio: "22:30" },
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
  // Lê o lembrete existente ANTES do upsert para: (1) preservar campos ricos
  // enriquecidos à mão na tela (merge por `${sigla}::${nome}`); (2) respeitar o
  // override manual (ativoManual) ao computar o `ativo` efetivo.
  const [existente] = await db
    .select({
      periodos: lembretesPrescricaoTable.periodos,
      ativoManual: lembretesPrescricaoTable.ativoManual,
    })
    .from(lembretesPrescricaoTable)
    .where(eq(lembretesPrescricaoTable.clienteId, clienteId))
    .limit(1);

  // Índice das fórmulas antigas por chave para o merge não-destrutivo.
  const antigasPorChave = new Map<string, LembreteFormulaJson>();
  if (existente?.periodos) {
    for (const per of existente.periodos) {
      for (const f of per.formulas) {
        antigasPorChave.set(`${per.sigla ?? ""}::${f.nome}`, f);
      }
    }
  }

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
      // Merge: campo rico novo vence; na ausência, preserva o que já estava salvo.
      // EXCEÇÃO (ordem do CEO, 09/07/2026): posologia DITADA à mão na tela
      // (posologiaManual=true) SOBREVIVE à re-sincronização — vence a sugestão
      // automática do catálogo.
      const anterior = antigasPorChave.get(`${canon.sigla}::${item.nome}`);
      const posologiaManual = anterior?.posologiaManual === true && !!anterior.posologia;
      bloco.formulas.push({
        nome: item.nome,
        ativoPrincipal: item.ativoPrincipal ?? anterior?.ativoPrincipal,
        dose: item.dose ?? anterior?.dose,
        horario: item.horario ?? anterior?.horario,
        observacaoRefeicao: item.observacaoRefeicao ?? anterior?.observacaoRefeicao,
        posologia: posologiaManual
          ? anterior?.posologia
          : item.posologia ?? item.detalhe ?? anterior?.posologia,
        ...(posologiaManual ? { posologiaManual: true } : {}),
      });
      formulas += 1;
    }
  }

  const horarios = [...horariosSet].sort();
  const periodos = [...porSigla.values()];
  const temItens = periodos.length > 0;
  // Content changes never authorize a new schedule or revoke a still-valid one.
  // Evaluate current consent and current manual state atomically on the conflict
  // row: a concurrent manual deactivation must never be overwritten by this sync.
  const manterAtivo = temItens ? sql<boolean>`${lembretesPrescricaoTable.ativo}
    AND ${lembretesPrescricaoTable.ativoManual} IS DISTINCT FROM FALSE
    AND EXISTS (SELECT 1 FROM ${clientsTable}
      WHERE ${clientsTable.id} = ${clienteId} AND ${reminderConsentFilter()})` : false;

  // Upsert atômico por cliente (unique em cliente_id): sem corrida de 2 lembretes.
  // ativoManual NÃO é tocado aqui (preserva a decisão manual do CEO).
  const [linha] = await db
    .insert(lembretesPrescricaoTable)
    .values({ clienteId, periodos, horariosEnvio: horarios, ativo: false })
    .onConflictDoUpdate({
      target: lembretesPrescricaoTable.clienteId,
      set: { periodos, horariosEnvio: horarios, ativo: manterAtivo, updatedAt: new Date() },
    })
    .returning({ id: lembretesPrescricaoTable.id, ativo: lembretesPrescricaoTable.ativo });
  return { lembreteId: linha.id, periodos: periodos.length, horarios, formulas, ativo: linha.ativo };
}

export async function executarLembretesPeriodo(
  options: ExecutarLembretesOptions = {},
): Promise<ExecutarLembretesResult> {
  const now = options.now ?? new Date();
  const tolerancia = options.toleranciaMinutos ?? 5;
  const concorrencia = options.concorrencia ?? 10;
  if (!Number.isSafeInteger(concorrencia) || concorrencia < 1) {
    throw new RangeError("concorrencia deve ser um inteiro positivo");
  }

  if (options.clienteId !== undefined && (!Number.isSafeInteger(options.clienteId) || options.clienteId < 1)) {
    throw new RangeError("clienteId deve ser um inteiro positivo");
  }
  const somenteTelegram = options.somenteTelegram ?? options.clienteId !== undefined;
  const lembretes = await carregarLembretesAtivos(options.clienteId);
  const detalhes: LembreteEnvioResult[] = [];
  let enviados = 0;
  let falhas = 0;
  let pulados = 0;

  const local = partsParaTimezone(now, TIMEZONE);
  // Lido uma vez por tick. Padrão "desligado": nada muda para quem não foi liberado.
  const cfgTelegram = await lerConfigLembreteTelegram();

  async function processarLembrete(ctx: LembreteComContexto): Promise<void> {
    if (ctx.horariosEnvio.length === 0) {
      pulados += 1;
      return;
    }

    const horarioMatch = horarioDentroDaJanela(ctx.horariosEnvio, local.horaMin, tolerancia);
    if (!horarioMatch) {
      pulados += 1;
      return;
    }

    const janela = janelaKey(local.data, horarioMatch);

    // Modo restrito ao Telegram: sem Telegram liberado e vinculado não há envio por outro
    // canal e nenhum marcador é gravado (não consome a janela do envio real).
    if (somenteTelegram && !usaTelegram(cfgTelegram, ctx.clienteId, ctx.telegramChatId)) {
      pulados += 1;
      detalhes.push({ lembreteId: ctx.id, clienteId: ctx.clienteId, janela, sucesso: false, erro: "telegram_indisponivel_no_teste" });
      return;
    }

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
      return;
    }
    const envioId = claim.id;

    const viaTelegram = usaTelegram(cfgTelegram, ctx.clienteId, ctx.telegramChatId);

    // Sem telefone (e sem Telegram liberado): não há como enviar. Marca FALHOU e segue (visível na tela).
    if (!viaTelegram && (!ctx.clienteTelefone || !ctx.clienteTelefone.trim())) {
      falhas += 1;
      const erro = "cliente sem telefone";
      await db.update(lembreteEnviosTable).set({ status: "FALHOU", erro }).where(eq(lembreteEnviosTable.id, envioId));
      detalhes.push({ lembreteId: ctx.id, clienteId: ctx.clienteId, janela, sucesso: false, erro });
      return;
    }

    // Só os períodos desta janela entram na mensagem (abertura e doses da própria janela).
    const doDia = periodosDaJanela(ctx.periodos, horarioMatch);
    if (!doDia.casou && ctx.periodos.length > 0) {
      logger.warn(
        { lembreteId: ctx.id, clienteId: ctx.clienteId, janela },
        "[lembrete-periodo] nenhum período casa com o horário; usando todos os períodos (dado antigo ou horário manual)",
      );
    }
    const periodosJanela = doDia.periodos;

    // Gênero não existe hoje em `clients` → tratamento cai no primeiro nome.
    const genero: Genero = "nao_informado";
    // Mensagem RICA (Mensageria PAXMED). Falha-segura: qualquer erro OU catálogo
    // vazio cai no template simples — o envio NUNCA quebra por causa da riqueza.
    let mensagem: string;
    try {
      const primeiroNome = (ctx.clienteNome || "").trim().split(/\s+/)[0] || ctx.clienteNome;
      const rica = await montarMensagemPaxmed({
        nome: primeiroNome,
        agora: now,
        periodos: periodosJanela,
      });
      mensagem = rica ?? templateLembretePrescricao({
        clienteNome: ctx.clienteNome,
        clienteGenero: genero,
        agora: now,
        saudacao: montarSaudacao(ctx.clienteNome, genero, now),
        periodos: periodosJanela,
      });
    } catch (err) {
      logger.warn(
        { lembreteId: ctx.id, clienteId: ctx.clienteId, erro: err instanceof Error ? err.message : String(err) },
        "[lembrete-periodo] montagem PAXMED falhou; usando template simples",
      );
      mensagem = templateLembretePrescricao({
        clienteNome: ctx.clienteNome,
        clienteGenero: genero,
        agora: now,
        saudacao: montarSaudacao(ctx.clienteNome, genero, now),
        periodos: periodosJanela,
      });
    }

    if (viaTelegram && ctx.telegramChatId) {
      const r = await enviarLembreteTelegram(ctx.telegramChatId, mensagem);
      if (r.kind === "enviado") {
        enviados += 1;
        const logId = await registrarLogMensagem({
          telefone: ctx.clienteTelefone ?? "telegram",
          corpo: mensagem,
          status: "sent",
          contexto: "lembrete_prescricao",
          clienteId: ctx.clienteId,
          via: "telegram",
        });
        await db
          .update(lembreteEnviosTable)
          .set({ status: "ENVIADO", whatsappLogId: logId ?? null, erro: null, enviadoEm: new Date() })
          .where(eq(lembreteEnviosTable.id, envioId));
        detalhes.push({ lembreteId: ctx.id, clienteId: ctx.clienteId, janela, sucesso: true, whatsappLogId: logId });
      } else {
        falhas += 1;
        await db
          .update(lembreteEnviosTable)
          .set({ status: "FALHOU", erro: r.erro })
          .where(eq(lembreteEnviosTable.id, envioId));
        logger.warn({ lembreteId: ctx.id, clienteId: ctx.clienteId, janela, erro: r.erro }, "[lembrete-periodo] falha no envio pelo Telegram");
        detalhes.push({ lembreteId: ctx.id, clienteId: ctx.clienteId, janela, sucesso: false, erro: r.erro });
      }
      return;
    }

    const telefone = ctx.clienteTelefone;
    if (!telefone || !telefone.trim()) {
      // Telegram liberado mas sem chat válido e sem telefone: nada a enviar.
      falhas += 1;
      const erro = "cliente sem telefone";
      await db.update(lembreteEnviosTable).set({ status: "FALHOU", erro }).where(eq(lembreteEnviosTable.id, envioId));
      detalhes.push({ lembreteId: ctx.id, clienteId: ctx.clienteId, janela, sucesso: false, erro });
      return;
    }
    let resultado: Awaited<ReturnType<typeof sendWhatsapp>>;
    try {
      resultado = await sendWhatsapp(telefone, mensagem, {
        contexto: "lembrete_prescricao",
        clienteId: ctx.clienteId,
        mirrorTelegram: false,
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

      // A text authorization does not authorize an extra voice message.
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

  // Cada lote espera inclusive as rejeições: nenhuma chamada fica solta nem
  // uma falha inesperada impede os próximos clientes de serem processados.
  const erros: unknown[] = [];
  for (let inicio = 0; inicio < lembretes.length; inicio += concorrencia) {
    const lote = lembretes.slice(inicio, inicio + concorrencia);
    const resultados = await Promise.allSettled(lote.map(processarLembrete));
    resultados.forEach((resultado, indice) => {
      if (resultado.status === "rejected") {
        erros.push(resultado.reason);
        logger.error(
          { err: resultado.reason, lembreteId: lote[indice].id, clienteId: lote[indice].clienteId },
          "[lembrete-periodo] erro ao processar cliente",
        );
      }
    });
  }
  if (erros.length > 0) {
    throw new AggregateError(erros, "Falha ao processar lembretes");
  }

  return { examinados: lembretes.length, enviados, falhas, pulados, detalhes };
}
