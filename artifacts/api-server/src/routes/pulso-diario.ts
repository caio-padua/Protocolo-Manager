import { Router, type IRouter } from "express";
import { and, desc, eq, gte } from "drizzle-orm";
import { z } from "zod/v4";
import { db, pulsoDiarioTable, clientsTable } from "@workspace/db";
import { sendTelegramBotaoWebApp } from "../lib/telegram";
import { verifyPatientToken, verifyPortalToken } from "../lib/portal-token";
import { brtISODate, parseBrtParts } from "../lib/brt";

// ============================================================================
// PULSO DIÁRIO — acompanhamento diário reportado pelo cliente.
//   GET  /api/pulso-diario/:clientId?dias=N   → leituras recentes (default 14)
//   POST /api/pulso-diario/:clientId          → upsert (cliente,data,periodo)
//
// Padrão de fetch cru já usado pelos painéis-irmãos do cockpit (ClienteCracha,
// EvolucaoExamesPanel): decisão deliberada, sem OpenAPI/Orval. A captura inbound
// (resposta do cliente pelo WhatsApp) é fase futura; hoje o POST semeia a demo.
// ============================================================================

const router: IRouter = Router();

const PERIODOS = ["manha", "tarde", "noite"] as const;

const upsertSchema = z.object({
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "data deve ser YYYY-MM-DD"),
  periodo: z.enum(PERIODOS),
  energia: z.number().int().min(0).max(10).nullable().optional(),
  disposicao: z.number().int().min(0).max(10).nullable().optional(),
  sono: z.number().int().min(0).max(10).nullable().optional(),
  pressaoSistolica: z.number().int().min(0).max(300).nullable().optional(),
  pressaoDiastolica: z.number().int().min(0).max(200).nullable().optional(),
  frequenciaCardiaca: z.number().int().min(0).max(300).nullable().optional(),
  glicemia: z.number().int().min(0).max(1000).nullable().optional(),
  humor: z.string().max(60).nullable().optional(),
  observacao: z.string().max(500).nullable().optional(),
  origem: z.string().max(30).optional(),
});

router.get("/pulso-diario/:clientId", async (req, res): Promise<void> => {
  const clientId = Number(req.params.clientId);
  if (!Number.isInteger(clientId)) {
    res.status(400).json({ error: "clientId inválido" });
    return;
  }
  const dias = Math.min(Math.max(Number(req.query.dias) || 14, 1), 90);
  const desde = new Date();
  desde.setDate(desde.getDate() - dias);
  const desdeStr = desde.toISOString().slice(0, 10);

  const linhas = await db
    .select()
    .from(pulsoDiarioTable)
    .where(
      and(
        eq(pulsoDiarioTable.clienteId, clientId),
        gte(pulsoDiarioTable.data, desdeStr),
      ),
    )
    .orderBy(desc(pulsoDiarioTable.data));

  res.json(
    linhas.map((l) => ({
      ...l,
      createdAt: l.createdAt.toISOString(),
      updatedAt: l.updatedAt.toISOString(),
    })),
  );
});

router.post("/pulso-diario/:clientId", async (req, res): Promise<void> => {
  const clientId = Number(req.params.clientId);
  if (!Number.isInteger(clientId)) {
    res.status(400).json({ error: "clientId inválido" });
    return;
  }
  const [cliente] = await db
    .select({ id: clientsTable.id })
    .from(clientsTable)
    .where(eq(clientsTable.id, clientId));
  if (!cliente) {
    res.status(404).json({ error: "cliente não encontrado" });
    return;
  }

  const parsed = upsertSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "payload inválido", detalhes: parsed.error.issues });
    return;
  }
  const v = parsed.data;

  const valores = {
    clienteId: clientId,
    data: v.data,
    periodo: v.periodo,
    energia: v.energia ?? null,
    disposicao: v.disposicao ?? null,
    sono: v.sono ?? null,
    pressaoSistolica: v.pressaoSistolica ?? null,
    pressaoDiastolica: v.pressaoDiastolica ?? null,
    frequenciaCardiaca: v.frequenciaCardiaca ?? null,
    glicemia: v.glicemia ?? null,
    humor: v.humor ?? null,
    observacao: v.observacao ?? null,
    origem: v.origem ?? "whatsapp",
  };

  const [linha] = await db
    .insert(pulsoDiarioTable)
    .values(valores)
    .onConflictDoUpdate({
      target: [pulsoDiarioTable.clienteId, pulsoDiarioTable.data, pulsoDiarioTable.periodo],
      set: {
        energia: valores.energia,
        disposicao: valores.disposicao,
        sono: valores.sono,
        pressaoSistolica: valores.pressaoSistolica,
        pressaoDiastolica: valores.pressaoDiastolica,
        frequenciaCardiaca: valores.frequenciaCardiaca,
        glicemia: valores.glicemia,
        humor: valores.humor,
        observacao: valores.observacao,
        origem: valores.origem,
        updatedAt: new Date(),
      },
    })
    .returning();

  res.status(201).json({
    ...linha,
    createdAt: linha.createdAt.toISOString(),
    updatedAt: linha.updatedAt.toISOString(),
  });
});

// Envia ao cliente, pelo Telegram, o botão que abre o mini aplicativo do pulso. Só envio; nada é gravado.
router.post("/pulso-diario/:clientId/enviar-telegram", async (req, res): Promise<void> => {
  const clientId = Number(req.params.clientId);
  if (!Number.isInteger(clientId)) { res.status(400).json({ error: "clientId inválido" }); return; }
  const [c] = await db.select({ nome: clientsTable.name, chat: clientsTable.telegramChatId })
    .from(clientsTable).where(eq(clientsTable.id, clientId));
  if (!c) { res.status(404).json({ error: "cliente não encontrado" }); return; }
  if (!c.chat) { res.status(409).json({ error: "cliente sem Telegram vinculado" }); return; }
  const dominio = process.env["PULSO_MINIAPP_DOMINIO"] || (process.env["REPLIT_DOMAINS"] ?? "").split(",")[0];
  if (!dominio) { res.status(503).json({ error: "domínio público indisponível" }); return; }
  const primeiro = c.nome.trim().split(/\s+/)[0] ?? "";
  const nome = primeiro ? primeiro.charAt(0).toUpperCase() + primeiro.slice(1).toLowerCase() : "";
  const r = await sendTelegramBotaoWebApp(
    c.chat,
    `Olá${nome ? `, ${nome}` : ""}. Toque no botão abaixo para registrar como você está agora: energia, disposição, pressão e frequência. Leva menos de um minuto.`,
    { texto: "Registrar meu pulso", url: `https://${dominio}/pulso-telegram` },
  );
  if (!r.sent) { res.status(502).json({ error: r.error ?? "falha no envio" }); return; }
  res.json({ enviado: true, simulado: r.mock });
});

// ── Área do cliente (token do portal) ───────────────────────────────────────
// Leitura: aceita também a prévia do administrador. Escrita: SOMENTE o próprio cliente, só no dia de hoje (BRT),
// e só os campos enviados são gravados (os já registrados no mesmo período são preservados).
const tokenDe = (req: { headers: { authorization?: string } }): string | null => {
  const a = req.headers.authorization;
  return a && a.startsWith("Bearer ") ? a.slice(7) : null;
};

router.get("/area-paciente/pulso-diario", async (req, res): Promise<void> => {
  const t = tokenDe(req);
  const clientId = t ? verifyPortalToken(t) : null;
  if (clientId === null) { res.status(401).json({ error: "Sessão expirada. Identifique-se novamente." }); return; }
  const dias = Math.min(Math.max(Number(req.query["dias"]) || 60, 1), 90);
  const [ano, mes, dia] = brtISODate().split("-").map(Number);
  const desde = new Date(Date.UTC(ano!, mes! - 1, dia! - dias)).toISOString().slice(0, 10);
  const linhas = await db.select().from(pulsoDiarioTable)
    .where(and(eq(pulsoDiarioTable.clienteId, clientId), gte(pulsoDiarioTable.data, desde)))
    .orderBy(desc(pulsoDiarioTable.data));
  res.json({
    hoje: brtISODate(),
    periodoAgora: periodoDaHora(Number(parseBrtParts().hour)),
    registros: linhas.map((l) => ({ ...l, createdAt: l.createdAt.toISOString(), updatedAt: l.updatedAt.toISOString() })),
  });
});

function periodoDaHora(h: number): (typeof PERIODOS)[number] {
  return h < 12 ? "manha" : h < 18 ? "tarde" : "noite";
}

const autoRegistroSchema = z.object({
  periodo: z.enum(PERIODOS).optional(),
  energia: z.number().int().min(0).max(10).nullable().optional(),
  disposicao: z.number().int().min(0).max(10).nullable().optional(),
  sono: z.number().int().min(0).max(10).nullable().optional(),
  pressaoSistolica: z.number().int().min(50).max(300).nullable().optional(),
  pressaoDiastolica: z.number().int().min(30).max(200).nullable().optional(),
  frequenciaCardiaca: z.number().int().min(20).max(300).nullable().optional(),
  glicemia: z.number().int().min(20).max(800).nullable().optional(),
}).strict();

router.post("/area-paciente/pulso-diario", async (req, res): Promise<void> => {
  const t = tokenDe(req);
  const clientId = t ? verifyPatientToken(t) : null;
  if (clientId === null) { res.status(401).json({ error: "Sessão expirada. Identifique-se novamente." }); return; }
  const p = autoRegistroSchema.safeParse(req.body);
  if (!p.success) { res.status(400).json({ error: "Confira os números digitados." }); return; }
  const v = p.data;
  const campos = ["energia", "disposicao", "sono", "pressaoSistolica", "pressaoDiastolica", "frequenciaCardiaca", "glicemia"] as const;
  const enviados = campos.filter((c) => v[c] != null);
  if (enviados.length === 0) { res.status(400).json({ error: "Preencha pelo menos uma medida." }); return; }
  if ((v.pressaoSistolica != null) !== (v.pressaoDiastolica != null)) {
    res.status(400).json({ error: "Informe os dois números da pressão (máxima e mínima)." }); return;
  }
  if (v.pressaoSistolica != null && v.pressaoDiastolica != null && v.pressaoDiastolica >= v.pressaoSistolica) {
    res.status(400).json({ error: "A pressão mínima deve ser menor que a máxima." }); return;
  }
  const data = brtISODate();
  const periodo = v.periodo ?? periodoDaHora(Number(parseBrtParts().hour));
  const [atual] = await db.select().from(pulsoDiarioTable)
    .where(and(eq(pulsoDiarioTable.clienteId, clientId), eq(pulsoDiarioTable.data, data), eq(pulsoDiarioTable.periodo, periodo)));
  const novo = (c: (typeof campos)[number]) => (v[c] != null ? v[c]! : (atual?.[c] ?? null));
  const valores = {
    clienteId: clientId, data, periodo,
    energia: novo("energia"), disposicao: novo("disposicao"), sono: novo("sono"),
    pressaoSistolica: novo("pressaoSistolica"), pressaoDiastolica: novo("pressaoDiastolica"),
    frequenciaCardiaca: novo("frequenciaCardiaca"), glicemia: novo("glicemia"),
    humor: atual?.humor ?? null, observacao: atual?.observacao ?? null,
    origem: atual && atual.origem !== "app" ? atual.origem : "app",
  };
  await db.insert(pulsoDiarioTable).values(valores).onConflictDoUpdate({
    target: [pulsoDiarioTable.clienteId, pulsoDiarioTable.data, pulsoDiarioTable.periodo],
    set: { ...valores, updatedAt: new Date() },
  });
  res.status(201).json({ ok: true, data, periodo });
});

export default router;
