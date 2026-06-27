/**
 * Onda 5 — Biblioteca de CLÁUSULAS reutilizáveis (Paxter), NATIVA.
 *
 * Texto pronto que o redator injeta no editor para casos fora do padrão
 * (off-label, comorbidade, risco). O corpo é "achatado" no PDF no envio, então
 * apagar/editar uma cláusula NUNCA afeta documentos já gerados.
 *
 * Sanitização: o HTML é higienizado antes de gravar e antes de injetar, para
 * impedir <script>, handlers on*, javascript: e iframes (anti-XSS).
 */

import { and, desc, eq, sql } from "drizzle-orm";
import { db, assinaturaClausulasTable } from "@workspace/db";

/**
 * Sanitizador conservador de HTML. Remove blocos perigosos inteiros
 * (script/style/iframe/object), atributos de evento (on*), URLs javascript: e
 * a tag <a> some com href perigoso. Mantém formatação básica de texto.
 */
export function sanitizarHtml(html: string): string {
  if (!html) return "";
  let out = html;
  // 1. Remove blocos perigosos com conteúdo.
  out = out.replace(/<\s*(script|style|iframe|object|embed|link|meta)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "");
  // 2. Remove tags órfãs dos mesmos perigosos (sem fechamento).
  out = out.replace(/<\s*(script|style|iframe|object|embed|link|meta)\b[^>]*\/?>/gi, "");
  // 3. Remove atributos de evento inline (onclick, onerror, etc.).
  out = out.replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  // 4. Neutraliza URLs perigosas em href/src.
  out = out.replace(/\s(href|src)\s*=\s*("|')\s*javascript:[^"']*\2/gi, ' $1="#"');
  out = out.replace(/\s(href|src)\s*=\s*("|')\s*data:(?!image\/)[^"']*\2/gi, ' $1="#"');
  return out.trim();
}

export interface UpsertClausulaInput {
  codigo: string;
  titulo?: string;
  corpoHtml: string;
  categoria?: string;
  ativo?: boolean;
}

/** Lista cláusulas ativas; as MAIS USADAS no topo (usoContagem desc). */
export async function listarClausulas(incluirInativas = false) {
  return db
    .select()
    .from(assinaturaClausulasTable)
    .where(incluirInativas ? undefined : eq(assinaturaClausulasTable.ativo, true))
    .orderBy(
      desc(assinaturaClausulasTable.usoContagem),
      desc(assinaturaClausulasTable.atualizadoEm),
    );
}

/** Cria/atualiza por `codigo` (idempotente). Sanitiza o corpo antes de gravar. */
export async function upsertClausula(input: UpsertClausulaInput) {
  const codigo = (input.codigo || "").trim();
  if (!codigo) throw new Error("codigo_ausente: informe o codigo da clausula");
  if (!input.corpoHtml || !input.corpoHtml.trim()) {
    throw new Error("conteudo_ausente: informe o corpo da clausula");
  }
  const values = {
    codigo,
    titulo: (input.titulo || "").trim() || codigo,
    corpoHtml: sanitizarHtml(input.corpoHtml),
    categoria: (input.categoria || "OUTRO").trim().toUpperCase(),
    ativo: input.ativo ?? true,
  };
  const rows = await db
    .insert(assinaturaClausulasTable)
    .values(values)
    .onConflictDoUpdate({
      target: assinaturaClausulasTable.codigo,
      set: {
        titulo: values.titulo,
        corpoHtml: values.corpoHtml,
        categoria: values.categoria,
        ativo: values.ativo,
      },
    })
    .returning();
  return rows[0]!;
}

/** Soft-delete: marca ativo=false (preserva histórico/uso). */
export async function desativarClausula(codigo: string) {
  const c = (codigo || "").trim();
  if (!c) throw new Error("codigo_ausente: informe o codigo da clausula");
  const rows = await db
    .update(assinaturaClausulasTable)
    .set({ ativo: false })
    .where(eq(assinaturaClausulasTable.codigo, c))
    .returning();
  if (!rows[0]) throw new Error(`clausula_nao_encontrada: ${c}`);
  return rows[0];
}

/** Registra um uso (incrementa contador) e devolve o HTML sanitizado p/ injeção. */
export async function registrarUsoClausula(codigo: string): Promise<string> {
  const c = (codigo || "").trim();
  if (!c) throw new Error("codigo_ausente: informe o codigo da clausula");
  const rows = await db
    .update(assinaturaClausulasTable)
    .set({ usoContagem: sql`${assinaturaClausulasTable.usoContagem} + 1` })
    .where(and(eq(assinaturaClausulasTable.codigo, c), eq(assinaturaClausulasTable.ativo, true)))
    .returning({ corpoHtml: assinaturaClausulasTable.corpoHtml });
  const hit = rows[0];
  if (!hit) throw new Error(`clausula_nao_encontrada: ${c}`);
  return sanitizarHtml(hit.corpoHtml);
}
