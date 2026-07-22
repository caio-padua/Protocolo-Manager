// ─────────────────────────────────────────────────────────────────────────────
// MOTOR ÚNICO DE RECEITUÁRIO — fonte de verdade para TODAS as emissões
// Qualquer rota que gera PDF de receita chama emitirReceituarioPdf().
// Despacha para o motor correto com base no modelo ativo do banco.
// ─────────────────────────────────────────────────────────────────────────────
import { db, professionalsTable, locationsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { readCertMetaSync, type CertDocMeta } from "./cert-source.js";
import { buildPrescricaoHtml, type PrescricaoHtmlData } from "./receituario-html.js";
import { htmlToPngBase64 } from "./puppeteer-capture.js";
import { generatePdfFromPngBase64, generateReceituarioPdfV2, type ReceituarioDataV2 } from "./receituario-pdf.js";
import { uploadToFolderById } from "./google-drive.js";
import { sendGmailMessage } from "./google-gmail.js";
import { logger } from "./logger.js";

// ── Tipos públicos ────────────────────────────────────────────────────────────

export type TipoModelo = "faixas_paxter" | "classico_anvisa";

export interface ReceituarioModelo {
  id: number;
  nome: string;
  tipo: TipoModelo;
  config: Record<string, unknown>;
  ativo: boolean;
  criadoEm: string;
  atualizadoEm: string;
}

export interface FormulaEmissao {
  nome: string;
  ativos?: string;
  posologia: string;
  via?: string;
  forma?: string;
  dose?: string;
}

export interface EmitirParams {
  patient: {
    nome: string;
    cpf?: string;
    dataNascimento?: string;
    telefone?: string;
    endereco?: string;
    email?: string;
  };
  formulas: FormulaEmissao[];
  tipoReceita?: "especial" | "simples";
  modeloId?: number;
  driveFolder?: string;
  emailTo?: string | string[];
  assetsBaseUrl?: string;
}

export interface EmitirResult {
  pdf: Uint8Array;
  fileName: string;
  driveUrl: string | null;
  driveId: string | null;
  emailSent: boolean;
  modeloUsado: string;
  tipoMotor: TipoModelo;
}

// ── Helpers de data ───────────────────────────────────────────────────────────

function hoje(): string {
  const now = new Date();
  const brt = new Date(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  return brt.toISOString().split("T")[0];
}

function slugNome(nome: string): string {
  return nome
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9 ]/g, "").trim().toUpperCase().slice(0, 28);
}

// ── Acesso ao modelo ativo ────────────────────────────────────────────────────

export async function getModeloAtivo(modeloId?: number): Promise<ReceituarioModelo> {
  await garantirTabelaModelos();

  const rows = modeloId
    ? await db.execute(sql`SELECT * FROM receituario_modelos WHERE id = ${modeloId} LIMIT 1`)
    : await db.execute(sql`SELECT * FROM receituario_modelos WHERE ativo = TRUE LIMIT 1`);

  const row = (rows as unknown as { rows: Record<string, unknown>[] }).rows?.[0]
    ?? (Array.isArray(rows) ? rows[0] : null);

  if (!row) {
    return {
      id: 0,
      nome: "Faixas Paxter (padrão)",
      tipo: "faixas_paxter",
      config: {},
      ativo: true,
      criadoEm: new Date().toISOString(),
      atualizadoEm: new Date().toISOString(),
    };
  }

  return {
    id: Number(row.id),
    nome: String(row.nome),
    tipo: (row.tipo as TipoModelo) ?? "faixas_paxter",
    config: typeof row.config === "object" && row.config !== null ? (row.config as Record<string, unknown>) : {},
    ativo: Boolean(row.ativo),
    criadoEm: String(row.criado_em ?? ""),
    atualizadoEm: String(row.atualizado_em ?? ""),
  };
}

export async function listarModelos(): Promise<ReceituarioModelo[]> {
  await garantirTabelaModelos();
  const rows = await db.execute(sql`SELECT * FROM receituario_modelos ORDER BY id`);
  const list = (rows as unknown as { rows: Record<string, unknown>[] }).rows
    ?? (Array.isArray(rows) ? rows : []);
  return list.map(row => ({
    id: Number(row.id),
    nome: String(row.nome),
    tipo: (row.tipo as TipoModelo) ?? "faixas_paxter",
    config: typeof row.config === "object" && row.config !== null ? (row.config as Record<string, unknown>) : {},
    ativo: Boolean(row.ativo),
    criadoEm: String(row.criado_em ?? ""),
    atualizadoEm: String(row.atualizado_em ?? ""),
  }));
}

export async function ativarModelo(id: number): Promise<void> {
  await garantirTabelaModelos();
  await db.execute(sql`UPDATE receituario_modelos SET ativo = FALSE`);
  await db.execute(sql`UPDATE receituario_modelos SET ativo = TRUE, atualizado_em = NOW() WHERE id = ${id}`);
}

export async function criarModelo(
  nome: string,
  tipo: TipoModelo,
  config: Record<string, unknown>,
): Promise<ReceituarioModelo> {
  await garantirTabelaModelos();
  const rows = await db.execute(sql`
    INSERT INTO receituario_modelos (nome, tipo, config, ativo)
    VALUES (${nome}, ${tipo}, ${JSON.stringify(config)}, FALSE)
    RETURNING *
  `);
  const row = (rows as unknown as { rows: Record<string, unknown>[] }).rows?.[0];
  if (!row) throw new Error("Falha ao criar modelo");
  return {
    id: Number(row.id),
    nome: String(row.nome),
    tipo: (row.tipo as TipoModelo) ?? "faixas_paxter",
    config: typeof row.config === "object" && row.config !== null ? (row.config as Record<string, unknown>) : {},
    ativo: Boolean(row.ativo),
    criadoEm: String(row.criado_em ?? ""),
    atualizadoEm: String(row.atualizado_em ?? ""),
  };
}

export async function atualizarModelo(
  id: number,
  patch: { nome?: string; config?: Record<string, unknown> },
): Promise<void> {
  await garantirTabelaModelos();
  if (patch.nome !== undefined && patch.config !== undefined) {
    await db.execute(sql`
      UPDATE receituario_modelos
      SET nome = ${patch.nome}, config = ${JSON.stringify(patch.config)}, atualizado_em = NOW()
      WHERE id = ${id}
    `);
  } else if (patch.nome !== undefined) {
    await db.execute(sql`
      UPDATE receituario_modelos SET nome = ${patch.nome}, atualizado_em = NOW() WHERE id = ${id}
    `);
  } else if (patch.config !== undefined) {
    await db.execute(sql`
      UPDATE receituario_modelos SET config = ${JSON.stringify(patch.config)}, atualizado_em = NOW() WHERE id = ${id}
    `);
  }
}

// ── Motor único ───────────────────────────────────────────────────────────────

export async function emitirReceituarioPdf(params: EmitirParams): Promise<EmitirResult> {
  const dataHoje = hoje();
  const [y, m, d] = dataHoje.split("-");

  // 1. Carrega o modelo ativo (ou override por modeloId)
  const modelo = await getModeloAtivo(params.modeloId);
  logger.info({ modeloId: modelo.id, tipo: modelo.tipo }, "receituario-motor: modelo selecionado");

  // 2. Lê certificado real do PFX (best-effort — null se não configurado)
  const certMeta: CertDocMeta | null = readCertMetaSync();

  // 3. Carrega médico e clínica do banco (padrão: Dr. Caio=6, Instituto Padua=8)
  const medicoId = (params as any).medicoId ?? 6;
  const clinicaId = (params as any).clinicaId ?? 8;

  const [medico] = await db.select().from(professionalsTable).where(eq(professionalsTable.id, medicoId));
  const [clinica] = await db.select().from(locationsTable).where(eq(locationsTable.id, clinicaId));

  const medicoNome = medico?.name ?? "Dr. Caio Henrique Fernandes Pádua";
  const medicoCrm  = medico?.crm  ?? "CRM SP 123456";
  const medicoRqe  = (medico as any)?.specialty ?? undefined;
  const clinicaNome = (clinica as any)?.nome_fantasia ?? clinica?.name ?? "Instituto Padua";
  const clinicaEnd  = clinica?.address ?? "Av. Brigadeiro Faria Lima, 3000 — São Paulo / SP";
  const clinicaTel  = clinica?.phone ?? undefined;

  // 4. Gera o PDF usando o motor correto para o tipo de modelo
  let pdfBytes: Uint8Array;

  if (modelo.tipo === "classico_anvisa") {
    // Motor M2: ANVISA 4-boxes (pdf-lib direto, assina ICP-Brasil)
    const pdfData: ReceituarioDataV2 = {
      medicoName:         medicoNome,
      medicoCrm:          medicoCrm,
      medicoRqe,
      clinicaNome,
      clinicaEndereco:    clinicaEnd,
      clinicaTelefone:    clinicaTel,
      pacienteNome:       params.patient.nome,
      pacienteCpf:        params.patient.cpf,
      pacienteNascimento: params.patient.dataNascimento,
      pacienteTelefone:   params.patient.telefone,
      pacienteEndereco:   params.patient.endereco,
      formulas: params.formulas.map(f => ({
        nome:      f.nome,
        ativos:    f.ativos ?? f.dose,
        posologia: f.posologia,
        via:       f.via,
        forma:     f.forma,
      })),
      tipoReceita: params.tipoReceita ?? "especial",
      dataEmissao: dataHoje,
      bandModel:   (modelo.config.bandModel as string) ?? "padua-01-floral-islamico",
    };
    pdfBytes = await generateReceituarioPdfV2(pdfData);
  } else {
    // Motor M4: Faixas Paxter (Puppeteer captura HTML = exatamente o preview)
    const assetsBase = params.assetsBaseUrl ?? "http://localhost:80/padcom";

    const htmlData: PrescricaoHtmlData = {
      medicoNome,
      medicoCrm,
      medicoRqe,
      clinicaNome,
      clinicaEndereco: clinicaEnd,
      clinicaTelefone: clinicaTel,
      pacienteNome:       params.patient.nome,
      pacienteCpf:        params.patient.cpf ?? "",
      pacienteNascimento: params.patient.dataNascimento,
      pacienteTelefone:   params.patient.telefone,
      pacienteEndereco:   params.patient.endereco,
      formulas: params.formulas.map((f, i) => ({
        numero:    i + 1,
        nome:      f.nome,
        ativos:    f.ativos ?? f.dose ?? f.nome,
        posologia: f.posologia,
        via:       f.via,
        forma:     f.forma,
      })),
      tipoReceita: params.tipoReceita ?? "especial",
      dataEmissao: dataHoje,
      assetsBaseUrl: assetsBase,
      certMeta,
    };

    const html = buildPrescricaoHtml(htmlData);
    const pngBase64 = await htmlToPngBase64(html);
    pdfBytes = await generatePdfFromPngBase64(pngBase64, medicoNome);
  }

  // 5. Nome do arquivo — padrão PAXTER
  const slug = slugNome(params.patient.nome);
  const fileName = `${y.slice(2)}.${m}.${d} RECEITUARIO ${slug}.pdf`;

  // 6. Upload Drive (best-effort)
  let driveUrl: string | null = null;
  let driveId: string | null = null;
  if (params.driveFolder) {
    try {
      const result = await uploadToFolderById(
        params.driveFolder,
        fileName,
        "application/pdf",
        Buffer.from(pdfBytes),
      );
      driveUrl = result.webViewLink ?? null;
      driveId  = result.id ?? null;
      logger.info({ driveUrl }, "receituario-motor: Drive upload OK");
    } catch (e) {
      logger.warn({ err: e instanceof Error ? e.message : String(e) }, "receituario-motor: Drive upload falhou");
    }
  }

  // 7. E-mail (best-effort)
  let emailSent = false;
  const emailRecipients = params.emailTo
    ? (Array.isArray(params.emailTo) ? params.emailTo : [params.emailTo])
    : ["drcaiohenriquepadua@gmail.com"];

  try {
    const emailHtml = buildEmailHtml({
      pacienteNome: params.patient.nome,
      medicoNome,
      medicoCrm,
      clinicaNome,
      data: `${d}/${m}/${y}`,
      fileName,
      driveUrl,
      modeloUsado: modelo.nome,
    });
    const mailResult = await sendGmailMessage({
      to: emailRecipients.join(", "),
      subject: `PAXTER | Receituário | ${params.patient.nome} | ${d}/${m}/${y}`,
      html: emailHtml,
      attachments: [{
        filename: fileName,
        content:  Buffer.from(pdfBytes),
        contentType: "application/pdf",
      }],
    });
    emailSent = mailResult.success;
  } catch (e) {
    logger.warn({ err: e instanceof Error ? e.message : String(e) }, "receituario-motor: e-mail falhou");
  }

  return { pdf: pdfBytes, fileName, driveUrl, driveId, emailSent, modeloUsado: modelo.nome, tipoMotor: modelo.tipo };
}

// ── HTML do e-mail de notificação ─────────────────────────────────────────────

function buildEmailHtml(d: {
  pacienteNome: string; medicoNome: string; medicoCrm: string;
  clinicaNome: string; data: string; fileName: string;
  driveUrl: string | null; modeloUsado: string;
}): string {
  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden">
      <div style="background:#16284a;padding:20px 24px;text-align:center">
        <h1 style="color:#c9a24e;margin:0;font-size:24px;letter-spacing:2px">PAXTER</h1>
        <p style="color:#45B8CC;margin:4px 0 0;font-size:13px">Motor Clínico — Receituário Assinado</p>
      </div>
      <div style="padding:24px;background:#f8fafc">
        <h2 style="color:#16284a;margin-top:0">Receituário Gerado e Assinado Digitalmente</h2>
        <table style="width:100%;border-collapse:collapse;font-size:14px">
          <tr><td style="padding:6px 0;color:#64748b;width:130px">Paciente</td><td style="padding:6px 0;font-weight:600;color:#1e293b">${d.pacienteNome}</td></tr>
          <tr><td style="padding:6px 0;color:#64748b">Médico</td><td style="padding:6px 0;color:#1e293b">${d.medicoNome}</td></tr>
          <tr><td style="padding:6px 0;color:#64748b">CRM</td><td style="padding:6px 0;color:#1e293b">${d.medicoCrm}</td></tr>
          <tr><td style="padding:6px 0;color:#64748b">Clínica</td><td style="padding:6px 0;color:#1e293b">${d.clinicaNome}</td></tr>
          <tr><td style="padding:6px 0;color:#64748b">Data</td><td style="padding:6px 0;color:#1e293b">${d.data}</td></tr>
          <tr><td style="padding:6px 0;color:#64748b">Modelo</td><td style="padding:6px 0;color:#1e293b">${d.modeloUsado}</td></tr>
        </table>
        ${d.driveUrl ? `<p style="margin-top:16px"><a href="${d.driveUrl}" style="background:#45B8CC;color:#fff;padding:8px 16px;border-radius:4px;text-decoration:none;font-weight:600">Ver no Google Drive</a></p>` : ""}
        <p style="color:#64748b;font-size:12px;margin-top:16px">Gerado pelo Motor Único PAXTER · Modelo: ${d.modeloUsado}</p>
      </div>
      <div style="background:#16284a;padding:12px 24px;text-align:center">
        <p style="color:#45B8CC;font-size:11px;margin:0">Documento assinado digitalmente via ICP-Brasil/PAdES — PAXTER Clinical Intelligence System</p>
      </div>
    </div>`;
}

// ── Inicialização da tabela (idempotente) ─────────────────────────────────────

let _tabelaGarantida = false;

export async function garantirTabelaModelos(): Promise<void> {
  if (_tabelaGarantida) return;
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS receituario_modelos (
        id          SERIAL PRIMARY KEY,
        nome        TEXT NOT NULL,
        tipo        TEXT NOT NULL DEFAULT 'faixas_paxter',
        config      JSONB NOT NULL DEFAULT '{}',
        ativo       BOOLEAN NOT NULL DEFAULT FALSE,
        criado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const existentes = await db.execute(sql`SELECT COUNT(*)::int AS n FROM receituario_modelos`);
    const n = Number(
      (existentes as unknown as { rows: { n: number }[] }).rows?.[0]?.n ?? 0
    );

    if (n === 0) {
      await db.execute(sql`
        INSERT INTO receituario_modelos (nome, tipo, config, ativo) VALUES
        ('Faixas Paxter', 'faixas_paxter', '{}', TRUE),
        ('Clássico ANVISA', 'classico_anvisa', '{}', FALSE)
      `);
      logger.info("receituario-motor: tabela criada e seed aplicado (2 modelos)");
    }

    _tabelaGarantida = true;
  } catch (e) {
    logger.error({ err: e instanceof Error ? e.message : String(e) }, "receituario-motor: falha ao criar tabela");
  }
}
