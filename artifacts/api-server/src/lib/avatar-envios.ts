/**
 * avatar-envios.ts — Registra histórico de envios VOICE e VIDEO na tabela
 * avatar_envios. Operação best-effort: nunca lança exceção.
 */
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";

export interface RegistrarEnvioParams {
  empresaId:    number;
  avatarId?:    number;
  clienteId?:   number;
  canal:        "VOICE" | "VIDEO";
  canalEntrega: "WHATSAPP" | "TELEGRAM" | "EMAIL";
  textoEnviado?: string;
  status:       "ok" | "erro" | "pulado";
  erro?:        string;
  contexto?:    string;
}

export async function registrarEnvioAvatar(params: RegistrarEnvioParams): Promise<void> {
  try {
    await db.execute(sql`
      INSERT INTO avatar_envios
        (empresa_id, avatar_id, cliente_id, canal, canal_entrega,
         texto_enviado, status, erro, contexto)
      VALUES (
        ${params.empresaId},
        ${params.avatarId ?? null},
        ${params.clienteId ?? null},
        ${params.canal},
        ${params.canalEntrega},
        ${params.textoEnviado ?? null},
        ${params.status},
        ${params.erro ?? null},
        ${params.contexto ?? null}
      )
    `);
  } catch (e: any) {
    logger.warn({ err: e?.message }, "[avatar-envios] falha ao registrar envio");
  }
}

export interface HistoricoEnvio {
  id:            number;
  empresaId:     number;
  avatarId:      number | null;
  clienteId:     number | null;
  canal:         string;
  canalEntrega:  string;
  textoEnviado:  string | null;
  status:        string;
  erro:          string | null;
  contexto:      string | null;
  dataEnvio:     string;
  horaEnvio:     string;
  createdAt:     string;
}

export async function buscarHistoricoAvatar(
  avatarId: number,
  limite = 50,
): Promise<HistoricoEnvio[]> {
  const rows = await db.execute(sql`
    SELECT id, empresa_id, avatar_id, cliente_id, canal, canal_entrega,
           texto_enviado, status, erro, contexto,
           data_envio::text, hora_envio::text, created_at
    FROM avatar_envios
    WHERE avatar_id = ${avatarId}
    ORDER BY created_at DESC
    LIMIT ${limite}
  `);
  return (rows.rows as any[]).map(r => ({
    id:           Number(r.id),
    empresaId:    Number(r.empresa_id),
    avatarId:     r.avatar_id ? Number(r.avatar_id) : null,
    clienteId:    r.cliente_id ? Number(r.cliente_id) : null,
    canal:        String(r.canal ?? ""),
    canalEntrega: String(r.canal_entrega ?? ""),
    textoEnviado: r.texto_enviado ?? null,
    status:       String(r.status ?? "ok"),
    erro:         r.erro ?? null,
    contexto:     r.contexto ?? null,
    dataEnvio:    String(r.data_envio ?? ""),
    horaEnvio:    String(r.hora_envio ?? "").slice(0, 5),
    createdAt:    r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at ?? ""),
  }));
}
