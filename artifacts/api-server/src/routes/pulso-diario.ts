import { Router, type IRouter } from "express";
import { and, desc, eq, gte } from "drizzle-orm";
import { z } from "zod/v4";
import { db, pulsoDiarioTable, clientsTable } from "@workspace/db";

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

export default router;
