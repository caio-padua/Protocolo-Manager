/**
 * IA leve do WhatsApp: SÓ classifica a intenção (palavra de uma lista fechada).
 * Nunca escreve texto ao cliente. Perguntas inéditas não clínicas são apenas
 * REGISTRADAS para curadoria (estado "pendente"); nenhuma resposta nasce delas.
 */
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { requireAiTenant } from "./ai-central";
import { getModeloAtendimento } from "./atendimento-ia-config";
import { registrarCustoProvedor } from "./mensageria-credito";
import { textoSeguroParaInterpretar } from "./telegram-interprete";
import { normalizarPerguntaAprendida, perguntaNaoClinicaSegura } from "./telegram-aprendiz";
import { ramificacaoDaIntencao } from "./atendimento-taxonomia";
import { logger } from "./logger";

export const INTENCOES_IA = ["agendar", "retorno", "orcamento", "documentos", "exames", "humano", "menu", "outra"] as const;
export type IntencaoIA = typeof INTENCOES_IA[number];

/** Devolve uma intenção da lista fechada, ou null (sem modelo, texto sensível, falha ou resposta fora da lista). */
export async function classificarIntencaoComIA(texto: string, empresaId: number, chaveMensagem: string): Promise<IntencaoIA | null> {
  const seguro = textoSeguroParaInterpretar(texto);
  if (!seguro) return null;
  const modelo = await getModeloAtendimento(empresaId, "selecao");
  if (!modelo) return null;
  const guard = requireAiTenant(empresaId, "agent");
  const chave = `whatsapp:${chaveMensagem}:intencao`;
  const prompt = `Classifique a intenção da mensagem de um cliente de clínica. Responda com UMA palavra da lista, sem mais nada: ${INTENCOES_IA.join(", ")}.
Use "outra" se não for claro ou se envolver sintomas, dose, diagnóstico ou troca de remédio.
Mensagem: """${seguro}"""`;
  try {
    const msg = await anthropic.messages.create(
      { model: modelo, max_tokens: 10, messages: [{ role: "user", content: prompt }] },
      Object.keys(guard.headers).length ? { headers: guard.headers } : undefined,
    );
    await registrarCustoProvedor({
      empresaId, chave, etapa: "whatsapp_intencao", provedor: "anthropic", modelo,
      inputTokens: msg.usage?.input_tokens ?? null, outputTokens: msg.usage?.output_tokens ?? null,
    });
    const bruto = msg.content[0]?.type === "text" ? msg.content[0].text.trim().toLowerCase() : "";
    return (INTENCOES_IA as readonly string[]).includes(bruto) ? (bruto as IntencaoIA) : null;
  } catch (error) {
    await registrarCustoProvedor({ empresaId, chave, etapa: "whatsapp_intencao", provedor: "anthropic", modelo }).catch(() => undefined);
    logger.warn({ empresaId, errorType: error instanceof Error ? error.constructor.name : typeof error }, "[whatsapp] classificação por IA indisponível; segue por regras");
    return null;
  }
}

/** Registra a pergunta inédita (idempotente por clínica + texto normalizado). Retorna true se gravou/atualizou. */
export async function registrarPerguntaInedita(p: {
  empresaId: number; canal: "whatsapp" | "telegram"; texto: string; intencao: string | null; origemIntencao: "regra" | "ia";
}): Promise<boolean> {
  if (!perguntaNaoClinicaSegura(p.texto)) return false;
  const norm = normalizarPerguntaAprendida(p.texto);
  const r = ramificacaoDaIntencao(p.intencao);
  const res = await db.execute(sql`
    INSERT INTO atendimento_perguntas_ineditas
      (empresa_id, canal, pergunta, pergunta_normalizada, tronco, ramo, intencao, origem_intencao)
    VALUES (${p.empresaId}, ${p.canal}, ${p.texto.trim()}, ${norm}, ${r.tronco}, ${r.ramo}, ${p.intencao}, ${p.origemIntencao})
    ON CONFLICT (empresa_id, pergunta_normalizada) DO UPDATE
      SET ocorrencias = atendimento_perguntas_ineditas.ocorrencias + 1, ultima_em = NOW()
      WHERE atendimento_perguntas_ineditas.estado = 'pendente'
    RETURNING id`);
  return res.rows.length > 0;
}

export async function listarPerguntasIneditas(empresaId: number) {
  const r = await db.execute(sql`
    SELECT id, canal, pergunta, tronco, ramo, intencao, origem_intencao AS "origemIntencao",
      ocorrencias, estado, primeira_em AS "primeiraEm", ultima_em AS "ultimaEm"
    FROM atendimento_perguntas_ineditas WHERE empresa_id = ${empresaId}
    ORDER BY estado, tronco, ramo, ocorrencias DESC, id DESC LIMIT 500`);
  return r.rows;
}

export async function alterarPerguntaInedita(p: { empresaId: number; id: number; estado?: "pendente" | "curada" | "descartada"; tronco?: string; ramo?: string }): Promise<boolean> {
  const r = await db.execute(sql`
    UPDATE atendimento_perguntas_ineditas
    SET estado = COALESCE(${p.estado ?? null}, estado), tronco = COALESCE(${p.tronco ?? null}, tronco), ramo = COALESCE(${p.ramo ?? null}, ramo)
    WHERE id = ${p.id} AND empresa_id = ${p.empresaId} RETURNING id`);
  return r.rows.length > 0;
}
