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
import { getCertInfo } from "../lib/pdf-signer.js";
import {
  db,
  receitasAgendadasTable,
  receitasAgendadasSlotsTable,
  clientsTable,
  protocolsTable,
  professionalsTable,
  locationsTable,
} from "@workspace/db";
import { eq, and, lte, gte, desc, asc } from "drizzle-orm";
import { liberarSlot, processarReceituarioDiario } from "../lib/receituario-worker";
import { generateReceituarioPdf, generateReceituarioPdfV2, generatePdfFromPngBase64, type ReceituarioDataV2 } from "../lib/receituario-pdf";
import { uploadToFolderById } from "../lib/google-drive";
import { sendGmailMessage } from "../lib/google-gmail";
import { buildPrescricaoHtml } from "../lib/receituario-html";
import { htmlToPngBase64 } from "../lib/puppeteer-capture";
// ── MOTOR ÚNICO: todas as novas emissões passam por aqui ────────────────────
import { emitirReceituarioPdf, garantirTabelaTokens } from "../lib/receituario-motor.js";
import { sql } from "drizzle-orm";
import { moduleGuard } from "../middleware/moduleGuard";

const router = Router();
router.use(moduleGuard("protocolos"));

// ── ROTA PÚBLICA — consulta de receituário por token (sem autenticação) ──────
// GET /api/receituario/consulta?token=12C9AA79
// Usada pela página /consulta-receituario (QR code da receita aponta para ela)
router.get("/receituario/consulta", async (req, res): Promise<void> => {
  const { token } = req.query;
  if (!token || typeof token !== "string") {
    res.status(400).json({ error: "Parâmetro token obrigatório" });
    return;
  }
  try {
    await garantirTabelaTokens();
    const rows = await db.execute(sql`
      SELECT token, paciente, medico, crm, clinica, data_emissao, arquivo, drive_url
      FROM receituario_tokens
      WHERE token = ${token.toUpperCase().trim()}
      LIMIT 1
    `);
    const row = (rows as unknown as { rows: Record<string, unknown>[] }).rows?.[0]
      ?? (Array.isArray(rows) ? rows[0] : null);

    if (!row) {
      res.status(404).json({ error: "Documento não encontrado" });
      return;
    }
    let certMeta = null;
    try {
      const info = getCertInfo();
      const cnFull = info.subject.split(",").find((p: string) => p.trim().startsWith("CN="))?.replace(/CN=/, "").trim() ?? "";
      const titular = cnFull.split(":")[0].trim();
      const issuerCN = info.issuer.split(",").find((p: string) => p.trim().startsWith("CN="))?.replace(/CN=/, "").trim() ?? info.issuer;
      certMeta = {
        titular,
        cpf: info.cpf,
        serial: ("00" + info.serial).slice(-20).toUpperCase(),
        validFrom: info.validFrom,
        validTo:   info.validTo,
        issuer:    issuerCN,
        algoritmo: "SHA-256 com RSA (2048 bits)",
        padrao:    "PAdES — PDF Advanced Electronic Signatures",
        tipo:      "Certificado Digital A1",
        raiz:      "ICP-Brasil (ITI — Instituto de Tecnologia da Informação)",
      };
    } catch { /* best-effort: cert metadata não bloqueia validação */ }

    res.json({
      paciente:    row.paciente,
      medico:      row.medico,
      crm:         row.crm,
      clinica:     row.clinica,
      dataEmissao: row.data_emissao,
      arquivo:     row.arquivo,
      driveUrl:    row.drive_url ?? null,
      certMeta,
    });
  } catch (e) {
    req.log.error({ err: e instanceof Error ? e.message : String(e) }, "receituario/consulta: erro");
    res.status(500).json({ error: "Erro interno" });
  }
});

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

// ── POST /api/receituario/gerar-demo ─────────────────────────────────────────
// MOTOR ÚNICO — gera receita de demonstração usando o modelo ativo do banco.
router.post("/receituario/gerar-demo", async (req, res): Promise<void> => {
  try {
    const { modeloId } = req.body ?? {};
    const result = await emitirReceituarioPdf({
      patient: {
        nome: "DEMONSTRAÇÃO — SEM VALIDADE MÉDICA",
        cpf: "000.000.000-00",
        dataNascimento: "1985-01-01",
        endereco: "Av. Paulista, 1000 — São Paulo / SP",
      },
      formulas: [
        {
          nome: "EXEMPLO DE MEDICAMENTO A 150 mg — Cápsula Manipulada",
          ativos: "Substância Demonstrativa A 150mg",
          posologia: "1 cápsula ao dia em jejum",
          via: "Oral",
          forma: "Cápsula — 30 unidades",
          dose: "150mg",
        },
        {
          nome: "EXEMPLO DE MEDICAMENTO B 50 mg — Comprimido",
          ativos: "Substância Demonstrativa B 50mg",
          posologia: "1 comprimido à noite",
          via: "Oral",
          forma: "Comprimido — 30 unidades",
          dose: "50mg",
        },
      ],
      tipoReceita: "especial",
      modeloId: modeloId ?? undefined,
      driveFolder: DEMO_DRIVE_FOLDER_ID,
    });
    res.json({
      ok: true,
      fileName: result.fileName,
      driveUrl: result.driveUrl,
      driveId: result.driveId,
      modeloUsado: result.modeloUsado,
      tipoMotor: result.tipoMotor,
      pdfSizeBytes: result.pdf.length,
    });
  } catch (err) {
    req.log.error({ err }, "receituario gerar-demo: falhou");
    res.status(500).json({ error: "Falha ao gerar receita demo" });
  }
});

// ── POST /api/receituario/emitir-prescricao ──────────────────────────────────
// MOTOR ÚNICO — wrapper que delega para emitirReceituarioPdf().
// Aceita: { patient, formulas, tipoReceita?, modeloId? }
// O modelo ativo (faixas_paxter ou classico_anvisa) é lido do banco automaticamente.
router.post("/receituario/emitir-prescricao", async (req, res): Promise<void> => {
  try {
    const { patient, formulas, tipoReceita = "especial", modeloId } = req.body ?? {};

    if (!patient?.nome?.trim() || !Array.isArray(formulas) || formulas.length === 0) {
      res.status(400).json({ error: "patient.nome e formulas[] são obrigatórios" });
      return;
    }

    const emailTo: string[] = ["drcaiohenriquepadua@gmail.com"];
    if (patient.email && typeof patient.email === "string") emailTo.push(patient.email);

    const result = await emitirReceituarioPdf({
      patient,
      formulas,
      tipoReceita: tipoReceita as "especial" | "simples",
      modeloId: modeloId ?? undefined,
      driveFolder: DEMO_DRIVE_FOLDER_ID,
      emailTo,
    });

    res.json({
      ok: true,
      pdfBase64: Buffer.from(result.pdf).toString("base64"),
      fileName: result.fileName,
      driveUrl: result.driveUrl,
      driveId: result.driveId,
      emailSent: result.emailSent,
      modeloUsado: result.modeloUsado,
      tipoMotor: result.tipoMotor,
    });
  } catch (err) {
    req.log.error({ err }, "emitir-prescricao: erro geral");
    res.status(500).json({ error: "Falha ao gerar receituário" });
  }
});

// ── POST /api/receituario/assinar-imagem-pdf ──────────────────────────────────
// Recebe PNG base64 capturado pelo html2canvas do motor ReceituarioPreview.
// Cria PDF A4 a partir do PNG, assina ICP-Brasil, sobe ao Drive e envia e-mail.
router.post("/receituario/assinar-imagem-pdf", async (req, res): Promise<void> => {
  try {
    const { pngBase64, patientName, fileName, patientEmail } = req.body ?? {};

    if (!pngBase64 || typeof pngBase64 !== "string") {
      res.status(400).json({ error: "pngBase64 é obrigatório" });
      return;
    }
    if (!patientName || typeof patientName !== "string") {
      res.status(400).json({ error: "patientName é obrigatório" });
      return;
    }

    // Auto-carrega Dr. Caio (id=6) para o nome na assinatura
    const [medico] = await db.select().from(professionalsTable).where(eq(professionalsTable.id, 6));
    const profName = medico?.name ?? "Dr. Caio Henrique Fernandes Pádua";

    // Gera PDF assinado a partir do PNG do motor HTML
    const pdfBytes = await generatePdfFromPngBase64(pngBase64, profName);

    // Nome do arquivo padrão
    const dataHoje = hoje();
    const [y, m, d] = dataHoje.split("-");
    const slug = patientName
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9 ]/g, "").trim().toUpperCase().slice(0, 28);
    const safeFileName = fileName ?? `${y.slice(2)}.${m}.${d} RECEITUARIO ${slug}.pdf`;

    // ── Upload Drive ────────────────────────────────────────────────────────
    const DRIVE_FOLDER = "1v1eNJeRUBSR5wBucuBLnzkpGKHsrlnep";
    let driveUrl: string | null = null;
    let driveId: string | null = null;
    try {
      const result = await uploadToFolderById(
        DRIVE_FOLDER, safeFileName, "application/pdf", Buffer.from(pdfBytes),
      );
      driveUrl = result.webViewLink ?? null;
      driveId  = result.id ?? null;
    } catch (driveErr) {
      req.log.warn({ driveErr }, "assinar-imagem-pdf: Drive upload falhou");
    }

    // ── E-mail ──────────────────────────────────────────────────────────────
    let emailSent = false;
    try {
      const emailHtml = `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden">
          <div style="background:#16284a;padding:20px 24px;text-align:center">
            <h1 style="color:#c9a24e;margin:0;font-size:24px;letter-spacing:2px">PAXTER</h1>
            <p style="color:#45B8CC;margin:4px 0 0;font-size:13px">Motor Clínico — Receituário Assinado</p>
          </div>
          <div style="padding:24px;background:#f8fafc">
            <h2 style="color:#16284a;margin-top:0">Receituário Gerado</h2>
            <table style="width:100%;border-collapse:collapse;font-size:14px">
              <tr><td style="padding:6px 0;color:#64748b;width:130px">Paciente</td><td style="padding:6px 0;font-weight:600;color:#1e293b">${patientName}</td></tr>
              <tr><td style="padding:6px 0;color:#64748b">Médico</td><td style="padding:6px 0;color:#1e293b">${profName}</td></tr>
              <tr><td style="padding:6px 0;color:#64748b">Data</td><td style="padding:6px 0;color:#1e293b">${d}/${m}/${y}</td></tr>
              <tr><td style="padding:6px 0;color:#64748b">Arquivo</td><td style="padding:6px 0;color:#1e293b">${safeFileName}</td></tr>
            </table>
            ${driveUrl ? `<p style="margin-top:16px"><a href="${driveUrl}" style="background:#45B8CC;color:#fff;padding:8px 16px;border-radius:4px;text-decoration:none;font-weight:600">Ver no Google Drive</a></p>` : ""}
            <p style="color:#64748b;font-size:12px;margin-top:16px">PDF gerado pelo motor visual completo (ReceituarioPreview + arabescos) — captura fiel do layout exibido na tela.</p>
          </div>
          <div style="background:#16284a;padding:12px 24px;text-align:center">
            <p style="color:#45B8CC;font-size:11px;margin:0">Documento assinado digitalmente via ICP-Brasil/PAdES — PAXTER Clinical Intelligence System</p>
          </div>
        </div>
      `;
      const toAddresses = ["drcaiohenriquepadua@gmail.com"];
      if (patientEmail && typeof patientEmail === "string") toAddresses.push(patientEmail);

      const mailResult = await sendGmailMessage({
        to: toAddresses.join(", "),
        subject: `PAXTER | Receituário | ${patientName} | ${d}/${m}/${y}`,
        html: emailHtml,
        attachments: [{
          filename: safeFileName,
          content:  Buffer.from(pdfBytes),
          contentType: "application/pdf",
        }],
      });
      emailSent = mailResult.success;
      if (!mailResult.success) req.log.warn({ mailResult }, "assinar-imagem-pdf: e-mail falhou");
    } catch (emailErr) {
      req.log.warn({ emailErr }, "assinar-imagem-pdf: e-mail excecao");
    }

    res.json({ ok: true, fileName: safeFileName, driveUrl, driveId, emailSent });
  } catch (err) {
    req.log.error({ err }, "assinar-imagem-pdf: erro geral");
    res.status(500).json({ error: "Falha ao assinar o receituário" });
  }
});

// ── GET /api/receituario/preview-html ─────────────────────────────────────────
// Serve o HTML da receita diretamente para inspeção visual (dev only)
router.get("/receituario/preview-html", async (req, res): Promise<void> => {
  try {
    const clientId = Number(req.query.clientId ?? 11);
    const [cliente] = await db.select().from(clientsTable).where(eq(clientsTable.id, clientId));
    const [medico]  = await db.select().from(professionalsTable).where(eq(professionalsTable.id, 6));
    const [clinica] = await db.select().from(locationsTable).where(eq(locationsTable.id, 8));

    const assetsBaseUrl = "http://localhost:80/padcom";
    const dataEmissao   = new Date().toISOString().slice(0, 10);
    const crmRqe = (medico as any)?.crm ?? "CRM SP 123456";

    const html = buildPrescricaoHtml({
      medicoNome: medico?.name ?? "Dr. Caio Henrique Fernandes Pádua",
      medicoCrm:  crmRqe,
      clinicaNome: clinica?.name ?? "Instituto Padua",
      clinicaEndereco: (clinica as any)?.address ?? "Av. Brigadeiro Faria Lima, 3000 — São Paulo / SP",
      pacienteNome: cliente?.name ?? "CARLUCIA SANTOS FERNANDES",
      pacienteCpf:  cliente?.cpf ?? "024.862.801-11",
      pacienteNascimento: "30/01/1988",
      pacienteTelefone:   cliente?.phone ?? "(62) 98269-6656",
      pacienteEndereco:   cliente?.address ?? "Rua Guaxupé, 327, Vila Formosa, São Paulo - SP",
      formulas: [{
        numero: 1,
        nome: "Bupropiona + Topiramato Manipulado",
        ativos: "Cloridrato de Bupropiona 150mg\nCloridrato de Topiramato 50mg",
        posologia: "1 cápsula via oral pela manhã em jejum",
        via: "Oral", forma: "Cápsula Manipulada — 30 unidades",
      }],
      tipoReceita: "especial",
      dataEmissao,
      assetsBaseUrl,
    });

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html);
  } catch (err) {
    res.status(500).json({ error: String((err as Error).message) });
  }
});

// ── POST /api/receituario/emitir-cliente ──────────────────────────────────────
// MOTOR ÚNICO — lookup de dados do cliente no banco + delega para emitirReceituarioPdf().
// Aceita: { clientId, formulas[], tipoReceita?, modeloId?, driveFolder? }
// Também aceita: { patient: {...}, formulas[], ... } sem clientId (compatibilidade)
router.post("/receituario/emitir-cliente", async (req, res): Promise<void> => {
  try {
    const { clientId, patient: patientRaw, formulas, tipoReceita = "especial", modeloId, driveFolder } = req.body ?? {};

    if (!Array.isArray(formulas) || formulas.length === 0) {
      res.status(400).json({ error: "formulas[] obrigatório e não-vazio" });
      return;
    }

    // ── Resolve dados do paciente (por clientId OU por patient direto) ────────
    let patientData: { nome: string; cpf?: string; dataNascimento?: string; telefone?: string; endereco?: string; email?: string };
    let resolvedDriveFolder: string = driveFolder ?? DEMO_DRIVE_FOLDER_ID;

    if (clientId) {
      const [cliente] = await db.select().from(clientsTable).where(eq(clientsTable.id, Number(clientId)));
      if (!cliente) { res.status(404).json({ error: "Cliente não encontrado" }); return; }

      patientData = {
        nome:           cliente.name,
        cpf:            cliente.cpf ?? undefined,
        dataNascimento: cliente.birthDate as string ?? undefined,
        telefone:       cliente.phone ?? undefined,
        endereco:       cliente.address ?? undefined,
        email:          cliente.email ?? undefined,
      };

      // Prefere pasta PRESCRICOES do cliente; fallback → pasta geral
      const fichaClinica = (cliente as any).fichaClinica ?? {};
      resolvedDriveFolder =
        fichaClinica?.drive_subpastas?.["03 PRESCRICOES/RECEITAS"] ??
        fichaClinica?.drive_subpastas?.["03 PRESCRICOES"] ??
        driveFolder ??
        DEMO_DRIVE_FOLDER_ID;
    } else if (patientRaw?.nome?.trim()) {
      patientData = patientRaw;
    } else {
      res.status(400).json({ error: "clientId ou patient.nome é obrigatório" });
      return;
    }

    const emailTo: string[] = ["drcaiohenriquepadua@gmail.com"];
    if (patientData.email) emailTo.push(patientData.email);

    req.log.info({ clientId, modeloId, tipoReceita }, "emitir-cliente: delegando ao motor único");

    const result = await emitirReceituarioPdf({
      patient:     patientData,
      formulas,
      tipoReceita: tipoReceita as "especial" | "simples",
      modeloId:    modeloId ?? undefined,
      driveFolder: resolvedDriveFolder,
      emailTo,
    });

    req.log.info({ fileName: result.fileName, driveUrl: result.driveUrl, tipoMotor: result.tipoMotor }, "emitir-cliente: OK");

    res.json({
      ok:          true,
      pdfBase64:   Buffer.from(result.pdf).toString("base64"),
      fileName:    result.fileName,
      driveUrl:    result.driveUrl,
      driveId:     result.driveId,
      emailSent:   result.emailSent,
      modeloUsado: result.modeloUsado,
      tipoMotor:   result.tipoMotor,
    });
  } catch (err) {
    req.log.error({ err }, "emitir-cliente: erro geral");
    res.status(500).json({ error: "Falha ao emitir receita do cliente" });
  }
});

export default router;
