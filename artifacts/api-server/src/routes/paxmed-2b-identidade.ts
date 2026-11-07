import { randomUUID } from "node:crypto";
import { Router, type Request, type Response } from "express";
import { and, eq, sql } from "drizzle-orm";
import { db, locationsTable } from "@workspace/db";
import { SavePaxmed2bIdentidadeBody } from "@workspace/api-zod";
import { requireCollaborator } from "./collaborator";
import { clinicManagementPermission } from "../lib/clinical-access";
import { ObjectStorageService } from "../lib/objectStorage";
import { aplicarOuroAoSimbolo } from "../lib/documentos/paxmed-ouro";

const router = Router();
const storage = new ObjectStorageService();
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Em construção: não disponibilizar ou ativar a personalização em produção.
router.use("/paxmed-2b", (_req, res, next) => {
  res.setHeader("Cache-Control", "private, no-store");
  if (process.env.NODE_ENV === "production") {
    res.status(404).json({ error: "Recurso indisponível." });
    return;
  }
  next();
});

class IdentityError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

async function authorize(req: Request): Promise<{ locationId: number; empresaId: number; professionalId: number }> {
  const raw = req.params.locationId;
  if (typeof raw !== "string" || !/^[1-9]\d*$/.test(raw)) throw new IdentityError(400, "Clínica inválida.");
  const locationId = Number(raw);
  if (!Number.isSafeInteger(locationId)) throw new IdentityError(400, "Clínica inválida.");
  const professionalId = req.collaborator?.professionalId;
  if (!professionalId || !req.tenantContext?.authenticated || req.tenantContext.professionalId !== professionalId) {
    throw new IdentityError(401, "Faça login novamente.");
  }
  const permission = await clinicManagementPermission(professionalId, locationId);
  if (!permission.allowed || !permission.empresaId || permission.empresaId !== req.tenantContext.empresaId) {
    throw new IdentityError(403, "Você não tem permissão para configurar esta clínica.");
  }
  return { locationId, empresaId: permission.empresaId, professionalId };
}

function fail(req: Request, res: Response, error: unknown): void {
  if (error instanceof IdentityError) {
    res.status(error.status).json({ error: error.message });
  } else {
    req.log.error({ err: error }, "Falha na identidade de clínica do Modelo 2B");
    res.status(500).json({ error: "Não foi possível acessar a identidade da clínica." });
  }
}

function view(row: Record<string, unknown> | undefined) {
  if (!row) return null;
  return {
    nome: row.nome_clinica,
    enderecoLinha1: row.endereco_linha1,
    enderecoLinha2: row.endereco_linha2,
    versao: row.versao,
  };
}

async function logoBytes(objectId: string, finalized = false): Promise<Buffer> {
  if (!uuidPattern.test(objectId)) throw new IdentityError(400, "Imagem de símbolo inválida.");
  try {
    const directory = finalized ? "paxmed-marcas-finais" : "paxmed-marcas";
    const file = await storage.getObjectEntityFile(`/objects/${directory}/${objectId}`);
    const [metadata] = await file.getMetadata();
    const size = Number(metadata.size);
    if (!Number.isFinite(size) || size <= 0 || size > 2 * 1024 * 1024) {
      throw new IdentityError(400, "A imagem deve ter até 2 megabytes.");
    }
    const [bytes] = await file.download();
    if (bytes.length !== size) throw new IdentityError(400, "A imagem recebida está incompleta.");
    return bytes;
  } catch (error) {
    if (error instanceof IdentityError) throw error;
    const code = (error as { code?: number | string })?.code;
    if (String(code) === "404") throw new IdentityError(400, "O símbolo ainda não foi enviado.");
    throw new IdentityError(503, "Armazenamento indisponível. A configuração anterior foi preservada.");
  }
}

router.get("/paxmed-2b/clinicas", requireCollaborator, async (req, res): Promise<void> => {
  try {
    if (!req.collaborator?.professionalId || !req.tenantContext?.authenticated) {
      throw new IdentityError(401, "Faça login novamente.");
    }
    const list = await db.select({ id: locationsTable.id, nome: locationsTable.name })
      .from(locationsTable).where(and(
        eq(locationsTable.empresaId, req.tenantContext.empresaId),
        eq(locationsTable.active, "true"),
      ));
    const checked = await Promise.all(list.map(async (location) => ({
      ...location,
      permission: await clinicManagementPermission(req.collaborator!.professionalId, location.id),
    })));
    res.json({ clinicas: checked.filter((location) => location.permission.allowed)
      .map(({ id, nome }) => ({ id, nome })) });
  } catch (error) { fail(req, res, error); }
});

router.get("/paxmed-2b/clinicas/:locationId", requireCollaborator, async (req, res): Promise<void> => {
  try {
    const { locationId, empresaId } = await authorize(req);
    const result = await db.execute(sql`
      SELECT nome_clinica, endereco_linha1, endereco_linha2, versao
      FROM paxmed_2b_identidade WHERE location_id = ${locationId} AND empresa_id = ${empresaId}
    `);
    res.json({ identidade: view(result.rows[0] as Record<string, unknown> | undefined) });
  } catch (error) { fail(req, res, error); }
});

router.post("/paxmed-2b/clinicas/:locationId/simbolo/upload", requireCollaborator, async (req, res): Promise<void> => {
  try {
    const { locationId, empresaId, professionalId } = await authorize(req);
    const uploadId = randomUUID();
    const uploadUrl = await storage.getClinicBrandUploadURL(uploadId);
    await db.execute(sql`
      INSERT INTO paxmed_2b_upload (id, location_id, empresa_id, professional_id, expira_em)
      VALUES (${uploadId}::uuid, ${locationId}, ${empresaId}, ${professionalId}, NOW() + INTERVAL '15 minutes')
    `);
    res.json({ uploadId, uploadUrl });
  } catch (error) { fail(req, res, error); }
});

router.put("/paxmed-2b/clinicas/:locationId", requireCollaborator, async (req, res): Promise<void> => {
  try {
    const { locationId, empresaId, professionalId } = await authorize(req);
    const parsed = SavePaxmed2bIdentidadeBody.strict().safeParse(req.body);
    if (!parsed.success) throw new IdentityError(400, "Preencha nome e endereço corretamente.");
    const data = parsed.data;
    const nome = data.nome.trim();
    const endereco1 = data.enderecoLinha1.trim();
    const endereco2 = data.enderecoLinha2.trim();
    if (!nome || !endereco1 || !endereco2 || !Number.isSafeInteger(data.versao)) {
      throw new IdentityError(400, "Preencha nome e endereço corretamente.");
    }
    let finalizedId: string | null = null;
    if (data.uploadId) {
      const pending = await db.execute(sql`
        SELECT id FROM paxmed_2b_upload WHERE id = ${data.uploadId}::uuid
          AND location_id = ${locationId} AND empresa_id = ${empresaId}
          AND professional_id = ${professionalId} AND expira_em > NOW() AND usado_em IS NULL
      `);
      if (!pending.rows.length) throw new IdentityError(400, "O envio expirou ou não pertence a esta clínica.");
      let bytes: Buffer;
      try {
        bytes = await logoBytes(data.uploadId);
        aplicarOuroAoSimbolo(bytes);
      }
      catch (error) {
        if (error instanceof IdentityError) throw error;
        throw new IdentityError(400, error instanceof Error ? error.message : "Imagem inválida.");
      }
      // O endereço temporário de envio continua válido por alguns minutos.
      // Salvar uma cópia separada dos bytes já validados impede que a imagem
      // associada à clínica seja alterada por esse endereço depois da validação.
      finalizedId = randomUUID();
      try {
        await storage.savePrivateObject(`paxmed-marcas-finais/${finalizedId}`, bytes, "image/png");
      } catch {
        throw new IdentityError(503, "Armazenamento indisponível. A configuração anterior foi preservada.");
      }
    }
    await db.transaction(async (tx) => {
      if (data.uploadId) {
        const consumed = await tx.execute(sql`
          UPDATE paxmed_2b_upload SET usado_em = NOW()
          WHERE id = ${data.uploadId}::uuid AND location_id = ${locationId}
            AND empresa_id = ${empresaId} AND professional_id = ${professionalId}
            AND expira_em > NOW() AND usado_em IS NULL RETURNING id
        `);
        if (!consumed.rows.length) throw new IdentityError(409, "O envio já foi usado ou expirou.");
      }
      if (data.versao === 0) {
        if (!finalizedId) throw new IdentityError(400, "Envie o símbolo da clínica.");
        const created = await tx.execute(sql`
          INSERT INTO paxmed_2b_identidade
            (location_id, empresa_id, nome_clinica, endereco_linha1, endereco_linha2, simbolo_path)
          VALUES (${locationId}, ${empresaId}, ${nome}, ${endereco1}, ${endereco2}, ${finalizedId})
          ON CONFLICT (location_id) DO NOTHING RETURNING location_id
        `);
        if (!created.rows.length) throw new IdentityError(409, "A configuração mudou. Recarregue antes de salvar.");
      } else {
        const changed = await tx.execute(sql`
          UPDATE paxmed_2b_identidade SET nome_clinica = ${nome}, endereco_linha1 = ${endereco1},
            endereco_linha2 = ${endereco2}, simbolo_path = COALESCE(${finalizedId}, simbolo_path),
            versao = versao + 1, atualizado_em = NOW()
          WHERE location_id = ${locationId} AND empresa_id = ${empresaId} AND versao = ${data.versao}
          RETURNING location_id
        `);
        if (!changed.rows.length) throw new IdentityError(409, "A configuração mudou. Recarregue antes de salvar.");
      }
    });
    res.json({ identidade: { nome, enderecoLinha1: endereco1, enderecoLinha2: endereco2, versao: data.versao + 1 } });
  } catch (error) { fail(req, res, error); }
});

router.get("/paxmed-2b/clinicas/:locationId/simbolo", requireCollaborator, async (req, res): Promise<void> => {
  try {
    const { locationId, empresaId } = await authorize(req);
    const result = await db.execute(sql`
      SELECT simbolo_path FROM paxmed_2b_identidade
      WHERE location_id = ${locationId} AND empresa_id = ${empresaId}
    `);
    const objectId = (result.rows[0] as { simbolo_path?: string } | undefined)?.simbolo_path;
    if (!objectId) throw new IdentityError(404, "Símbolo não configurado.");
    const processed = aplicarOuroAoSimbolo(await logoBytes(objectId, true));
    res.setHeader("Cache-Control", "private, no-store");
    res.type("png").send(processed);
  } catch (error) { fail(req, res, error); }
});

export default router;
