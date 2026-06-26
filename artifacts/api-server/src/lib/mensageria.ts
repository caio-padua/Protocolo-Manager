// ============================================================================
// MOTOR DE MENSAGERIA INTELIGENTE — ONDA E do Master Loop Paxter.
//
// Expande o envio de WhatsApp (whatsapp.ts) para AGENDAR lembretes automaticos
// baseados no PERIODO do dia (manha/tarde/noite) e no DIA DA SEMANA. Tres tipos:
//   - formula ..... lembrete de tomar a formula manipulada prescrita
//   - exame ....... alerta para coletar/realizar os exames pedidos
//   - injetavel ... lembrete da janela do proximo injetavel/soro
//
// agendarLembretes() so MONTA e PERSISTE a fila (mensageria_lembrete). O disparo
// real e feito por processarLembretesVencidos(), que um worker/cron chama de
// tempos em tempos (POST /api/mensageria/processar). Nada aqui lanca excecao a
// ponto de quebrar o fluxo de "Finalizar e Emitir Tudo".
// ============================================================================
import { db, mensageriaLembreteTable } from "@workspace/db";
import { and, eq, lte } from "drizzle-orm";
import { sendWhatsapp } from "./whatsapp";
import { logger } from "./logger";

export type PeriodoDia = "manha" | "tarde" | "noite";
export type TipoLembrete = "formula" | "exame" | "injetavel";

// Hora canonica de cada periodo do dia (horario da clinica, BRT UTC-3).
const HORA_PERIODO: Record<PeriodoDia, number> = { manha: 8, tarde: 14, noite: 20 };

export interface ItemLembrete {
  tipo: TipoLembrete;
  nome: string; // nome da formula / exame / injetavel
  periodos?: PeriodoDia[]; // quando lembrar no dia (default conforme o tipo)
  diaSemana?: number | null; // 0=domingo..6=sabado; null = todos os dias
  detalhe?: string; // dose, instrucao etc.
}

// Calcula o proximo horario futuro (em UTC) para um periodo + dia da semana.
// Ancora no fuso da clinica (BRT, UTC-3): hora local do periodo => +3h em UTC.
function proximoEnvio(periodo: PeriodoDia, diaSemana: number | null, base = new Date()): Date {
  const horaLocal = HORA_PERIODO[periodo];
  const horaUtc = horaLocal + 3; // BRT (UTC-3) -> UTC
  const alvo = new Date(base);
  alvo.setUTCHours(horaUtc, 0, 0, 0);
  if (diaSemana == null) {
    // diario: se ja passou hoje, joga para amanha
    if (alvo <= base) alvo.setUTCDate(alvo.getUTCDate() + 1);
    return alvo;
  }
  // semanal: avanca ate cair no dia da semana pedido (em horario local BRT)
  for (let i = 0; i < 8; i++) {
    const localDow = new Date(alvo.getTime() - 3 * 3600 * 1000).getUTCDay();
    if (localDow === diaSemana && alvo > base) return alvo;
    alvo.setUTCDate(alvo.getUTCDate() + 1);
  }
  return alvo;
}

function periodosPadrao(tipo: TipoLembrete): PeriodoDia[] {
  if (tipo === "formula") return ["manha", "noite"]; // tomadas tipicas
  if (tipo === "injetavel") return ["manha"]; // janela da aplicacao
  return ["manha"]; // exame: aviso unico pela manha
}

function montarMensagem(nomeCliente: string, item: ItemLembrete, periodo: PeriodoDia): string {
  const saud = periodo === "manha" ? "Bom dia" : periodo === "tarde" ? "Boa tarde" : "Boa noite";
  const det = item.detalhe ? ` (${item.detalhe})` : "";
  if (item.tipo === "formula")
    return `${saud}, ${nomeCliente}! Lembrete PAXTER: hora da sua formula "${item.nome}"${det}. Cuide-se.`;
  if (item.tipo === "injetavel")
    return `${saud}, ${nomeCliente}! Lembrete PAXTER: janela do seu injetavel "${item.nome}"${det}. Agende/confirme sua aplicacao.`;
  return `${saud}, ${nomeCliente}! Lembrete PAXTER: nao esqueca de realizar o exame "${item.nome}"${det}.`;
}

export interface AgendarResultado {
  agendados: number;
  porTipo: Record<TipoLembrete, number>;
}

// Monta e persiste a fila de lembretes do cliente. Idempotencia leve: limpa os
// lembretes ainda "agendado" do cliente antes de reescrever (nao mexe nos ja
// "enviado"), evitando duplicacao a cada nova emissao.
export async function agendarLembretes(
  clienteId: number,
  nomeCliente: string,
  telefone: string | null,
  itens: ItemLembrete[],
): Promise<AgendarResultado> {
  const porTipo: Record<TipoLembrete, number> = { formula: 0, exame: 0, injetavel: 0 };

  await db
    .delete(mensageriaLembreteTable)
    .where(and(eq(mensageriaLembreteTable.clienteId, clienteId), eq(mensageriaLembreteTable.status, "agendado")));

  const linhas: (typeof mensageriaLembreteTable.$inferInsert)[] = [];
  for (const item of itens) {
    const periodos = item.periodos?.length ? item.periodos : periodosPadrao(item.tipo);
    const dia = item.diaSemana ?? null;
    for (const periodo of periodos) {
      linhas.push({
        clienteId,
        tipo: item.tipo,
        titulo: item.nome,
        mensagem: montarMensagem(nomeCliente, item, periodo),
        periodo,
        diaSemana: dia,
        proximoEnvio: proximoEnvio(periodo, dia),
        status: "agendado",
        telefone: telefone ?? null,
      });
      porTipo[item.tipo] += 1;
    }
  }

  if (linhas.length) await db.insert(mensageriaLembreteTable).values(linhas);
  return { agendados: linhas.length, porTipo };
}

export interface ProcessarResultado {
  vencidos: number;
  enviados: number;
  porLink: number;
  detalhes: { id: number; via: string; sent: boolean }[];
}

// Dispara os lembretes vencidos (proximoEnvio <= agora). Reagenda os diarios e
// semanais para a proxima ocorrencia; os unicos (sem recorrencia) viram "enviado".
export async function processarLembretesVencidos(limite = 50): Promise<ProcessarResultado> {
  const agora = new Date();
  const vencidos = await db
    .select()
    .from(mensageriaLembreteTable)
    .where(and(eq(mensageriaLembreteTable.status, "agendado"), lte(mensageriaLembreteTable.proximoEnvio, agora)))
    .limit(limite);

  const detalhes: { id: number; via: string; sent: boolean }[] = [];
  let enviados = 0;
  let porLink = 0;

  for (const l of vencidos) {
    let via = "link";
    let sent = false;
    try {
      if (l.telefone) {
        const r = await sendWhatsapp(l.telefone, l.mensagem);
        via = r.via;
        sent = r.sent;
      }
    } catch (err: unknown) {
      logger.warn({ err: (err as Error)?.message, id: l.id }, "lembrete falhou no envio");
    }
    if (sent) enviados += 1;
    else porLink += 1;

    // Recorrencia: diario/semanal reagenda; exame (unico) encerra.
    const recorre = l.tipo !== "exame";
    if (recorre) {
      const prox = proximoEnvio(l.periodo as PeriodoDia, l.diaSemana, new Date(agora.getTime() + 60_000));
      await db
        .update(mensageriaLembreteTable)
        .set({ proximoEnvio: prox, via, enviadoEm: agora, updatedAt: new Date() })
        .where(eq(mensageriaLembreteTable.id, l.id));
    } else {
      await db
        .update(mensageriaLembreteTable)
        .set({ status: "enviado", via, enviadoEm: agora, updatedAt: new Date() })
        .where(eq(mensageriaLembreteTable.id, l.id));
    }
    detalhes.push({ id: l.id, via, sent });
  }

  return { vencidos: vencidos.length, enviados, porLink, detalhes };
}
