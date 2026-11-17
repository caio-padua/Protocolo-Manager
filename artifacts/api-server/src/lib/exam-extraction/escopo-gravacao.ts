/**
 * Escopo de gravação de resultados de exame: a clínica do resultado nasce do DOCUMENTO validado
 * (que foi criado com a clínica da sessão), conferida contra o cliente e, quando existir, contra a
 * clínica da sessão. Falha fechada com código e status HTTP; nunca preenche registro antigo nem
 * reatribui documento sem clínica (nesse caso o resultado fica sem clínica, como o documento).
 */
import { clientsTable, examDocumentsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export class ExamWriteScopeError extends Error {
  constructor(public readonly code: string, public readonly status: 403 | 404) {
    super(code);
    this.name = "ExamWriteScopeError";
  }
}

export interface EscopoGravacao { empresaId: number | null; documentoSemClinica: boolean }

/** `executor` é a transação em curso: as linhas do documento e do cliente ficam travadas até o fim. */
export async function validarEscopoGravacao(
  executor: any,
  p: { documentId: number; clientId: number; tenantId?: number | null },
): Promise<EscopoGravacao> {
  const [doc] = await executor
    .select({ id: examDocumentsTable.id, clientId: examDocumentsTable.clientId, empresaId: examDocumentsTable.empresaId })
    .from(examDocumentsTable).where(eq(examDocumentsTable.id, p.documentId)).limit(1).for("share");
  if (!doc) throw new ExamWriteScopeError("documento_inexistente", 404);
  if (doc.clientId !== p.clientId) throw new ExamWriteScopeError("cliente_diverge_do_documento", 403);
  const [cli] = await executor
    .select({ id: clientsTable.id, empresaId: clientsTable.empresaId })
    .from(clientsTable).where(eq(clientsTable.id, p.clientId)).limit(1).for("share");
  if (!cli) throw new ExamWriteScopeError("cliente_inexistente", 404);
  if (doc.empresaId != null && cli.empresaId != null && doc.empresaId !== cli.empresaId) {
    throw new ExamWriteScopeError("clinica_do_documento_diverge_do_cliente", 403);
  }
  if (p.tenantId != null && doc.empresaId != null && p.tenantId !== doc.empresaId) {
    throw new ExamWriteScopeError("clinica_da_sessao_diverge_do_documento", 403);
  }
  return { empresaId: doc.empresaId ?? null, documentoSemClinica: doc.empresaId == null };
}
