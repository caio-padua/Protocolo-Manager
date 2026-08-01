/**
 * avatar-messenger.ts — PONTE entre Avatares de Voz e os serviços de
 * mensageria já existentes do PADAXOR.
 *
 * ARQUITETURA:
 *   O avatar de voz é ADITIVO — nunca substitui o canal existente.
 *   O texto/WhatsApp/Telegram/Email já saem normalmente.
 *   O avatar acrescenta UM áudio MP3 via WhatsApp após o texto principal.
 *
 * PONTOS DE CONEXÃO ao sistema existente:
 *   1. lembrete-periodo.ts   → executarLembretesPeriodo() — após envio do texto
 *   2. routes/avatares.ts    → POST /api/avatares/enviar-voz (disparo manual CEO)
 *   3. engine.ts (Task #57)  → canal "VOICE" em enviarMensagemPaxter()
 *
 * CACHE DE ÁUDIO:
 *   Buffer MP3 fica na memória por 5 minutos.
 *   Rota pública /api/avatares/audio-temp/:key serve para o Twilio buscar.
 *   Twilio busca o arquivo nos primeiros segundos após o envio — TTL suficiente.
 */

import crypto  from "crypto";
import { db, clinicAvatarsTable } from "@workspace/db";
import { eq, and }               from "drizzle-orm";
import { gerarAudio }            from "./elevenlabs";
import { gerarVideo, buscarStatusVideo } from "./heygen";
import { sendWhatsapp }          from "./whatsapp";
import { logger }                from "./logger";
import { registrarUso, verificarModuloContratado } from "./avatar-metering";
import type { LembretePeriodoJson } from "@workspace/db";

// ─── Cache de áudio em memória ────────────────────────────────────────────────
// Mapeia uuid → { buffer MP3, validade }. TTL de 5 minutos (Twilio busca em < 10s).

interface AudioEntry { buffer: Buffer; expiresAt: number }
const audioCache = new Map<string, AudioEntry>();

/** Lê o buffer de áudio temporário (chamado pela rota pública). */
export function getAudioTemp(key: string): Buffer | null {
  const entry = audioCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { audioCache.delete(key); return null; }
  return entry.buffer;
}

function storeAudioTemp(buffer: Buffer): string {
  const key = crypto.randomUUID();
  audioCache.set(key, { buffer, expiresAt: Date.now() + 5 * 60_000 });
  // Limpeza de entradas vencidas para não vazar memória
  for (const [k, v] of audioCache) {
    if (Date.now() > v.expiresAt) audioCache.delete(k);
  }
  return key;
}

// ─── URL pública do servidor ──────────────────────────────────────────────────

function getPublicBaseUrl(): string | null {
  const domain = (process.env.REPLIT_DOMAINS ?? "").split(",")[0]?.trim();
  if (!domain) return null;
  const base = domain.startsWith("http") ? domain : `https://${domain}`;
  return base.replace(/\/$/, "");
}

// ─── Tipo de Avatar ───────────────────────────────────────────────────────────

export interface AvatarAtivo {
  id:                number;
  empresaId:         number;
  tipo:              number;
  nomeExibido:       string;
  elevenLabsVoiceId: string;       // garantido não-nulo nesta interface
  heygenAvatarId:    string | null;
}

// ─── Busca do avatar ativo ────────────────────────────────────────────────────

/**
 * Retorna o avatar ATIVO com ElevenLabs configurado para a clínica.
 * Prefere Médico (tipo=1) > Secretária (tipo=2) > Livre (tipo=3).
 * Retorna null se não houver avatar configurado (fluxo silencioso).
 */
export async function getAvatarAtivoPorEmpresa(
  empresaId: number,
): Promise<AvatarAtivo | null> {
  try {
    const rows = await db
      .select()
      .from(clinicAvatarsTable)
      .where(
        and(
          eq(clinicAvatarsTable.empresaId, empresaId),
          eq(clinicAvatarsTable.status, "ativo"),
        ),
      )
      .orderBy(clinicAvatarsTable.tipo);

    const comVoz = rows.find(a => a.elevenLabsVoiceId && a.elevenLabsVoiceId.trim());
    if (!comVoz) return null;

    return {
      id:                comVoz.id,
      empresaId:         comVoz.empresaId,
      tipo:              comVoz.tipo,
      nomeExibido:       comVoz.nomeExibido,
      elevenLabsVoiceId: comVoz.elevenLabsVoiceId!,
      heygenAvatarId:    comVoz.heygenAvatarId,
    };
  } catch {
    return null; // falha silenciosa — nunca bloqueia o fluxo de mensagem
  }
}

// ─── Gerador de script de voz ─────────────────────────────────────────────────

/**
 * Converte o texto de WhatsApp/lembrete em script limpo para TTS.
 * Remove emojis, asteriscos, underlines e formatação markdown.
 * Preserva pontuação e quebras de linha como pausas.
 */
export function limparTextoParaVoz(texto: string): string {
  return texto
    // Remove emojis e símbolos especiais (range Unicode)
    .replace(/[\u{1F000}-\u{1FFFF}]/gu, "")
    .replace(/[\u{2600}-\u{26FF}]/gu, "")
    .replace(/[\u{2700}-\u{27BF}]/gu, "")
    // Remove formatação WhatsApp (* _ ~ `)
    .replace(/[*_~`]/g, "")
    // Converte quebras de linha em ponto-e-vírgula (pausa natural)
    .replace(/\n{2,}/g, ". ")
    .replace(/\n/g, " ")
    // Colapsa espaços múltiplos
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * Gera script de voz direto a partir dos períodos de prescrição.
 * Mais controlado que limparTextoParaVoz: garante linguagem falada natural.
 */
export function gerarScriptLembrete(
  clienteNome: string,
  periodos: LembretePeriodoJson[],
): string {
  const primeiroNome = clienteNome.trim().split(/\s+/)[0] ?? clienteNome;
  const partes: string[] = [`Olá, ${primeiroNome}.`];

  const periodosComFormulas = periodos.filter(p => p.formulas.length > 0);

  for (const periodo of periodosComFormulas) {
    partes.push(`No período de ${periodo.nome}:`);
    for (const f of periodo.formulas) {
      const componentes: string[] = [f.nome];
      if (f.dose) componentes.push(f.dose);
      if (f.posologia)      componentes.push(f.posologia);
      else if (f.horario)   componentes.push(`às ${f.horario}`);
      if (f.observacaoRefeicao) componentes.push(f.observacaoRefeicao);
      partes.push(componentes.join(", ") + ".");
    }
  }

  partes.push("Em caso de dúvida, entre em contato com o consultório. Até logo!");
  return partes.join(" ");
}

// ─── Função principal de envio de voz ────────────────────────────────────────

export interface EnviarVozResult {
  sent:      boolean;
  skipped?:  boolean;   // true = avatar não configurado (sem erro real)
  audioKey?: string;    // key do cache (para debug)
  error?:    string;
}

/**
 * Gera áudio da voz do avatar e envia via WhatsApp como nota de voz.
 * BEST-EFFORT: nunca lança, nunca bloqueia o fluxo que chamou.
 *
 * @param empresaId  ID da empresa/clínica (empresa_id=5 = Instituto Pádua)
 * @param telefone   Número do cliente (formato +5511...)
 * @param texto      Texto para o avatar falar (será limpo de formatação)
 * @param opts       { clienteId, contexto }
 */
export async function enviarVozAvatarWhatsapp(
  empresaId: number,
  telefone: string,
  texto: string,
  opts: { clienteId?: number; contexto?: string } = {},
): Promise<EnviarVozResult> {
  try {
    // 1. Verificar se a clínica tem o Módulo 2 (Voz) contratado
    const modulo = await verificarModuloContratado(empresaId, "voz");
    if (!modulo.temAcesso) {
      return { sent: false, skipped: true, error: "Módulo Voz não contratado" };
    }

    // 2. Verificar se há avatar configurado com ElevenLabs
    const avatar = await getAvatarAtivoPorEmpresa(empresaId);
    if (!avatar) {
      return { sent: false, skipped: true };
    }

    // 2. URL pública necessária para o Twilio buscar o arquivo
    const baseUrl = getPublicBaseUrl();
    if (!baseUrl) {
      logger.warn("avatar-messenger: REPLIT_DOMAINS não definido — voz pulada");
      return { sent: false, skipped: true, error: "REPLIT_DOMAINS não configurado" };
    }

    // 3. Limpar texto para TTS (sem emojis nem markdown)
    const script = limparTextoParaVoz(texto);
    if (!script.trim()) {
      return { sent: false, skipped: true, error: "texto vazio após limpeza" };
    }

    // 4. Gerar áudio via ElevenLabs + registrar uso (metering)
    const mp3Buffer = await gerarAudio(script, avatar.elevenLabsVoiceId);
    void registrarUso({
      empresaId, avatarId: avatar.id, clienteId: opts.clienteId,
      provedor: "elevenlabs", tipoUso: "voz",
      charsTexto: script.length, contexto: (opts.contexto?.startsWith("lembrete") ? "lembrete" : "manual") as "lembrete" | "manual",
      status: "ok",
    });

    // 5. Guardar no cache temporário
    const audioKey = storeAudioTemp(mp3Buffer);
    const mediaUrl = `${baseUrl}/api/avatares/audio-temp/${audioKey}`;

    // 6. Enviar via Twilio WhatsApp como mensagem de áudio
    const r = await sendWhatsapp(
      telefone,
      `🎙️ _Mensagem de voz do ${avatar.nomeExibido}_`,
      {
        mediaUrl,
        contexto: opts.contexto ?? "avatar_voz",
        clienteId: opts.clienteId,
      },
    );

    if (r.sent) {
      logger.info(
        { avatarId: avatar.id, nomeAvatar: avatar.nomeExibido, clienteId: opts.clienteId },
        "avatar-messenger: áudio enviado com sucesso",
      );
    } else {
      logger.warn({ error: r.error, clienteId: opts.clienteId }, "avatar-messenger: Twilio não entregou o áudio");
    }

    return { sent: r.sent, audioKey, error: r.error };
  } catch (e: any) {
    logger.warn({ err: e?.message }, "avatar-messenger: exceção ao enviar voz (best-effort)");
    return { sent: false, error: e?.message ?? "Erro desconhecido" };
  }
}

// ─── Disparo manual (CEO) ─────────────────────────────────────────────────────

export interface EnviarVozManualParams {
  empresaId:    number;
  avatarId?:    number;   // força um avatar específico (ignora prioridade)
  telefone:     string;
  texto:        string;
  clienteId?:   number;
}

/**
 * Disparo manual de voz pelo CEO via tela "Disparar Avatar".
 * Ao contrário do fluxo automático, permite escolher um avatar específico.
 */
export async function enviarVozManual(
  params: EnviarVozManualParams,
): Promise<EnviarVozResult> {
  try {
    let avatar: AvatarAtivo | null = null;

    if (params.avatarId) {
      // Avatar específico solicitado
      const [row] = await db
        .select()
        .from(clinicAvatarsTable)
        .where(eq(clinicAvatarsTable.id, params.avatarId))
        .limit(1);
      if (row?.elevenLabsVoiceId) {
        avatar = {
          id:                row.id,
          empresaId:         row.empresaId,
          tipo:              row.tipo,
          nomeExibido:       row.nomeExibido,
          elevenLabsVoiceId: row.elevenLabsVoiceId,
          heygenAvatarId:    row.heygenAvatarId,
        };
      }
    } else {
      avatar = await getAvatarAtivoPorEmpresa(params.empresaId);
    }

    if (!avatar) {
      return { sent: false, skipped: true, error: "Nenhum avatar com ElevenLabs configurado" };
    }

    const baseUrl = getPublicBaseUrl();
    if (!baseUrl) return { sent: false, skipped: true, error: "REPLIT_DOMAINS não configurado" };

    const script = limparTextoParaVoz(params.texto);
    const mp3Buffer = await gerarAudio(script, avatar.elevenLabsVoiceId);
    const audioKey  = storeAudioTemp(mp3Buffer);
    const mediaUrl  = `${baseUrl}/api/avatares/audio-temp/${audioKey}`;

    const r = await sendWhatsapp(
      params.telefone,
      `🎙️ _Mensagem de voz do ${avatar.nomeExibido}_`,
      { mediaUrl, contexto: "avatar_voz_manual", clienteId: params.clienteId },
    );

    return { sent: r.sent, audioKey, error: r.error };
  } catch (e: any) {
    return { sent: false, error: e?.message ?? "Erro desconhecido" };
  }
}
