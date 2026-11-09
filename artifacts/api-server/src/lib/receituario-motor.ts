// ─────────────────────────────────────────────────────────────────────────────
// MOTOR ÚNICO DE RECEITUÁRIO — fonte de verdade para TODAS as emissões
// Qualquer rota que gera PDF de receita chama emitirReceituarioPdf().
// Despacha para o motor correto com base no modelo ativo do banco.
// ─────────────────────────────────────────────────────────────────────────────
import { db, professionalsTable, locationsTable, clientsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { resolvePrescriptionSigner, type PrescriptionIdentity } from "./prescription-signing";
import { ClinicalIdentityError } from "./clinical-emitter";
import { identidadeLocalReceituario } from "./identidade-local-receituario";
import { generateReceituarioPdfV2, type ReceituarioDataV2 } from "./receituario-pdf.js";
import { uploadToFolderById } from "./google-drive.js";
import { sendGmailMessage } from "./google-gmail.js";
import { logger } from "./logger.js";
import { baseUrlFromEnv } from "./messaging/base-url.js";
import { paxterEmailShell } from "./messaging/render-email.js";
import { blocoTabelaSubstancias, soMiligramas } from "./messaging/substance-table.js";
import { ObjectStorageService } from "./objectStorage";
import { PDFDocument } from "pdf-lib";
import { carregarIdentidadeClinica2b } from "./documentos/paxmed-2b-identidade-clinica";

// ── Tipos públicos ────────────────────────────────────────────────────────────

export type TipoModelo = "faixas_paxter" | "classico_anvisa" | "grand_finale";

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
  identity?: PrescriptionIdentity;
  /** Explicit identity from authorized callers; legacy callers remain separately audited. */
  medicoId?: number;
  clinicaId?: number;
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
  emailError?: string | null;
  modeloUsado: string;
  tipoMotor: TipoModelo;
  consultaToken: string | null;
  consultaUrl: string | null;
}

// ── Token de consulta pública ─────────────────────────────────────────────────

let _tokensGarantido = false;

export async function garantirTabelaTokens(): Promise<void> {
  if (_tokensGarantido) return;
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS receituario_tokens (
        token        TEXT PRIMARY KEY,
        paciente     TEXT NOT NULL,
        medico       TEXT NOT NULL,
        crm          TEXT NOT NULL,
        clinica      TEXT NOT NULL,
        data_emissao TEXT NOT NULL,
        arquivo      TEXT NOT NULL,
        drive_url    TEXT,
        formulas     JSONB NOT NULL DEFAULT '[]',
        criado_em    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await db.execute(sql`ALTER TABLE receituario_tokens ADD COLUMN IF NOT EXISTS cert_meta JSONB`);
    _tokensGarantido = true;
  } catch (e) {
    logger.error({ err: e instanceof Error ? e.message : String(e) }, "receituario-motor: falha ao criar tabela de tokens");
  }
}

// ── Helpers de data ───────────────────────────────────────────────────────────

import { brtISODate } from "./brt";

function hoje(): string {
  return brtISODate();
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

export async function emitirReceituarioPdf(_params: EmitirParams): Promise<EmitirResult> {
  throw new ClinicalIdentityError(422, "Este atalho não classifica medicamentos controlados. Use o botão Emitir receitas na prescrição.");
}

// Preservado para futura adaptação; nenhuma rota deve emitir por este caminho
// sem classificação clínica e regulatória confiável no servidor.
async function emitirReceituarioPdfHistorico(params: EmitirParams): Promise<EmitirResult> {
  if (!params.identity) throw new ClinicalIdentityError(422, "Emissão exige contexto clínico autenticado; fluxo legado bloqueado.");
  if (params.tipoReceita !== "simples") {
    throw new ClinicalIdentityError(422, "Receita especial deve ser emitida pelo botão Emitir receitas, com a classificação e numeração aplicáveis.");
  }
  const identity = params.identity;
  const signer = await resolvePrescriptionSigner(identity);
  // The patient printed in the signed document is always server-owned.
  params = { ...params, medicoId: identity.professional.id, clinicaId: identity.clinic.id,
    patient: { nome: identity.client.name, cpf: identity.client.cpf ?? undefined,
      telefone: identity.client.phone ?? undefined, email: identity.client.email ?? undefined,
      dataNascimento: identity.client.birthDate ?? undefined } };
  const dataHoje = hoje();
  const [y, m, d] = dataHoje.split("-");

  const baseUrl = baseUrlFromEnv();

  // A configuração histórica permanece disponível na sua tela, mas não
  // determina a apresentação clínica. A empresa vem do contexto autorizado.
  const identidade2bClinica = await carregarIdentidadeClinica2b(identity.clinic.empresaId);

  // 3. Carrega médico e local vinculados ao contexto clínico autorizado.
  const medicoId = identity.professional.id;
  const clinicaId = identity.clinic.id;

  const [medico] = await db.select().from(professionalsTable).where(eq(professionalsTable.id, medicoId));
  const [clinica] = await db.select().from(locationsTable).where(eq(locationsTable.id, clinicaId));
  const [cliente] = await db.select({ address: clientsTable.address }).from(clientsTable).where(eq(clientsTable.id, identity.client.id));

  if (!medico || !clinica) throw new ClinicalIdentityError(403, "Médico ou clínica indisponível.");
  if (medico.id !== identity.professional.id || clinica.id !== identity.clinic.id ||
      clinica.empresaId !== identity.clinic.empresaId) {
    throw new ClinicalIdentityError(403, "Médico ou clínica divergente do vínculo autorizado.");
  }
  let assinaturaImagem: { bytes: Buffer; mime: "image/png" | "image/jpeg" } | undefined;
  if (medico.signatureUrl) {
    const objectPath = medico.signatureUrl.replace(/^\/api\/storage/, "");
    if (!objectPath.startsWith("/objects/uploads/signatures/")) {
      throw new ClinicalIdentityError(422, "O caminho da assinatura cadastrada não é válido.");
    }
    try {
      const file = await new ObjectStorageService().getObjectEntityFile(objectPath);
      const [bytes] = await file.download();
      if (!bytes.length || bytes.length > 2_000_000) throw new Error("Imagem de assinatura vazia ou muito grande.");
      assinaturaImagem = { bytes, mime: objectPath.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg" };
      const verificarImagem = await PDFDocument.create();
      if (assinaturaImagem.mime === "image/png") await verificarImagem.embedPng(bytes);
      else await verificarImagem.embedJpg(bytes);
    } catch {
      throw new ClinicalIdentityError(422, "A imagem da assinatura cadastrada não pôde ser lida.");
    }
  }
  const medicoNome = identity.professional.name;
  const medicoCrm  = `CRM/${identity.professional.uf} ${identity.professional.crm}`;
  const medicoRqe  = (medico as any)?.specialty ?? undefined;
  // Nunca preencher com dados de outra clínica quando o cadastro está incompleto.
  const dadosLocal = identidadeLocalReceituario(clinica, identity.clinic.name);
  const clinicaNome = identity.clinic.name;
  if (!clinicaNome) throw new ClinicalIdentityError(422, "O local de atendimento não possui nome cadastrado.");
  const clinicaEnd  = dadosLocal.endereco;
  const clinicaTel  = dadosLocal.telefone;

  // Todos os caminhos clínicos compartilham o mesmo compositor. A consulta
  // legada pública continua no retorno, mas não é impressa como protegida.
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
      pacienteEndereco:   cliente?.address ?? undefined,
      formulas: params.formulas.map(f => ({
        nome:      f.nome,
        ativos:    f.ativos ?? f.dose,
        posologia: f.posologia,
        via:       f.via,
        forma:     f.forma,
      })),
      tipoReceita: params.tipoReceita ?? "especial",
      dataEmissao: dataHoje,
      modeloGrandFinaleClinico: true,
      contextoGrandFinale: identity,
      identidade2bClinica,
      assinaturaImagem,
    };
    const pdfBytes = await generateReceituarioPdfV2(pdfData, signer);

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
      driveId  = result.fileId ?? null;
      logger.info({ driveUrl }, "receituario-motor: Drive upload OK");
    } catch (e) {
      logger.warn({ err: e instanceof Error ? e.message : String(e) }, "receituario-motor: Drive upload falhou");
    }
  }

  // 7. E-mail (best-effort)
  let emailSent = false;
  let emailError: string | null = null;
  const emailRecipients = params.emailTo
    ? (Array.isArray(params.emailTo) ? params.emailTo : [params.emailTo])
    : [];

  if (emailRecipients.length > 0) try {
    const emailHtml = buildEmailHtml({
      pacienteNome: params.patient.nome,
      medicoNome,
      medicoCrm,
      clinicaNome,
      data:        `${d}/${m}/${y}`,
      fileName,
      driveUrl,
      modeloUsado: "Grand Finale",
      formulas:    params.formulas,   // cartões alinhados blocoTabelaSubstancias
      baseUrl:     baseUrl,           // para o banner GIF e URLs absolutas
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
    if (!emailSent) emailError = mailResult.error || "Serviço de e-mail não aceitou o envio.";
  } catch (e) {
    emailError = "Falha ao consultar o serviço de e-mail; envio não confirmado.";
    logger.warn({ err: e instanceof Error ? e.message : String(e) }, "receituario-motor: e-mail falhou");
  }

  // Não publica novos dados clínicos em consulta pública de token curto.
  // Registros históricos continuam preservados para seus consumidores atuais.
  return { pdf: pdfBytes, fileName, driveUrl, driveId, emailSent, emailError, modeloUsado: "Grand Finale", tipoMotor: "grand_finale", consultaToken: null, consultaUrl: null };
}

// ── HTML do e-mail de receituário — padrão Paxter terno/navy ─────────────────
// Segue o MESMO motor visual de todos os e-mails ricos:
//   paxterEmailShell  → casco navy/terno (fundo #0a1430, borda ouro, banner GIF)
//   blocoTabelaSubstancias → cartões alinhados com linha vertical imaginária
// Lição de 30/06/2026: varrer TODOS os geradores de e-mail para garantir que
// chamam o motor, não montam tabela própria. Correção aplicada aqui em 14/08/2026.

function esc(s: string | null | undefined): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function buildEmailHtml(d: {
  pacienteNome: string;
  medicoNome:   string;
  medicoCrm:    string;
  clinicaNome:  string;
  data:         string;
  fileName:     string;
  driveUrl:     string | null;
  modeloUsado:  string;
  formulas?:    FormulaEmissao[];
  baseUrl?:     string;
}): string {
  // Cartões de fórmulas: padrão blocoTabelaSubstancias (colunas alinhadas, ouro)
  const formulaBlock = d.formulas?.length
    ? "<div style=\"background:#0f1d3a;border:1px solid rgba(201,162,79,.25);border-radius:8px;padding:20px;margin:0 0 16px;\">" +
      "<h3 style=\"margin:0 0 14px;color:#c9a24f;font-size:15px;font-family:Georgia,serif;\">Formulas prescritas:</h3>" +
      blocoTabelaSubstancias(
        d.formulas.map((f) => ({
          nome:       f.nome,
          dose:       soMiligramas(f.dose ?? undefined),
          frequencia: f.via ?? undefined,
          cor:        "#c9a24f",
        })),
      ) +
      "</div>"
    : "";

  // Botão dourado "bulletproof" apontando para o Drive (opcional)
  const btnDrive = d.driveUrl
    ? "<tr><td align=\"center\" style=\"padding:24px 40px 8px;\">" +
      "<table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\">" +
      "<tr><td align=\"center\" bgcolor=\"#d4ad5c\" style=\"border-radius:12px;background:linear-gradient(135deg,#f0d488 0%,#d4ad5c 48%,#b88a3f 100%);box-shadow:0 10px 24px rgba(184,138,63,.45);\">" +
      `<a href="${esc(d.driveUrl)}" style="display:inline-block;padding:14px 36px;color:#0a162e;font-family:Georgia,serif;font-size:14px;font-weight:700;letter-spacing:2px;text-transform:uppercase;text-decoration:none;">Ver no Drive</a>` +
      "</td></tr></table></td></tr>"
    : "";

  const inner =
    "<tr><td style=\"padding:36px 40px 8px;text-align:center;\">" +
    "<div style=\"color:#f3ead6;font-family:Georgia,'Times New Roman',Times,serif;font-size:28px;line-height:1.25;font-weight:400;\">Receituario Medico</div>" +
    "</td></tr>" +
    "<tr><td style=\"padding:18px 40px 4px;text-align:center;\">" +
    `<p style="margin:0 0 14px;color:#c2cee0;font-size:15px;line-height:1.7;">Prezado(a) <strong style="color:#f3ead6;">${esc(d.pacienteNome)}</strong>, segue o seu receituario medico emitido em <strong style="color:#c9a24f;">${esc(d.data)}</strong> sob responsabilidade do(a) Dr(a). <strong style="color:#f3ead6;">${esc(d.medicoNome)}</strong> (CRM ${esc(d.medicoCrm)} \u2014 ${esc(d.clinicaNome)}).</p>` +
    "<p style=\"margin:0 0 4px;color:#c2cee0;font-size:15px;line-height:1.7;\">O documento esta em anexo neste e-mail, assinado digitalmente com certificado ICP-Brasil.</p>" +
    "</td></tr>" +
    "<tr><td style=\"padding:8px 32px 4px;text-align:left;\">" +
    formulaBlock +
    "<div style=\"background:#0f1d3a;border:1px solid rgba(201,162,79,.25);border-radius:8px;padding:16px;\">" +
    "<p style=\"margin:0;color:#c2cee0;font-size:13px;line-height:1.6;\"><strong style=\"color:#c9a24f;\">Importante:</strong> guarde este documento e leve-o na proxima consulta. Em caso de duvida, entre em contato com a clinica antes de alterar qualquer medicacao por conta propria.</p>" +
    "</div>" +
    "</td></tr>" +
    btnDrive +
    "<tr><td style=\"padding:0 40px 28px;\"></td></tr>";

  return paxterEmailShell(inner, d.baseUrl ?? "");
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
