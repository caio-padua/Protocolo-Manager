import { sql, type SQL } from "drizzle-orm";
import type { EntradaAtendimento, PlanoAtendimento } from "./atendimento-telegram";
import { respostaDocumentoAindaAtual } from "./atendimento-telegram-documentos";

/** Revalida as fontes mutáveis; não altera modo humano nem cria uma saída. */
export async function fonteAtendimentoAindaAutorizada(
  exec: { execute(query: SQL): Promise<{ rows: unknown[] }> },
  e: EntradaAtendimento,
  plano: PlanoAtendimento,
  revalidarDocumento = true,
): Promise<boolean> {
  const modo = await exec.execute(sql`SELECT modo,motivo,alterado_por FROM telegram_atendimento WHERE cliente_id=${e.clienteId}`);
  const atual = modo.rows[0] as { modo: string; motivo: string; alterado_por: number | null } | undefined;
  if (atual?.modo === "humano" &&
    (!plano.pausa || atual.motivo !== plano.pausa || atual.alterado_por !== null)) return false;
  if (plano.orientacaoId) {
    const r = await exec.execute(sql`SELECT id FROM orientacoes_aprovadas WHERE id=${plano.orientacaoId}
      AND empresa_id=${e.empresaId} AND status='aprovada' AND resposta=${plano.resposta}`);
    if (!r.rows.length) return false;
  }
  if (plano.faqId) {
    const r = await exec.execute(sql`SELECT f.id FROM telegram_faq_aprendidas f
      JOIN orientacoes_aprovadas o ON o.id=f.orientacao_id AND o.empresa_id=f.empresa_id
      WHERE f.id=${plano.faqId} AND f.empresa_id=${e.empresaId} AND f.ativa=TRUE AND f.excluida_em IS NULL
        AND f.resposta=${plano.resposta}
        AND (f.resposta_editada=TRUE OR (o.status='aprovada' AND o.resposta=f.resposta_fonte))`);
    if (!r.rows.length) return false;
  }
  return !revalidarDocumento || await respostaDocumentoAindaAtual(exec, e, plano);
}
