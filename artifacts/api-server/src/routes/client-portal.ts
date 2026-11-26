import { Router, Request, Response } from "express";
import { db } from "@workspace/db";
import { clientsTable } from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";
import multer from "multer";
import {
  ensureClientFolderStructure,
  uploadFileToDrive,
  getUniqueDriveFileName,
} from "../lib/google-drive";
import { createPortalToken, verifyPortalToken } from "../lib/portal-token";
import { startExamIngestion } from "./exames-lab";
import { brtDateStr } from "../lib/brt";
import { lerEstadoPreCadastro } from "../lib/pre-cadastro";
import {
  buildExamFileName,
  classifyExamLabel,
  classifyExamRegion,
  parseExamDatePrefix,
} from "../lib/exam-file-naming.js";

const router = Router();

/** Assinatura real do arquivo (o tipo declarado pelo navegador não é prova). */
function detectFileKind(buf: Buffer): "pdf" | "jpeg" | "png" | null {
  if (buf.subarray(0, 5).toString("latin1") === "%PDF-") return "pdf";
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  return null;
}
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

/** Nome do arquivo como a pessoa enviou: o multer entrega UTF-8 lido como latin1 ("JoÃ£o"); desfaz isso quando for seguro. */
function nomeOriginalLegivel(bruto: string): string {
  const cabeEmLatin1 = [...bruto].every((c) => c.charCodeAt(0) <= 0xff);
  const decodificado = cabeEmLatin1 ? Buffer.from(bruto, "latin1").toString("utf8") : bruto;
  const nome = (decodificado.includes("\uFFFD") ? bruto : decodificado)
    .replace(/[\\/]/g, "_")
    .replace(/[\u0000-\u001f]/g, "")
    .trim()
    .slice(0, 200);
  return nome || "arquivo";
}

const EXAM_FILE_TYPES = new Set([
  "exame_sangue",
  "ultrassom",
  "tomografia",
  "ressonancia",
  "densitometria",
  "laudo",
  "outro",
]);

const FILE_TYPE_TO_FOLDER: Record<string, string> = {
  "exame_sangue": "EXAMES",
  "ultrassom": "EXAMES",
  "tomografia": "EXAMES",
  "ressonancia": "EXAMES",
  "densitometria": "EXAMES",
  "laudo": "LAUDOS",
  "comprovante_pagamento": "FINANCEIRO",
  "foto": "IMAGENS",
  "receita": "RECEITAS",
  "atestado": "ATESTADOS",
  "outro": "EXAMES",
};

const FILE_TYPE_LABELS: Record<string, string> = {
  "exame_sangue": "LABOR",
  "ultrassom": "USG",
  "tomografia": "TC",
  "ressonancia": "RMN",
  "densitometria": "DENSITOMETRIA",
  "laudo": "LAUDO",
  "comprovante_pagamento": "COMPROVANTE",
  "foto": "FOTO",
  "receita": "RECEITA",
  "atestado": "ATESTADO",
  "outro": "DOCUMENTO",
};

router.post("/client-portal/identify", async (req: Request, res: Response) => {
  try {
    const { cpf, birthDate } = req.body;

    if (!cpf || !birthDate) {
      res.status(400).json({ error: "CPF e data de nascimento são obrigatórios" });
      return;
    }

    const cleanCpf = cpf.replace(/\D/g, "");
    if (cleanCpf.length !== 11) {
      res.status(400).json({ error: "CPF errado." });
      return;
    }

    // Compara so os digitos: o cadastro pode guardar o CPF com ou sem mascara.
    const clients = await db
      .select()
      .from(clientsTable)
      .where(sql`regexp_replace(coalesce(${clientsTable.cpf}, ''), '[^0-9]', '', 'g') = ${cleanCpf}`);

    if (clients.length === 0) {
      res.status(401).json({ error: "CPF errado." });
      return;
    }

    const client = clients[0];

    if (!client.birthDate) {
      res.status(401).json({ error: "Data de nascimento errada." });
      return;
    }

    const storedDigits = client.birthDate.replace(/\D/g, "");
    const inputDigits = birthDate.replace(/\D/g, "");

    let storedNorm = storedDigits;
    if (client.birthDate.match(/^\d{4}[-/]/)) {
      storedNorm = storedDigits.slice(6, 8) + storedDigits.slice(4, 6) + storedDigits.slice(0, 4);
    }

    if (storedNorm !== inputDigits) {
      res.status(401).json({ error: "Data de nascimento errada." });
      return;
    }

    const token = createPortalToken(client.id);

    res.json({
      id: client.id,
      name: client.name,
      cpf: client.cpf,
      token,
    });
  } catch (err: any) {
    console.error("[Portal] Erro na identificação:", err.message);
    res.status(500).json({ error: "Erro interno" });
  }
});

router.post(
  "/client-portal/upload",
  upload.single("file"),
  async (req: Request, res: Response) => {
    try {
      const { fileType, bodyRegion, description, examDate } = req.body;
      const bearer = req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7).trim() : null;
      const token = req.body.token || bearer;
      const file = req.file;

      if (!token || !fileType || !file) {
        res.status(400).json({ error: "Token, tipo e arquivo são obrigatórios" });
        return;
      }

      const clientId = verifyPortalToken(token);
      if (clientId === null) {
        res.status(401).json({ error: "Sessão expirada. Identifique-se novamente." });
        return;
      }

      const clients = await db
        .select()
        .from(clientsTable)
        .where(eq(clientsTable.id, clientId));

      if (clients.length === 0) {
        res.status(404).json({ error: "Cliente não encontrado" });
        return;
      }

      const client = clients[0];
      if (client.status !== "active") {
        res.status(404).json({ error: "Cliente não encontrado" });
        return;
      }
      const preCadastro = await lerEstadoPreCadastro(client.id);
      if (preCadastro && !preCadastro.completo) {
        res.status(428).json({ error: "Complete seu cadastro para continuar.", codigo: "PRE_CADASTRO_PENDENTE", pendentes: preCadastro.pendentes });
        return;
      }
      // Exame clínico: o conteúdo precisa ser PDF, JPEG ou PNG de verdade e coerente com o tipo declarado.
      if (EXAM_FILE_TYPES.has(fileType) && fileType !== "outro") {
        const kind = detectFileKind(file.buffer);
        const declaredPdf = file.mimetype === "application/pdf";
        if (!kind || (declaredPdf && kind !== "pdf")) {
          res.status(400).json({ error: "Envie o exame em PDF, JPEG ou PNG válido." });
          return;
        }
      }
      const folder = FILE_TYPE_TO_FOLDER[fileType] || "EXAMES";
      const typeLabel = FILE_TYPE_LABELS[fileType] || "DOCUMENTO";
      if (!client.cpf) {
        res.status(422).json({ error: "Cliente sem CPF cadastrado." });
        return;
      }

      const structure = await ensureClientFolderStructure(client.name, client.cpf);
      const targetFolderId = structure.subfolders[folder];

      if (!targetFolderId) {
        res.status(500).json({ error: "Pasta de destino não encontrada" });
        return;
      }

      // 5a: data digitada pelo usuário (DD/MM/AAAA) → YY.MM.DD.
      // Fallback: data atual em BRT (UTC-3) — corrige bug de UTC avançar o dia.
      const userDateStr = examDate ? parseExamDatePrefix(String(examDate)) : null;
      if (examDate && !userDateStr) {
        res.status(400).json({ error: "Data do exame inválida. Use DD/MM/AAAA e confira o dia no calendário." });
        return;
      }
      const dateStr = userDateStr ?? brtDateStr();
      const ext = file.originalname.includes(".")
        ? "." + file.originalname.split(".").pop()!.toLowerCase()
        : "";
      const describedExamLabel = fileType === "outro" && description
        ? classifyExamLabel(String(description))
        : null;
      const fileNameBase = buildExamFileName({
        date: dateStr,
        type: describedExamLabel ?? typeLabel,
        region: bodyRegion
          ? String(bodyRegion)
          : classifyExamRegion(String(description ?? "")) ?? null,
        clientName: client.name,
        extension: ext,
      });
      const fileName = await getUniqueDriveFileName(targetFolderId, fileNameBase);

      const result = await uploadFileToDrive(
        targetFolderId,
        fileName,
        file.mimetype,
        file.buffer,
        true
      );

      console.log(`[Portal] Upload: ${fileName} -> ${folder} (${client.name})`);

      // Trajetoria do Exame: PDF de exame laboratorial entra no motor de
      // leitura por IA (assincrono, best-effort — nunca quebra o upload).
      const EXAM_TYPES = EXAM_FILE_TYPES;
      let exameDocumentoId: number | null = null;
      // Arquivo guardado (recebido) e leitura iniciada são coisas diferentes: o cliente vê a diferença.
      let processamento: "iniciado" | "nao_iniciado" | "nao_aplicavel" = "nao_aplicavel";
      if (detectFileKind(file.buffer) === "pdf" && EXAM_TYPES.has(fileType)) {
        processamento = "nao_iniciado";
        try {
          const ingestion = await startExamIngestion({
            clientId: client.id,
            buffer: file.buffer,
            fileName,
            sourcePdfDriveId: result.fileId,
            notify: true,
            userDateStr: userDateStr ?? dateStr,
            originalFileName: nomeOriginalLegivel(file.originalname),
          });
          exameDocumentoId = ingestion.documentId;
          processamento = "iniciado";
          console.log(
            `[Portal] Exame encaminhado ao motor: doc ${ingestion.documentId}${ingestion.duplicate ? " (duplicado, ja processado)" : ""}`,
          );
        } catch (ingestErr: any) {
          console.error("[Portal] Falha ao encaminhar exame ao motor:", ingestErr.message);
        }
      }

      res.json({
        success: true,
        fileName,
        folder,
        fileId: result.fileId,
        exameDocumentoId,
        processamento,
      });
    } catch (err: any) {
      console.error("[Portal] Erro no upload:", err.message);
      res.status(500).json({ error: "Erro ao enviar arquivo" });
    }
  }
);

export default router;
