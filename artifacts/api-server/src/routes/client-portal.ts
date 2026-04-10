import { Router, Request, Response } from "express";
import { db } from "@workspace/db";
import { clientsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { createHmac, randomBytes } from "crypto";
import multer from "multer";
import {
  ensureClientFolderStructure,
  uploadFileToDrive,
  removeDiacritics,
} from "../lib/google-drive";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

const TOKEN_SECRET = process.env.SESSION_SECRET || randomBytes(32).toString("hex");
const TOKEN_TTL_MS = 30 * 60 * 1000;

function createPortalToken(clientId: number): string {
  const exp = Date.now() + TOKEN_TTL_MS;
  const payload = `${clientId}:${exp}`;
  const sig = createHmac("sha256", TOKEN_SECRET).update(payload).digest("hex");
  return Buffer.from(`${payload}:${sig}`).toString("base64url");
}

function verifyPortalToken(token: string): number | null {
  try {
    const decoded = Buffer.from(token, "base64url").toString();
    const parts = decoded.split(":");
    if (parts.length !== 3) return null;
    const [clientIdStr, expStr, sig] = parts;
    const payload = `${clientIdStr}:${expStr}`;
    const expected = createHmac("sha256", TOKEN_SECRET).update(payload).digest("hex");
    if (sig !== expected) return null;
    if (Date.now() > Number(expStr)) return null;
    return Number(clientIdStr);
  } catch {
    return null;
  }
}

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
  "exame_sangue": "EXAME",
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
      res.status(400).json({ error: "CPF inválido" });
      return;
    }

    const formattedCpf = cleanCpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");

    const clients = await db
      .select()
      .from(clientsTable)
      .where(eq(clientsTable.cpf, formattedCpf));

    if (clients.length === 0) {
      res.status(401).json({ error: "CPF ou data de nascimento incorretos" });
      return;
    }

    const client = clients[0];

    if (!client.birthDate) {
      res.status(401).json({ error: "CPF ou data de nascimento incorretos" });
      return;
    }

    const storedDigits = client.birthDate.replace(/\D/g, "");
    const inputDigits = birthDate.replace(/\D/g, "");

    let storedNorm = storedDigits;
    if (client.birthDate.match(/^\d{4}[-/]/)) {
      storedNorm = storedDigits.slice(6, 8) + storedDigits.slice(4, 6) + storedDigits.slice(0, 4);
    }

    if (storedNorm !== inputDigits) {
      res.status(401).json({ error: "CPF ou data de nascimento incorretos" });
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
      const { token, fileType, bodyRegion, description } = req.body;
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
      const folder = FILE_TYPE_TO_FOLDER[fileType] || "EXAMES";
      const typeLabel = FILE_TYPE_LABELS[fileType] || "DOCUMENTO";

      const structure = await ensureClientFolderStructure(client.name, client.cpf);
      const targetFolderId = structure.subfolders[folder];

      if (!targetFolderId) {
        res.status(500).json({ error: "Pasta de destino não encontrada" });
        return;
      }

      const now = new Date();
      const dateStr = `${String(now.getFullYear()).slice(2)}.${String(now.getMonth() + 1).padStart(2, "0")}.${String(now.getDate()).padStart(2, "0")}`;
      const clientNameClean = removeDiacritics(client.name).toUpperCase();
      const regionPart = bodyRegion ? ` ${bodyRegion.toUpperCase()}` : "";
      const ext = file.originalname.includes(".")
        ? "." + file.originalname.split(".").pop()!.toLowerCase()
        : "";

      const fileName = `${dateStr} ${typeLabel}${regionPart} ${clientNameClean}${ext}`;

      const result = await uploadFileToDrive(
        targetFolderId,
        fileName,
        file.mimetype,
        file.buffer
      );

      console.log(`[Portal] Upload: ${fileName} -> ${folder} (${client.name})`);

      res.json({
        success: true,
        fileName,
        folder,
        fileId: result.fileId,
      });
    } catch (err: any) {
      console.error("[Portal] Erro no upload:", err.message);
      res.status(500).json({ error: "Erro ao enviar arquivo" });
    }
  }
);

export default router;
