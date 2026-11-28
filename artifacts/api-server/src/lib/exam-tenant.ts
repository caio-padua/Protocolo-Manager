/**
 * Isolamento por clínica nas rotas de exames.
 * A empresa vem SEMPRE da sessão (tenantContext validado pelo servidor) ou do token do cliente,
 * nunca de número enviado pelo navegador. Ausência de vínculo = recusa (nunca "empresa 5").
 */
import type { Request, Response } from "express";
import { and, eq } from "drizzle-orm";
import { db, clientsTable, examDocumentsTable } from "@workspace/db";

/** Empresa da sessão de colaborador, ou null quando a sessão não está autenticada. */
export function sessionEmpresaId(req: Request): number | null {
  const ctx = req.tenantContext;
  if (!ctx?.authenticated) return null;
  return Number.isSafeInteger(ctx.empresaId) && ctx.empresaId > 0 ? ctx.empresaId : null;
}

export interface ClientScope { id: number; empresaId: number; name: string }

/** Cliente que pertence à empresa da sessão; null se não existir ou for de outra clínica. */
export async function clientInSession(req: Request, clientId: number): Promise<ClientScope | null> {
  const empresaId = sessionEmpresaId(req);
  if (!empresaId || !Number.isSafeInteger(clientId) || clientId <= 0) return null;
  const [client] = await db
    .select({ id: clientsTable.id, empresaId: clientsTable.empresaId, name: clientsTable.name })
    .from(clientsTable)
    .where(and(eq(clientsTable.id, clientId), eq(clientsTable.empresaId, empresaId)))
    .limit(1);
  return client && client.empresaId === empresaId ? { id: client.id, empresaId, name: client.name } : null;
}

export interface DocumentScope { id: number; clientId: number; empresaId: number; status: string }

/** Documento cujo cliente pertence à empresa da sessão (e cujo empresa_id, se gravado, coincide). */
export async function documentInSession(req: Request, documentId: number): Promise<DocumentScope | null> {
  const empresaId = sessionEmpresaId(req);
  if (!empresaId || !Number.isSafeInteger(documentId) || documentId <= 0) return null;
  const [row] = await db
    .select({
      id: examDocumentsTable.id,
      clientId: examDocumentsTable.clientId,
      docEmpresaId: examDocumentsTable.empresaId,
      status: examDocumentsTable.status,
      clientEmpresaId: clientsTable.empresaId,
    })
    .from(examDocumentsTable)
    .innerJoin(clientsTable, eq(clientsTable.id, examDocumentsTable.clientId))
    .where(eq(examDocumentsTable.id, documentId))
    .limit(1);
  if (!row || row.clientEmpresaId !== empresaId) return null;
  if (row.docEmpresaId != null && row.docEmpresaId !== empresaId) return null;
  return { id: row.id, clientId: row.clientId, empresaId, status: row.status };
}

/** Responde 404 (sem revelar existência) e devolve null quando o cliente não é da clínica da sessão. */
export async function requireClientInSession(req: Request, res: Response, clientId: number): Promise<ClientScope | null> {
  const scope = await clientInSession(req, clientId);
  if (!scope) {
    res.status(404).json({ error: "Cliente não encontrado nesta clínica." });
    return null;
  }
  return scope;
}

export async function requireDocumentInSession(req: Request, res: Response, documentId: number): Promise<DocumentScope | null> {
  const scope = await documentInSession(req, documentId);
  if (!scope) {
    res.status(404).json({ error: "Documento não encontrado nesta clínica." });
    return null;
  }
  return scope;
}
