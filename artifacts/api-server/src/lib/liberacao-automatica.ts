/**
 * Liberação automática de pedido de exames (opção B autorizada pelo Dr. Caio em 20/11/2026).
 * Com a "validação médica" DESLIGADA, o pedido pago, já com médico destino, espera 5 minutos e é assinado
 * com o certificado desse médico e enviado. Depois, uma IA confere o que foi assinado e só aponta ressalvas:
 * ela nunca assina, nunca bloqueia e nunca altera o documento. Sempre há um humano que confere a lista.
 * Validação LIGADA: nada é liberado sozinho e qualquer contagem pendente é zerada.
 */
import type { Request } from "express";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@workspace/db";
import { logger } from "./logger";
import { getSetting } from "./secure-settings";
import { requireAiTenant } from "./ai-central";
import { assinarEEnviarPedido, itensDoTexto } from "../routes/pedidos-medicos-documento";
import type { Row } from "../routes/pedidos-medicos";

export const CHAVE_VALIDACAO = "pedidoMedico.validacaoAtiva";
export const ESPERA_MINUTOS = 5;
const RETENTATIVA_MINUTOS = 30;
let rodando = false;

export async function validacaoAtiva(): Promise<boolean> {
  return (await getSetting(CHAVE_VALIDACAO)) !== "false";
}

function reqDoSistema(actor: number): Request {
  return { collaborator: { professionalId: actor }, log: logger, get: () => undefined } as unknown as Request;
}

const Parecer = z.object({ situacao: z.enum(["sem_ressalvas", "atencao"]), motivo: z.string().max(400) });

/** Confere o documento assinado contra o que o cliente pediu. Falha da IA vira "sem_ia", nunca "sem ressalvas". */
export async function auditarComIA(pedidoId: number, empresaId: number, pedido: string, itens: string[]): Promise<void> {
  let situacao = "sem_ia";
  let nota = "A IA não conseguiu conferir este documento. Confira a lista manualmente.";
  try {
    const sdk = await import("@anthropic-ai/sdk");
    const apiKey = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY;
    const baseURL = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL;
    if (apiKey && baseURL) {
      const c = new sdk.default({ apiKey, baseURL });
      const { headers } = requireAiTenant(empresaId, "agent");
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 20000);
      try {
        const msg = await c.messages.create({
          model: "claude-sonnet-5-5", max_tokens: 300,
          system: "Você audita um pedido de exames laboratoriais ou de imagem já assinado por um médico. Compare o texto que o cliente escreveu com a lista assinada. Aponte (situacao=atencao) SOMENTE se: houver item que não é exame, pedido de medicamento ou dose, item que o cliente não pediu, item pedido que ficou de fora, ou texto confuso ou perigoso. Caso contrário situacao=sem_ressalvas. Responda somente JSON {\"situacao\":\"sem_ressalvas\"|\"atencao\",\"motivo\":\"frase curta em português\"}.",
          messages: [{ role: "user", content: `Pedido do cliente:\n"""${pedido.slice(0, 2000)}"""\n\nLista assinada:\n${itens.map((i, n) => `${n + 1}. ${i}`).join("\n")}` }],
        }, { headers, signal: ctrl.signal });
        const bloco = msg.content.find((b) => b.type === "text");
        const texto = bloco && "text" in bloco ? bloco.text : "";
        const json = texto.slice(texto.indexOf("{"), texto.lastIndexOf("}") + 1);
        const p = Parecer.parse(JSON.parse(json));
        situacao = p.situacao;
        nota = p.motivo || (p.situacao === "sem_ressalvas" ? "Sem ressalvas." : "Atenção.");
      } finally { clearTimeout(timer); }
    }
  } catch (e) {
    logger.warn({ err: String(e), pedidoId }, "[liberacao-auto] auditoria por IA indisponível");
  }
  await db.execute(sql`UPDATE client_medical_requests SET auditoria_status = ${situacao}, auditoria_nota = ${nota}, auditoria_em = NOW() WHERE id = ${pedidoId}`);
}

export async function rodarLiberacaoAutomatica(): Promise<{ liberados: number; falhas: number }> {
  if (rodando) return { liberados: 0, falhas: 0 };
  rodando = true;
  let liberados = 0, falhas = 0;
  try {
    if (await validacaoAtiva()) {
      await db.execute(sql`UPDATE client_medical_requests SET liberar_em = NULL WHERE liberar_em IS NOT NULL AND status IN ('pago','em_analise')`);
      return { liberados, falhas };
    }
    // Agenda quem ainda não tem hora marcada (médico destino definido; só pedido de exames em "pago").
    await db.execute(sql`
      UPDATE client_medical_requests SET liberar_em = NOW() + (${ESPERA_MINUTOS} * INTERVAL '1 minute')
       WHERE kind = 'pedido_exames' AND status = 'pago' AND assigned_professional_id IS NOT NULL AND liberar_em IS NULL`);
    const vencidos = await db.execute(sql`
      SELECT * FROM client_medical_requests
       WHERE kind = 'pedido_exames' AND status = 'pago' AND assigned_professional_id IS NOT NULL
         AND liberar_em IS NOT NULL AND liberar_em <= NOW() ORDER BY liberar_em ASC LIMIT 20`);
    for (const row of vencidos.rows as unknown as Row[]) {
      const actor = row.assigned_professional_id as number;
      // Rechecagem imediata: o médico pode ter ligado a validação ou aberto o pedido enquanto o lote rodava.
      if (await validacaoAtiva()) break;
      const r = await assinarEEnviarPedido(reqDoSistema(actor), row, actor);
      if (r.ok) {
        liberados += 1;
        await db.execute(sql`UPDATE client_medical_requests SET liberado_auto = TRUE WHERE id = ${row.id}`);
        const itens = itensDoTexto(row.draft_items ?? row.details);
        void auditarComIA(row.id, row.empresa_id, row.details, itens);
      } else {
        falhas += 1;
        logger.warn({ pedidoId: row.id, motivo: r.error }, "[liberacao-auto] não liberou; tenta de novo mais tarde");
        await db.execute(sql`UPDATE client_medical_requests SET liberar_em = NOW() + (${RETENTATIVA_MINUTOS} * INTERVAL '1 minute'),
          auditoria_status = 'falha_liberacao', auditoria_nota = ${r.error} WHERE id = ${row.id} AND status = 'pago'`);
      }
    }
  } catch (e) {
    logger.error({ err: String(e) }, "[liberacao-auto] erro no ciclo");
  } finally { rodando = false; }
  return { liberados, falhas };
}
