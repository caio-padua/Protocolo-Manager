/**
 * RECEITUÁRIO AUTOMÁTICO — Agendamento de Fórmulas Magistrais
 *
 * GET  /api/receituario/agendas              — lista agendas (filter: clientId)
 * POST /api/receituario/agendas              — cria agenda
 * GET  /api/receituario/agendas/:id          — detalhe com slots
 * PUT  /api/receituario/agendas/:id          — edita agenda
 * DELETE /api/receituario/agendas/:id        — desativa agenda (soft)
 * GET  /api/receituario/agendas/:id/slots    — lista slots
 * POST /api/receituario/agendas/:id/slots    — adiciona slot
 * PUT  /api/receituario/slots/:id            — edita slot
 * DELETE /api/receituario/slots/:id          — remove slot
 * POST /api/receituario/slots/:id/liberar    — liberação manual de um slot
 * POST /api/receituario/processar            — worker diário (libera vencidos)
 * GET  /api/receituario/alertas              — slots próximos (Cockpit)
 */
import { Router } from "express";
import {
  db,
  receitasAgendadasTable,
  receitasAgendadasSlotsTable,
  clientsTable,
  protocolsTable,
  professionalsTable,
} from "@workspace/db";
import { eq, and, lte, gte, desc, asc } from "drizzle-orm";
import { liberarSlot, processarReceituarioDiario } from "../lib/receituario-worker";
import { generateReceituarioPdf } from "../lib/receituario-pdf";
import { uploadToFolderById } from "../lib/google-drive";

const router = Router();

// ── helpers ─────────────────────────────────────────────────────────────────

function hoje(): string {
  const now = new Date();
  const brt = new Date(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  return brt.toISOString().split("T")[0];
}

function addDias(dataYMD: string, n: number): string {
  const d = new Date(dataYMD + "T12:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().split("T")[0];
}

function fmtBR(dataYMD: string | null | undefined): string {
  if (!dataYMD) return "—";
  const [y, m, d] = dataYMD.split("-");
  return `${d}/${m}/${y}`;
}

// ── AGENDAS ─────────────────────────────────────────────────────────────────

// GET /api/receituario/agendas
router.get("/receituario/agendas", async (req, res): Promise<void> => {
  const clientId = req.query.clientId ? parseInt(req.query.clientId as string, 10) : undefined;

  try {
    const rows = await db
      .select()
      .from(receitasAgendadasTable)
      .where(clientId ? eq(receitasAgendadasTable.clientId, clientId) : undefined)
      .orderBy(desc(receitasAgendadasTable.createdAt));

    // Para cada agenda, conta slots
    const agendas = await Promise.all(
      rows.map(async (a) => {
        const slots = await db
          .select()
          .from(receitasAgendadasSlotsTable)
          .where(eq(receitasAgendadasSlotsTable.agendaId, a.id))
          .orderBy(asc(receitasAgendadasSlotsTable.numeroSequencia));

        const aguardando = slots.filter((s) => s.status === "AGUARDANDO").length;
        const liberados  = slots.filter((s) => s.status === "LIBERADA" || s.status === "ENTREGUE").length;
        const erros      = slots.filter((s) => s.status === "ERRO").length;

        // Próxima liberação
        const proxima = slots
          .filter((s) => s.status === "AGUARDANDO")
          .sort((a, b) => a.dataLiberacao.localeCompare(b.dataLiberacao))[0];

        return {
          ...a,
          slots,
          resumo: { total: slots.length, aguardando, liberados, erros },
          proximaLiberacao: proxima?.dataLiberacao ?? null,
          proximaNome: proxima?.nome ?? null,
        };
      }),
    );

    res.json({ agendas });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /api/receituario/agendas
router.post("/receituario/agendas", async (req, res): Promise<void> => {
  const {
    clientId, protocolId, nome, descricao,
    frequenciaPadraoDias, diasAntecedencia,
    canaisPadrao, incluirLembretePosologia,
  } = req.body;

  if (!clientId || !nome) {
    res.status(400).json({ error: "clientId e nome são obrigatórios" });
    return;
  }

  try {
    const [agenda] = await db
      .insert(receitasAgendadasTable)
      .values({
        clientId,
        protocolId: protocolId || null,
        nome,
        descricao: descricao || null,
        frequenciaPadraoDias: frequenciaPadraoDias ?? 30,
        diasAntecedencia: diasAntecedencia ?? 5,
        canaisPadrao: canaisPadrao ?? ["email", "whatsapp", "portal"],
        incluirLembretePosologia: incluirLembretePosologia ?? true,
      })
      .returning();

    res.status(201).json({ agenda });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /api/receituario/agendas/:id
router.get("/receituario/agendas/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  try {
    const [agenda] = await db
      .select()
      .from(receitasAgendadasTable)
      .where(eq(receitasAgendadasTable.id, id))
      .limit(1);

    if (!agenda) { res.status(404).json({ error: "Agenda não encontrada" }); return; }

    const slots = await db
      .select()
      .from(receitasAgendadasSlotsTable)
      .where(eq(receitasAgendadasSlotsTable.agendaId, id))
      .orderBy(asc(receitasAgendadasSlotsTable.numeroSequencia));

    const [client] = await db
      .select({ id: clientsTable.id, name: clientsTable.name, email: clientsTable.email, phone: clientsTable.phone })
      .from(clientsTable)
      .where(eq(clientsTable.id, agenda.clientId))
      .limit(1);

    let protocol = null;
    if (agenda.protocolId) {
      const [p] = await db
        .select({ id: protocolsTable.id, title: protocolsTable.title })
        .from(protocolsTable)
        .where(eq(protocolsTable.id, agenda.protocolId))
        .limit(1);
      protocol = p ?? null;
    }

    res.json({ agenda, slots, client, protocol });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// PUT /api/receituario/agendas/:id
router.put("/receituario/agendas/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const {
    nome, descricao, ativo,
    frequenciaPadraoDias, diasAntecedencia,
    canaisPadrao, incluirLembretePosologia,
  } = req.body;

  try {
    const patch: Record<string, unknown> = {};
    if (nome !== undefined)                      patch.nome = nome;
    if (descricao !== undefined)                 patch.descricao = descricao;
    if (ativo !== undefined)                     patch.ativo = ativo;
    if (frequenciaPadraoDias !== undefined)      patch.frequenciaPadraoDias = frequenciaPadraoDias;
    if (diasAntecedencia !== undefined)          patch.diasAntecedencia = diasAntecedencia;
    if (canaisPadrao !== undefined)              patch.canaisPadrao = canaisPadrao;
    if (incluirLembretePosologia !== undefined)  patch.incluirLembretePosologia = incluirLembretePosologia;

    const [updated] = await db
      .update(receitasAgendadasTable)
      .set(patch as never)
      .where(eq(receitasAgendadasTable.id, id))
      .returning();

    res.json({ agenda: updated });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// DELETE /api/receituario/agendas/:id  (soft delete)
router.delete("/receituario/agendas/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  try {
    await db
      .update(receitasAgendadasTable)
      .set({ ativo: false } as never)
      .where(eq(receitasAgendadasTable.id, id));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── SLOTS ────────────────────────────────────────────────────────────────────

// GET /api/receituario/agendas/:id/slots
router.get("/receituario/agendas/:id/slots", async (req, res): Promise<void> => {
  const agendaId = parseInt(req.params.id, 10);
  try {
    const slots = await db
      .select()
      .from(receitasAgendadasSlotsTable)
      .where(eq(receitasAgendadasSlotsTable.agendaId, agendaId))
      .orderBy(asc(receitasAgendadasSlotsTable.numeroSequencia));
    res.json({ slots });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /api/receituario/agendas/:id/slots
router.post("/receituario/agendas/:id/slots", async (req, res): Promise<void> => {
  const agendaId = parseInt(req.params.id, 10);
  const {
    nome, dataLiberacao, formulas,
    canais, diasAntecedenciaOverride,
  } = req.body;

  if (!nome || !dataLiberacao) {
    res.status(400).json({ error: "nome e dataLiberacao são obrigatórios" });
    return;
  }

  try {
    // Busca agenda para clientId
    const [agenda] = await db
      .select()
      .from(receitasAgendadasTable)
      .where(eq(receitasAgendadasTable.id, agendaId))
      .limit(1);

    if (!agenda) { res.status(404).json({ error: "Agenda não encontrada" }); return; }

    // Número de sequência = max atual + 1
    const existentes = await db
      .select({ n: receitasAgendadasSlotsTable.numeroSequencia })
      .from(receitasAgendadasSlotsTable)
      .where(eq(receitasAgendadasSlotsTable.agendaId, agendaId));
    const maxSeq = existentes.reduce((max, r) => Math.max(max, r.n), 0);

    const [slot] = await db
      .insert(receitasAgendadasSlotsTable)
      .values({
        agendaId,
        clientId: agenda.clientId,
        numeroSequencia: maxSeq + 1,
        nome,
        dataLiberacao,
        formulas: formulas ?? [],
        canais: canais ?? null,
        diasAntecedenciaOverride: diasAntecedenciaOverride ?? null,
        status: "AGUARDANDO",
      })
      .returning();

    res.status(201).json({ slot });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// PUT /api/receituario/slots/:id
router.put("/receituario/slots/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const {
    nome, dataLiberacao, formulas,
    canais, diasAntecedenciaOverride,
  } = req.body;

  try {
    const patch: Record<string, unknown> = {};
    if (nome !== undefined)                       patch.nome = nome;
    if (dataLiberacao !== undefined)              patch.dataLiberacao = dataLiberacao;
    if (formulas !== undefined)                   patch.formulas = formulas;
    if (canais !== undefined)                     patch.canais = canais;
    if (diasAntecedenciaOverride !== undefined)   patch.diasAntecedenciaOverride = diasAntecedenciaOverride;

    const [updated] = await db
      .update(receitasAgendadasSlotsTable)
      .set(patch as never)
      .where(eq(receitasAgendadasSlotsTable.id, id))
      .returning();

    res.json({ slot: updated });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// DELETE /api/receituario/slots/:id
router.delete("/receituario/slots/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  try {
    await db
      .delete(receitasAgendadasSlotsTable)
      .where(eq(receitasAgendadasSlotsTable.id, id));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /api/receituario/slots/:id/liberar  (liberação manual)
router.post("/receituario/slots/:id/liberar", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  try {
    await liberarSlot(id);
    const [slot] = await db
      .select()
      .from(receitasAgendadasSlotsTable)
      .where(eq(receitasAgendadasSlotsTable.id, id))
      .limit(1);
    res.json({ slot, ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── WORKER DIÁRIO ─────────────────────────────────────────────────────────────

// POST /api/receituario/processar  (delega ao worker — mesmo motor do cron 06:00)
router.post("/receituario/processar", async (_req, res): Promise<void> => {
  try {
    const resultado = await processarReceituarioDiario();
    res.json({ ok: true, ...resultado });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── ALERTAS (Cockpit) ─────────────────────────────────────────────────────────

// GET /api/receituario/alertas?dias=7
router.get("/receituario/alertas", async (req, res): Promise<void> => {
  const dias = parseInt((req.query.dias as string) ?? "7", 10);
  const hojeStr = hoje();
  const limite  = addDias(hojeStr, dias);

  try {
    // Slots AGUARDANDO com liberação entre hoje e D+N
    const slots = await db
      .select({
        id: receitasAgendadasSlotsTable.id,
        agendaId: receitasAgendadasSlotsTable.agendaId,
        clientId: receitasAgendadasSlotsTable.clientId,
        nome: receitasAgendadasSlotsTable.nome,
        dataLiberacao: receitasAgendadasSlotsTable.dataLiberacao,
        status: receitasAgendadasSlotsTable.status,
        formulas: receitasAgendadasSlotsTable.formulas,
        clientName: clientsTable.name,
        clientPhone: clientsTable.phone,
      })
      .from(receitasAgendadasSlotsTable)
      .innerJoin(clientsTable, eq(receitasAgendadasSlotsTable.clientId, clientsTable.id))
      .where(
        and(
          eq(receitasAgendadasSlotsTable.status, "AGUARDANDO"),
          gte(receitasAgendadasSlotsTable.dataLiberacao, hojeStr),
          lte(receitasAgendadasSlotsTable.dataLiberacao, limite),
        ),
      )
      .orderBy(asc(receitasAgendadasSlotsTable.dataLiberacao));

    // Slots AGUARDANDO vencidos (atrasados)
    const atrasados = await db
      .select({
        id: receitasAgendadasSlotsTable.id,
        agendaId: receitasAgendadasSlotsTable.agendaId,
        clientId: receitasAgendadasSlotsTable.clientId,
        nome: receitasAgendadasSlotsTable.nome,
        dataLiberacao: receitasAgendadasSlotsTable.dataLiberacao,
        status: receitasAgendadasSlotsTable.status,
        formulas: receitasAgendadasSlotsTable.formulas,
        clientName: clientsTable.name,
        clientPhone: clientsTable.phone,
      })
      .from(receitasAgendadasSlotsTable)
      .innerJoin(clientsTable, eq(receitasAgendadasSlotsTable.clientId, clientsTable.id))
      .where(
        and(
          eq(receitasAgendadasSlotsTable.status, "AGUARDANDO"),
          lte(receitasAgendadasSlotsTable.dataLiberacao, hojeStr),
        ),
      )
      .orderBy(asc(receitasAgendadasSlotsTable.dataLiberacao));

    res.json({
      hoje: hojeStr,
      proximosDias: dias,
      slots: slots.map((s) => ({ ...s, dataFormatada: fmtBR(s.dataLiberacao) })),
      atrasados: atrasados.map((s) => ({ ...s, dataFormatada: fmtBR(s.dataLiberacao) })),
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── P7: Gerar receita demo assinada + upload ao Drive ─────────────────────────
const DEMO_DRIVE_FOLDER_ID = "1v1eNJeRUBSR5wBucuBLnzkpGKHsrlnep"; // pasta PAXTER compartilhada

router.post("/receituario/gerar-demo", async (req, res): Promise<void> => {
  try {
    const { professionalId, locationId } = req.body as {
      professionalId?: number;
      locationId?: number;
    };

    // Busca dados do profissional
    let profName = "Dr. Caio Henrique Fernandes Pádua";
    let profCrm = "CRM SP 123456";
    if (professionalId) {
      const [prof] = await db
        .select()
        .from(professionalsTable)
        .where(eq(professionalsTable.id, professionalId));
      if (prof) {
        profName = prof.name;
        profCrm = prof.crm ?? "CRM SP 000000";
      }
    }

    const dataHoje = hoje();

    // Monta dados demo
    const demoData = {
      clientName: "DEMONSTRAÇÃO — SEM VALIDADE MÉDICA",
      clientCpf: "000.000.000-00",
      professionalName: profName,
      professionalCrm: profCrm,
      nomeSerie: "Receituário Demo / PADCOM",
      nomeSlot: `DEMO-${dataHoje}`,
      dataLiberacao: dataHoje,
      formulas: [
        {
          nome: "EXEMPLO DE MEDICAMENTO A 150 mg — comprimido",
          ativoPrincipal: "Substância Demonstrativa A",
          posologia: "1 comprimido ao dia",
          dose: "150 mg",
          via: "Oral",
          frequencia: "Diário",
          observacao: "Orientação demonstrativa — sem validade médica",
        },
        {
          nome: "EXEMPLO DE MEDICAMENTO B 50 mg — comprimido",
          ativoPrincipal: "Substância Demonstrativa B",
          posologia: "1 comprimido à noite",
          dose: "50 mg",
          via: "Oral",
          frequencia: "Noturno",
        },
      ],
    };

    // Gera PDF com assinatura ICP-Brasil
    const pdfBytes = await generateReceituarioPdf(demoData);

    // Nome do arquivo: YY.MM.DD RECEITUARIO DEMO PADCOM.pdf
    const [y, m, d] = dataHoje.split("-");
    const fileName = `${y.slice(2)}.${m}.${d} RECEITUARIO DEMO PADCOM.pdf`;

    // Faz upload ao Drive
    let driveUrl: string | null = null;
    let driveId: string | null = null;
    try {
      const result = await uploadToFolderById(
        DEMO_DRIVE_FOLDER_ID,
        fileName,
        "application/pdf",
        Buffer.from(pdfBytes),
      );
      driveUrl = result.webViewLink ?? null;
      driveId = result.id ?? null;
    } catch (driveErr) {
      req.log.warn({ driveErr }, "receituario gerar-demo: Drive upload falhou — devolvendo apenas OK");
    }

    res.json({ ok: true, fileName, driveUrl, driveId });
  } catch (err) {
    req.log.error({ err }, "receituario gerar-demo: falhou");
    res.status(500).json({ error: "Falha ao gerar receita demo" });
  }
});

export default router;
