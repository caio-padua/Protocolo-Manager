import { createHash } from "node:crypto";
import { sql, type SQL } from "drizzle-orm";
import { db } from "@workspace/db";
import type { EntradaAtendimento, PlanoAtendimento } from "./atendimento-telegram";
import { getIssuedDocument, criarTokenClinicalShare } from "./clinical-document-share";
import { absoluteBaseUrl } from "./messaging/base-url";
import { escaparHtmlTelegram } from "./orientacao-texto";
import { sendTelegram } from "./telegram";
import { vinculoTelegramAtualUnico } from "./telegram-vinculo-atual";

interface ExecutorReenvio {
  execute(query: SQL): Promise<{ rows: unknown[] }>;
}

interface ReceitaVerificada {
  pdfSha256: string;
  profissionalId: number;
  titulo: string;
}

async function verificarReceita(
  exec: ExecutorReenvio,
  e: EntradaAtendimento,
  recipeId: number,
  prescriptionId: number,
): Promise<ReceitaVerificada | null> {
  if (!await vinculoTelegramAtualUnico(exec, { clienteId: e.clienteId, empresaId: e.empresaId, chatId: e.chatId })) return null;
  const client = await exec.execute(sql`SELECT id FROM clients
    WHERE id=${e.clienteId} AND empresa_id=${e.empresaId} AND telegram_chat_id=${e.chatId}
      AND status='active' AND deleted_at IS NULL LIMIT 1`);
  if (client.rows.length !== 1) return null;

  const latest = await exec.execute(sql`SELECT id FROM prescriptions
    WHERE client_id=${e.clienteId} AND empresa_id=${e.empresaId} AND status='emitted' AND emitted_at IS NOT NULL
    ORDER BY emitted_at DESC,id DESC LIMIT 1`);
  if (Number((latest.rows[0] as { id?: number | string } | undefined)?.id) !== prescriptionId) return null;

  const recipeRows = await exec.execute(sql`SELECT id,pdf_data FROM recipes WHERE prescription_id=${prescriptionId} ORDER BY id`);
  if (recipeRows.rows.length !== 1) return null;
  const row = recipeRows.rows[0] as { id: number | string; pdf_data?: string | null };
  if (Number(row.id) !== recipeId || !row.pdf_data?.trim()) return null;

  const document = await getIssuedDocument("prescricao", recipeId);
  if (!document || document.status !== "emitted" || document.clientId !== e.clienteId ||
      document.empresaId !== e.empresaId || document.prescriptionId !== prescriptionId ||
      typeof document.professionalId !== "number" || !Number.isSafeInteger(document.professionalId) || !document.professionalId ||
      !document.pdfData || document.pdfData !== row.pdf_data) return null;
  const bytes = Buffer.from(document.pdfData, "base64");
  if (bytes.length === 0 || bytes.subarray(0, 5).toString("ascii") !== "%PDF-") return null;
  return {
    pdfSha256: createHash("sha256").update(bytes).digest("hex"),
    profissionalId: document.professionalId,
    titulo: document.label,
  };
}

export async function autorizarOfertaReenvio(
  exec: ExecutorReenvio,
  e: EntradaAtendimento,
  plano: PlanoAtendimento,
): Promise<boolean> {
  const documento = plano.documento;
  if (documento?.acao !== "ofertar_reenvio" || !documento.receitaId || !documento.prescricaoId) return false;
  const receita = await verificarReceita(exec, e, documento.receitaId, documento.prescricaoId);
  if (!receita) return false;
  await exec.execute(sql`UPDATE telegram_documento_reenvios SET status='falhou',atualizado_em=NOW()
    WHERE empresa_id=${e.empresaId} AND cliente_id=${e.clienteId}
      AND status='ofertando' AND atualizado_em<=NOW()-interval '24 hours'`);
  await exec.execute(sql`UPDATE telegram_documento_reenvios SET status='expirado',atualizado_em=NOW()
    WHERE empresa_id=${e.empresaId} AND cliente_id=${e.clienteId} AND status='oferecido' AND expira_em<=NOW()`);
  const r = await exec.execute(sql`INSERT INTO telegram_documento_reenvios
      (empresa_id,cliente_id,chat_id,recipe_id,prescription_id,pdf_sha256,oferta_inbox_message_id,status,expira_em)
    SELECT ${e.empresaId},${e.clienteId},${e.chatId},${documento.receitaId},${documento.prescricaoId},
      ${receita.pdfSha256},${e.inboxMessageId},'ofertando',NOW()+interval '24 hours'
    WHERE NOT EXISTS (
      SELECT 1 FROM telegram_documento_reenvios ativo
      WHERE ativo.empresa_id=${e.empresaId} AND ativo.cliente_id=${e.clienteId}
        AND ativo.status IN ('ofertando','oferecido','enviando')
        AND ativo.oferta_inbox_message_id<>${e.inboxMessageId}
    )
    ON CONFLICT (oferta_inbox_message_id) DO UPDATE SET atualizado_em=NOW()
    WHERE telegram_documento_reenvios.status='ofertando'
      AND telegram_documento_reenvios.empresa_id=${e.empresaId}
      AND telegram_documento_reenvios.cliente_id=${e.clienteId}
      AND telegram_documento_reenvios.chat_id=${e.chatId}
      AND telegram_documento_reenvios.recipe_id=${documento.receitaId}
      AND telegram_documento_reenvios.pdf_sha256=${receita.pdfSha256}
    RETURNING id`);
  return r.rows.length === 1;
}

export async function autorizarConfirmacaoReenvio(
  exec: ExecutorReenvio,
  e: EntradaAtendimento,
  plano: PlanoAtendimento,
): Promise<boolean> {
  const documento = plano.documento;
  if (documento?.acao !== "confirmar_reenvio" || !documento.ofertaId ||
      !documento.receitaId || !documento.prescricaoId) return false;
  const receita = await verificarReceita(exec, e, documento.receitaId, documento.prescricaoId);
  if (!receita) return false;
  const r = await exec.execute(sql`UPDATE telegram_documento_reenvios
    SET status='enviando',confirmacao_inbox_message_id=${e.inboxMessageId},atualizado_em=NOW()
    WHERE id=${documento.ofertaId} AND empresa_id=${e.empresaId} AND cliente_id=${e.clienteId}
      AND chat_id=${e.chatId} AND recipe_id=${documento.receitaId}
      AND prescription_id=${documento.prescricaoId} AND pdf_sha256=${receita.pdfSha256}
      AND expira_em>NOW()
      AND (status='oferecido' OR (status='enviando' AND confirmacao_inbox_message_id=${e.inboxMessageId}))
    RETURNING id`);
  return r.rows.length === 1;
}

export async function autorizarCancelamentoReenvio(
  exec: ExecutorReenvio,
  e: EntradaAtendimento,
  plano: PlanoAtendimento,
): Promise<boolean> {
  const documento = plano.documento;
  if (documento?.acao !== "cancelar_reenvio" || !documento.ofertaId) return false;
  const r = await exec.execute(sql`UPDATE telegram_documento_reenvios
    SET status='cancelado',confirmacao_inbox_message_id=${e.inboxMessageId},atualizado_em=NOW()
    WHERE id=${documento.ofertaId} AND empresa_id=${e.empresaId} AND cliente_id=${e.clienteId}
      AND chat_id=${e.chatId} AND status='oferecido' AND expira_em>NOW()
    RETURNING id`);
  return r.rows.length === 1;
}

export async function marcarOfertaReenvioEntregue(e: EntradaAtendimento): Promise<void> {
  await db.execute(sql`UPDATE telegram_documento_reenvios SET status='oferecido',
      expira_em=NOW()+interval '24 hours',atualizado_em=NOW()
    WHERE oferta_inbox_message_id=${e.inboxMessageId} AND empresa_id=${e.empresaId}
      AND cliente_id=${e.clienteId} AND chat_id=${e.chatId} AND status='ofertando'`);
}

export async function marcarReenvioConcluido(e: EntradaAtendimento, plano: PlanoAtendimento): Promise<void> {
  const documento = plano.documento;
  if (documento?.acao !== "confirmar_reenvio" || !documento.ofertaId) return;
  await db.execute(sql`UPDATE telegram_documento_reenvios SET status='enviado',atualizado_em=NOW()
    WHERE id=${documento.ofertaId} AND empresa_id=${e.empresaId} AND cliente_id=${e.clienteId}
      AND chat_id=${e.chatId} AND confirmacao_inbox_message_id=${e.inboxMessageId}
      AND status='enviando'`);
}

export async function enviarLinkReceitaConfirmada(
  chat: string,
  e: EntradaAtendimento,
  plano: PlanoAtendimento,
  dono: string,
): Promise<{ sent: boolean; mock: boolean; error?: string; textoHistorico?: string }> {
  const documento = plano.documento;
  if (documento?.acao !== "confirmar_reenvio" || !documento.ofertaId ||
      !documento.receitaId || !documento.prescricaoId || chat !== e.chatId) {
    return { sent: false, mock: false, error: "reenvio_nao_autorizado" };
  }
  const oferta = await db.execute(sql`SELECT id,pdf_sha256 FROM telegram_documento_reenvios
    WHERE id=${documento.ofertaId} AND empresa_id=${e.empresaId} AND cliente_id=${e.clienteId}
      AND chat_id=${e.chatId} AND recipe_id=${documento.receitaId} AND prescription_id=${documento.prescricaoId}
      AND status='enviando' AND confirmacao_inbox_message_id=${e.inboxMessageId} LIMIT 1`);
  const atual = oferta.rows[0] as { id: number | string; pdf_sha256: string } | undefined;
  if (!atual) return { sent: false, mock: false, error: "oferta_de_reenvio_indisponivel" };
  const receita = await verificarReceita(db, e, documento.receitaId, documento.prescricaoId);
  if (!receita || receita.pdfSha256 !== atual.pdf_sha256) {
    return { sent: false, mock: false, error: "receita_alterada_ou_indisponivel" };
  }

  let baseUrl: URL;
  try {
    baseUrl = new URL(absoluteBaseUrl());
  } catch {
    return { sent: false, mock: false, error: "dominio_seguro_indisponivel" };
  }
  if (baseUrl.protocol !== "https:") return { sent: false, mock: false, error: "dominio_seguro_indisponivel" };

  const share = criarTokenClinicalShare();
  const saved = await db.execute(sql`UPDATE telegram_atendimento_respostas
    SET document_share_token_hash=${share.tokenHash},document_share_type='prescricao',
      document_share_id=${documento.receitaId},document_share_professional_id=${receita.profissionalId},
      document_share_pdf_sha256=${receita.pdfSha256},document_share_expires_at=${new Date(share.expiresAt)}
    WHERE inbox_message_id=${e.inboxMessageId} AND dono=${dono} AND estado='processando'
      AND etapas->'resposta'->>'estado'='enviando' RETURNING inbox_message_id`);
  if (!saved.rows.length) return { sent: false, mock: false, error: "registro_de_envio_indisponivel" };

  const url = `${baseUrl.origin}/api/clinical-documents/share/${share.token}`;
  const message = `Segue o link seguro para acessar a segunda via de ${escaparHtmlTelegram(receita.titulo)}. ` +
    `Ele fica válido por sete dias: <a href="${escaparHtmlTelegram(url)}">Abrir receita</a>.`;
  const result = await sendTelegram(chat, message, { disableWebPagePreview: true });
  return {
    ...result,
    textoHistorico: "Link seguro da segunda via enviado; validade de sete dias.",
  };
}

