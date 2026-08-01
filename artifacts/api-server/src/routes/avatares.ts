/**
 * avatares.ts — Rotas do Motor de Avatares de Voz e Vídeo.
 *
 * Rotas expostas:
 *   GET  /api/avatares            → lista avatares (filtro por empresa_id via sessão)
 *   GET  /api/avatares/status     → check de saúde ElevenLabs + HeyGen
 *   GET  /api/avatares/vozes      → lista vozes disponíveis no ElevenLabs
 *   GET  /api/avatares/hg-avatars → lista avatares disponíveis no HeyGen
 *   PUT  /api/avatares/:id        → atualiza configuração de um avatar
 *   POST /api/avatares/voz/gerar  → sintetiza MP3 com ElevenLabs
 *   POST /api/avatares/video/gerar → dispara geração de vídeo no HeyGen (assíncrono)
 *   GET  /api/avatares/video/:videoId/status → polling do status do vídeo HeyGen
 */

import { Router }              from "express";
import { db, clinicAvatarsTable, clientsTable } from "@workspace/db";
import { eq, and }             from "drizzle-orm";
import { sql }                 from "drizzle-orm";
import { z }                   from "zod";
import { listarVozes, gerarAudio, checkElevenLabsStatus } from "../lib/elevenlabs";
import { listarAvatares, gerarVideo, buscarStatusVideo, checkHeyGenStatus } from "../lib/heygen";
import { getAudioTemp, enviarVozManual } from "../lib/avatar-messenger";
import { resumoUsoMes } from "../lib/avatar-metering";
import { buscarHistoricoAvatar } from "../lib/avatar-envios";
import { enviarMensagemPaxter } from "../lib/messaging/engine";
import { criarCampanha, buscarProgressoCampanha, ensureCampanhaSchema } from "../lib/avatar-campanha-worker";
import { logger }              from "../lib/logger";

const router = Router();

// ─── Helpers ─────────────────────────────────────────────────────────────────

function empresaIdFromReq(req: any): number {
  // CEO é sempre empresa_id = 5 (Instituto Pádua / empresa-mãe).
  // Para a Onda atual, só a empresa-mãe opera avatares.
  return Number(req.session?.user?.empresaId ?? 5);
}

// ─── GET /api/avatares ───────────────────────────────────────────────────────

router.get("/api/avatares", async (req, res) => {
  try {
    const empresaId = empresaIdFromReq(req);
    const avatares = await db
      .select()
      .from(clinicAvatarsTable)
      .where(eq(clinicAvatarsTable.empresaId, empresaId))
      .orderBy(clinicAvatarsTable.tipo);
    res.json({ avatares });
  } catch (e: any) {
    logger.error({ err: e?.message }, "avatares: erro ao listar");
    res.status(500).json({ error: e?.message ?? "Erro interno" });
  }
});

// ─── GET /api/avatares/status ────────────────────────────────────────────────

router.get("/api/avatares/status", async (_req, res) => {
  try {
    const [el, hg] = await Promise.all([
      checkElevenLabsStatus(),
      checkHeyGenStatus(),
    ]);
    res.json({
      elevenlabs: el,
      heygen:     hg,
      todasOk:    el.ok && hg.ok,
    });
  } catch (e: any) {
    logger.error({ err: e?.message }, "avatares: erro no check de status");
    res.status(500).json({ error: e?.message ?? "Erro interno" });
  }
});

// ─── GET /api/avatares/vozes ─────────────────────────────────────────────────

router.get("/api/avatares/vozes", async (_req, res) => {
  try {
    const vozes = await listarVozes();
    res.json({ vozes });
  } catch (e: any) {
    logger.warn({ err: e?.message }, "avatares: erro ao listar vozes ElevenLabs");
    res.status(502).json({ error: e?.message ?? "Erro ao consultar ElevenLabs" });
  }
});

// ─── GET /api/avatares/hg-avatars ────────────────────────────────────────────

router.get("/api/avatares/hg-avatars", async (_req, res) => {
  try {
    const avatares = await listarAvatares();
    res.json({ avatares });
  } catch (e: any) {
    logger.warn({ err: e?.message }, "avatares: erro ao listar avatares HeyGen");
    res.status(502).json({ error: e?.message ?? "Erro ao consultar HeyGen" });
  }
});

// ─── PUT /api/avatares/:id ────────────────────────────────────────────────────

const updateAvatarSchema = z.object({
  nomeExibido:       z.string().min(1).max(120).optional(),
  descricao:         z.string().max(500).nullable().optional(),
  elevenLabsVoiceId: z.string().max(200).nullable().optional(),
  heygenAvatarId:    z.string().max(200).nullable().optional(),
  status:            z.enum(["ativo", "inativo"]).optional(),
});

router.put("/api/avatares/:id", async (req, res) => {
  try {
    const id      = Number(req.params.id);
    const payload = updateAvatarSchema.parse(req.body);

    if (!id || isNaN(id)) {
      return res.status(400).json({ error: "ID inválido" });
    }

    // Monta objeto de update com apenas os campos presentes
    const setObj: Record<string, unknown> = {};
    if (payload.nomeExibido       !== undefined) setObj.nomeExibido       = payload.nomeExibido;
    if (payload.descricao         !== undefined) setObj.descricao         = payload.descricao;
    if (payload.elevenLabsVoiceId !== undefined) setObj.elevenLabsVoiceId = payload.elevenLabsVoiceId;
    if (payload.heygenAvatarId    !== undefined) setObj.heygenAvatarId    = payload.heygenAvatarId;
    if (payload.status            !== undefined) setObj.status            = payload.status;

    if (Object.keys(setObj).length === 0) {
      return res.status(400).json({ error: "Nenhum campo para atualizar" });
    }

    await db
      .update(clinicAvatarsTable)
      .set(setObj)
      .where(eq(clinicAvatarsTable.id, id));

    const [updated] = await db
      .select()
      .from(clinicAvatarsTable)
      .where(eq(clinicAvatarsTable.id, id))
      .limit(1);

    res.json({ avatar: updated });
  } catch (e: any) {
    if (e?.name === "ZodError") return res.status(400).json({ error: "Dados inválidos", details: e.issues });
    logger.error({ err: e?.message }, "avatares: erro ao atualizar");
    res.status(500).json({ error: e?.message ?? "Erro interno" });
  }
});

// ─── POST /api/avatares/voz/gerar ────────────────────────────────────────────

const gerarVozSchema = z.object({
  texto:   z.string().min(1).max(2500),
  voiceId: z.string().min(1),
});

router.post("/api/avatares/voz/gerar", async (req, res) => {
  try {
    const { texto, voiceId } = gerarVozSchema.parse(req.body);
    const mp3Buffer = await gerarAudio(texto, voiceId);

    res.set({
      "Content-Type":        "audio/mpeg",
      "Content-Disposition": "inline; filename=\"avatar-voz.mp3\"",
      "Content-Length":      String(mp3Buffer.length),
    });
    res.send(mp3Buffer);
  } catch (e: any) {
    if (e?.name === "ZodError") return res.status(400).json({ error: "Dados inválidos", details: e.issues });
    logger.error({ err: e?.message }, "avatares: erro ao gerar áudio ElevenLabs");
    res.status(502).json({ error: e?.message ?? "Erro ao gerar áudio" });
  }
});

// ─── POST /api/avatares/video/gerar ──────────────────────────────────────────

const gerarVideoSchema = z.object({
  avatarId: z.string().min(1),
  texto:    z.string().min(1).max(3000),
  voiceId:  z.string().optional(),
});

router.post("/api/avatares/video/gerar", async (req, res) => {
  try {
    const { avatarId, texto, voiceId } = gerarVideoSchema.parse(req.body);
    const result = await gerarVideo(avatarId, texto, voiceId);
    res.json({ videoId: result.videoId, status: "pending" });
  } catch (e: any) {
    if (e?.name === "ZodError") return res.status(400).json({ error: "Dados inválidos", details: e.issues });
    logger.error({ err: e?.message }, "avatares: erro ao gerar vídeo HeyGen");
    res.status(502).json({ error: e?.message ?? "Erro ao gerar vídeo" });
  }
});

// ─── GET /api/avatares/video/:videoId/status ─────────────────────────────────

router.get("/api/avatares/video/:videoId/status", async (req, res) => {
  try {
    const { videoId } = req.params;
    if (!videoId) return res.status(400).json({ error: "videoId obrigatório" });

    const result = await buscarStatusVideo(videoId);
    res.json(result);
  } catch (e: any) {
    logger.warn({ err: e?.message }, "avatares: erro ao buscar status de vídeo HeyGen");
    res.status(502).json({ error: e?.message ?? "Erro ao consultar HeyGen" });
  }
});

// ─── GET /api/avatares/uso ───────────────────────────────────────────────────
// Resumo de uso do mês corrente para metering / painel CEO.

router.get("/api/avatares/uso", async (req, res) => {
  try {
    const empresaId = empresaIdFromReq(req);
    const uso = await resumoUsoMes(empresaId);
    res.json(uso);
  } catch (e: any) {
    logger.warn({ err: e?.message }, "avatares: erro ao buscar uso");
    res.status(500).json({ error: e?.message ?? "Erro interno" });
  }
});

// ─── GET /api/avatares/audio-temp/:key (PÚBLICO — Twilio busca sem sessão) ───
// Serve o MP3 do cache em memória. TTL de 5 minutos. Sem autenticação: o Twilio
// precisa buscar o arquivo sem credenciais, apenas com a URL opaca como segredo.

router.get("/api/avatares/audio-temp/:key", (req, res) => {
  const { key } = req.params;
  const buffer = getAudioTemp(key);
  if (!buffer) {
    return res.status(404).json({ error: "Áudio não encontrado ou expirado" });
  }
  res.set({
    "Content-Type":        "audio/mpeg",
    "Content-Length":      String(buffer.length),
    "Cache-Control":       "no-store",
    "Content-Disposition": "inline; filename=\"avatar-voz.mp3\"",
  });
  res.send(buffer);
});

// ─── POST /api/avatares/enviar-voz ────────────────────────────────────────────
// Disparo MANUAL de voz pelo CEO: seleciona um cliente + texto + avatarId e
// envia o áudio via WhatsApp. Contexto: tela "Disparar Avatar" do PADCOM.

// Aceita telefone direto (disparo manual da tela) OU clienteId (integração programática)
const enviarVozSchema = z.union([
  z.object({
    telefone:  z.string().min(8),
    texto:     z.string().min(1).max(3000),
    avatarId:  z.number().int().positive().optional(),
    clienteId: z.number().int().positive().optional(),
  }),
  z.object({
    clienteId: z.number().int().positive(),
    texto:     z.string().min(1).max(3000),
    avatarId:  z.number().int().positive().optional(),
  }),
]);

router.post("/api/avatares/enviar-voz", async (req, res) => {
  try {
    const parsed = enviarVozSchema.parse(req.body);
    const empresaIdFromSession = empresaIdFromReq(req);

    let telefone: string;
    let clienteId: number | undefined;
    let empresaId = empresaIdFromSession;

    if ("telefone" in parsed && parsed.telefone) {
      // Disparo direto com telefone
      telefone  = parsed.telefone;
      clienteId = parsed.clienteId;
    } else if ("clienteId" in parsed) {
      // Busca o telefone pelo clienteId
      const [cliente] = await db
        .select({ phone: clientsTable.phone, empresaId: clientsTable.empresaId, name: clientsTable.name })
        .from(clientsTable)
        .where(eq(clientsTable.id, parsed.clienteId))
        .limit(1);
      if (!cliente)       return res.status(404).json({ error: "Cliente não encontrado" });
      if (!cliente.phone) return res.status(400).json({ error: "Cliente sem telefone cadastrado" });
      telefone  = cliente.phone;
      clienteId = parsed.clienteId;
      empresaId = cliente.empresaId ?? empresaIdFromSession;
    } else {
      return res.status(400).json({ error: "Forneça telefone ou clienteId" });
    }

    const result = await enviarVozManual({
      empresaId,
      avatarId:  parsed.avatarId,
      telefone,
      texto:     parsed.texto,
      clienteId,
    });

    res.json({
      ...result,
      telefone: telefone.replace(/\d(?=\d{4})/g, "*"),
    });
  } catch (e: any) {
    if (e?.name === "ZodError") return res.status(400).json({ error: "Dados inválidos", details: e.issues });
    logger.error({ err: e?.message }, "avatares: erro ao enviar voz manual");
    res.status(500).json({ error: e?.message ?? "Erro interno" });
  }
});

// ─── POST /api/avatares/:id/disparar ─────────────────────────────────────────
// Disparo MANUAL de voz OU vídeo do avatar para um cliente específico.
// Usado pela tela "Disparar Avatar" no PADCOM.

const dispararSchema = z.object({
  clienteId: z.number().int().positive(),
  texto:     z.string().min(1).max(3000),
  canal:     z.enum(["VOICE", "VIDEO"]),
  canalEntrega: z.enum(["WHATSAPP", "TELEGRAM", "EMAIL"]).optional().default("WHATSAPP"),
});

router.post("/api/avatares/:id/disparar", async (req, res) => {
  try {
    const avatarId = parseInt(req.params.id);
    if (isNaN(avatarId)) return res.status(400).json({ error: "avatarId inválido" });

    const parsed = dispararSchema.parse(req.body);
    const empresaId = empresaIdFromReq(req);

    // Buscar dados do cliente
    const [cliente] = await db
      .select({ phone: clientsTable.phone, email: clientsTable.email,
                name: clientsTable.name, empresaId: clientsTable.empresaId })
      .from(clientsTable)
      .where(eq(clientsTable.id, parsed.clienteId))
      .limit(1);

    if (!cliente) return res.status(404).json({ error: "Cliente não encontrado" });

    const destino = {
      telefone:       cliente.phone  ?? null,
      email:          cliente.email  ?? null,
      telegramChatId: null,
      nome:           cliente.name,
    };

    const resultado = await enviarMensagemPaxter(
      {
        titulo:    `Mensagem do seu médico — ${parsed.canal === "VOICE" ? "Áudio" : "Vídeo"}`,
        paragrafos: [parsed.texto],
      },
      destino,
      [parsed.canal as any],
      {
        empresaId: cliente.empresaId ?? empresaId,
        avatarId,
        clienteId: parsed.clienteId,
        contexto:  "disparar_manual",
      },
    );

    res.json({
      ok:       resultado.algumEnviado,
      canal:    parsed.canal,
      cliente:  { id: parsed.clienteId, nome: cliente.name },
      resultado: resultado.resultados,
    });
  } catch (e: any) {
    if (e?.name === "ZodError") return res.status(400).json({ error: "Dados inválidos", details: e.issues });
    logger.error({ err: e?.message }, "avatares: erro ao disparar");
    res.status(500).json({ error: e?.message ?? "Erro interno" });
  }
});

// ─── POST /api/avatares/campanha ──────────────────────────────────────────────
// Dispara voz/vídeo para uma lista de clientes.
// SALVA cada item no banco ANTES de processar, garantindo retomada após restart.
// Worker (cron) consome avatar_campanha_itens e atualiza status por item.

const campanhaSchema = z.object({
  avatarId:    z.number().int().positive(),
  clienteIds:  z.array(z.number().int().positive()).min(1).max(500),
  texto:       z.string().min(1).max(3000),
  canal:       z.enum(["VOICE", "VIDEO"]),
});

router.post("/api/avatares/campanha", async (req, res) => {
  try {
    const parsed    = campanhaSchema.parse(req.body);
    const empresaId = empresaIdFromReq(req);

    // ── Verificar que o avatar pertence à empresa da sessão (anti-IDOR) ────
    const [avatarOwner] = await db
      .select({ id: clinicAvatarsTable.id })
      .from(clinicAvatarsTable)
      .where(
        and(
          eq(clinicAvatarsTable.id, parsed.avatarId),
          eq(clinicAvatarsTable.empresaId, empresaId),
        )
      )
      .limit(1);

    if (!avatarOwner) {
      return res.status(403).json({ error: "Avatar não encontrado ou não pertence à sua empresa" });
    }

    // Busca dados dos clientes selecionados
    const todosClientes = await db
      .select({
        id:        clientsTable.id,
        phone:     clientsTable.phone,
        email:     clientsTable.email,
        name:      clientsTable.name,
        empresaId: clientsTable.empresaId,
      })
      .from(clientsTable)
      .where(eq(clientsTable.empresaId, empresaId));

    const clientes = todosClientes.filter(c => parsed.clienteIds.includes(c.id));

    if (clientes.length === 0) {
      return res.status(400).json({ error: "Nenhum cliente encontrado para os IDs informados" });
    }

    // ID determinístico baseado em timestamp (sem new Date() nu — BRT não necessário aqui)
    const campaignId = `camp_${Date.now()}`;

    // Persiste campanha + itens no banco ANTES de responder
    await criarCampanha({
      campaignId,
      empresaId,
      avatarId:  parsed.avatarId,
      canal:     parsed.canal,
      texto:     parsed.texto,
      clientes,
    });

    logger.info(
      { campaignId, total: clientes.length, canal: parsed.canal },
      "[avatar] campanha criada — itens salvos no banco",
    );

    res.json({
      ok:            true,
      campaignId,
      totalClientes: clientes.length,
      canal:         parsed.canal,
      mensagem:      "Campanha enfileirada. Os envios serão processados pelo worker (cron 1min) e você pode acompanhar o progresso.",
    });

  } catch (e: any) {
    if (e?.name === "ZodError") return res.status(400).json({ error: "Dados inválidos", details: e.issues });
    logger.error({ err: e?.message }, "avatares: erro na campanha");
    res.status(500).json({ error: e?.message ?? "Erro interno" });
  }
});

// ─── GET /api/avatares/campanha/:campaignId ───────────────────────────────────
// Progresso da campanha: total / enviados / erros / pendentes / status.
// Filtrado por empresaId da sessão — sem match retorna 404 (anti-IDOR).

router.get("/api/avatares/campanha/:campaignId", async (req, res) => {
  try {
    await ensureCampanhaSchema();
    const { campaignId } = req.params;
    if (!campaignId) return res.status(400).json({ error: "campaignId obrigatório" });

    const empresaId = empresaIdFromReq(req);
    // empresaId é passado como filtro — campanha de outra empresa retorna 404
    const progresso = await buscarProgressoCampanha(campaignId, empresaId);
    if (!progresso) return res.status(404).json({ error: "Campanha não encontrada" });

    res.json(progresso);
  } catch (e: any) {
    logger.error({ err: e?.message }, "avatares: erro ao buscar progresso de campanha");
    res.status(500).json({ error: e?.message ?? "Erro interno" });
  }
});

// ─── GET /api/avatares/:id/historico ─────────────────────────────────────────
// Histórico de envios de voz e vídeo por avatar.

router.get("/api/avatares/:id/historico", async (req, res) => {
  try {
    const avatarId = parseInt(req.params.id);
    if (isNaN(avatarId)) return res.status(400).json({ error: "avatarId inválido" });

    const limite = Math.min(Number(req.query.limite ?? 50), 200);
    const historico = await buscarHistoricoAvatar(avatarId, limite);
    res.json({ historico });
  } catch (e: any) {
    logger.error({ err: e?.message }, "avatares: erro ao buscar histórico");
    res.status(500).json({ error: e?.message ?? "Erro interno" });
  }
});

// ─── GET /api/avatares/fila-video ────────────────────────────────────────────
// Estado da fila de vídeos pendentes / em geração (painel CEO).

router.get("/api/avatares/fila-video", async (req, res) => {
  try {
    const empresaId = empresaIdFromReq(req);
    const rows = await db.execute(sql`
      SELECT id, avatar_id, cliente_id, canal_destino, status, tentativas,
             video_url, erro, contexto, created_at, entregue_at
      FROM avatar_video_queue
      WHERE empresa_id = ${empresaId}
      ORDER BY created_at DESC
      LIMIT 50
    `);
    res.json({ fila: rows.rows });
  } catch (e: any) {
    logger.error({ err: e?.message }, "avatares: erro ao buscar fila de vídeo");
    res.status(500).json({ error: e?.message ?? "Erro interno" });
  }
});

export default router;
