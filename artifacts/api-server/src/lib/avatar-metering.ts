/**
 * avatar-metering.ts — Registro de uso (metering) para billing e Cloudflare.
 *
 * Toda chamada a ElevenLabs (voz) ou HeyGen (vídeo) grava uma linha em
 * avatar_uso_log. Isso permite:
 *   - Billing pay-per-use (cobrar por caractere ou por segundo de vídeo)
 *   - Controle de quota mensal por clínica
 *   - Relatório de uso no painel do CEO
 *   - Integração futura com Cloudflare Workers AI Gateway Analytics
 *
 * CLOUDFLARE METERING:
 *   O CF AI Gateway já está ativo para Anthropic/Gemini/OpenAI via headers
 *   cf-aig-metadata. Para ElevenLabs/HeyGen (APIs externas não-AI), o metering
 *   é feito localmente nesta tabela. A integração com CF Logpush ou CF Analytics
 *   Engine virá no módulo de billing (Task seguinte).
 */

import { db, avatarUsoLogTable, avatarModulosContratadosTable } from "@workspace/db";
import { eq, and }  from "drizzle-orm";
import { logger }   from "./logger";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface RegistrarUsoParams {
  empresaId:  number;
  avatarId?:  number;
  clienteId?: number;
  provedor:   "elevenlabs" | "heygen";
  tipoUso:    "voz" | "video";
  /** Caracteres enviados ao TTS (ElevenLabs). */
  charsTexto?: number;
  /** Duração estimada em segundos (HeyGen). */
  duracaoSeg?: number;
  contexto?:  "lembrete" | "manual" | "campanha" | "preview";
  status?:    "ok" | "erro";
  erro?:      string;
  /** Cloudflare Ray ID (header cf-ray da resposta da API). */
  cfRayId?:   string;
}

// ─── Registro de uso ──────────────────────────────────────────────────────────

/**
 * Grava uma linha no log de uso de avatar. Best-effort: nunca lança.
 * Chamado após cada geração de voz (ElevenLabs) ou vídeo (HeyGen).
 */
export async function registrarUso(params: RegistrarUsoParams): Promise<void> {
  try {
    // Data e hora separadas para billing pay-per-use (GROUP BY data_uso, hora_uso)
    const agora    = new Date();
    const dataUso  = agora.toISOString().slice(0, 10);                  // "YYYY-MM-DD"
    const horaUso  = agora.toISOString().slice(11, 19);                 // "HH:MM:SS"

    await db.insert(avatarUsoLogTable).values({
      empresaId:  params.empresaId,
      avatarId:   params.avatarId ?? null,
      clienteId:  params.clienteId ?? null,
      provedor:   params.provedor,
      tipoUso:    params.tipoUso,
      charsTexto: params.charsTexto ?? null,
      duracaoSeg: params.duracaoSeg ? String(params.duracaoSeg) : null,
      contexto:   params.contexto ?? null,
      status:     params.status ?? "ok",
      erro:       params.erro ?? null,
      cfRayId:    params.cfRayId ?? null,
      dataUso,
      horaUso,
    });
  } catch (e: any) {
    logger.warn({ err: e?.message }, "avatar-metering: falha ao registrar uso (ignorado)");
  }
}

// ─── Verificação de módulo contratado ────────────────────────────────────────

/**
 * Verifica se a clínica tem o nível de avatar contratado.
 *   nivel 'voz'   = ElevenLabs (áudio MP3)
 *   nivel 'video' = HeyGen (vídeo do avatar)
 *
 * Instituto Pádua (empresa_id=5) tem acesso completo como piloto.
 * Para outras clínicas, verifica avatar_modulos_contratados.
 */
export async function verificarModuloContratado(
  empresaId: number,
  nivel: "voz" | "video",
): Promise<{ temAcesso: boolean; tipoCobranca?: string; limiteMensal?: number | null }> {
  try {
    const [modulo] = await db
      .select()
      .from(avatarModulosContratadosTable)
      .where(
        and(
          eq(avatarModulosContratadosTable.empresaId, empresaId),
          eq(avatarModulosContratadosTable.nivel, nivel),
          eq(avatarModulosContratadosTable.ativo, true),
        ),
      )
      .limit(1);

    if (!modulo) return { temAcesso: false };
    return {
      temAcesso:     true,
      tipoCobranca:  modulo.tipoCobranca,
      limiteMensal:  modulo.limiteMensal,
    };
  } catch {
    // Em caso de falha na consulta, fail-open para o piloto
    return { temAcesso: true };
  }
}

// ─── Resumo de uso por clínica ─────────────────────────────────────────────

export interface ResumoUso {
  totalVoz:         number; // total de gerações de voz no mês
  totalVideo:       number; // total de gerações de vídeo no mês
  charsVoz:         number; // total de caracteres sintetizados
  segundosVideo:    number; // total de segundos gerados
  erros:            number;
}

/** Retorna o resumo de uso do mês corrente para uma clínica. */
export async function resumoUsoMes(empresaId: number): Promise<ResumoUso> {
  try {
    const rows = await db
      .select()
      .from(avatarUsoLogTable)
      .where(eq(avatarUsoLogTable.empresaId, empresaId));

    // Filtra pelo mês corrente em memória (simples — volume baixo na fase piloto)
    const agora  = new Date();
    const mesAtual = rows.filter(r => {
      const d = new Date(r.createdAt);
      return d.getFullYear() === agora.getFullYear() && d.getMonth() === agora.getMonth();
    });

    return {
      totalVoz:      mesAtual.filter(r => r.tipoUso === "voz"   && r.status === "ok").length,
      totalVideo:    mesAtual.filter(r => r.tipoUso === "video"  && r.status === "ok").length,
      charsVoz:      mesAtual.reduce((s, r) => s + (r.charsTexto ?? 0), 0),
      segundosVideo: mesAtual.reduce((s, r) => s + Number(r.duracaoSeg ?? 0), 0),
      erros:         mesAtual.filter(r => r.status === "erro").length,
    };
  } catch {
    return { totalVoz: 0, totalVideo: 0, charsVoz: 0, segundosVideo: 0, erros: 0 };
  }
}
