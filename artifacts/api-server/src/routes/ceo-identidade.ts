import { randomUUID } from "node:crypto";
import { Router, type IRouter, type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import { sql, eq } from "drizzle-orm";
import { db, professionalsTable } from "@workspace/db";
import { requireCollaborator } from "./collaborator";
import { ObjectStorageService } from "../lib/objectStorage";
import { lerCeoIdentidade } from "../lib/ceo-identidade";
import { carregarFotoProfissional } from "../lib/professional-photo";

// Identidade do CEO da PaxMed (entidade empresarial). Só o dono da plataforma lê e altera.
const router: IRouter = Router();
const storage = new ObjectStorageService();
const LIMITE = 2 * 1024 * 1024;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: LIMITE, files: 1 } });
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function donoDaPlataforma(req: Request, res: Response): number | null {
  const prof = req.collaborator?.professionalId;
  if (!prof || !req.tenantContext?.authenticated || req.tenantContext.professionalId !== prof) {
    res.status(401).json({ error: "Faça login novamente." }); return null;
  }
  if (req.tenantContext.perfilPlataforma !== "platform_owner") {
    res.status(403).json({ error: "Somente o CEO da PaxMed acessa esta área." }); return null;
  }
  return prof;
}

function tipoImagem(b: Buffer): "image/jpeg" | "image/png" | null {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  return null;
}

async function auditar(campo: string, antes: string | null, depois: string | null, por: number) {
  await db.execute(sql`INSERT INTO ceo_identidade_auditoria (campo, valor_antes, valor_depois, por) VALUES (${campo}, ${antes}, ${depois}, ${por})`);
}

router.get("/ceo/identidade", requireCollaborator, async (req, res): Promise<void> => {
  if (donoDaPlataforma(req, res) === null) return;
  const ceo = await lerCeoIdentidade();
  let medico: Record<string, unknown> | null = null;
  if (ceo.medicoProfessionalId) {
    const [p] = await db.select().from(professionalsTable).where(eq(professionalsTable.id, ceo.medicoProfessionalId)).limit(1);
    if (p) medico = {
      id: p.id, nome: p.name, crm: p.registrationNumber ?? p.crm ?? null, especialidade: p.specialty ?? null,
      cpfFinal: p.cpf ? String(p.cpf).replace(/\D/g, "").slice(-4) : null, temFoto: !!p.photoUrl,
    };
  }
  res.json({
    medicoAtivo: ceo.medicoAtivo, temFotoCeo: !!ceo.fotoPath, medico,
    fotoExibida: ceo.medicoAtivo && medico && medico.temFoto ? "medico" : ceo.fotoPath ? "ceo" : "nenhuma",
  });
});

// Foto exibida no cadastro do CEO: ligado = foto do Dr. Caio (profissional); desligado = foto do CEO.
router.get("/ceo/identidade/foto", requireCollaborator, async (req, res): Promise<void> => {
  if (donoDaPlataforma(req, res) === null) return;
  const ceo = await lerCeoIdentidade();
  res.setHeader("Cache-Control", "private, no-store");
  if (ceo.medicoAtivo) {
    const f = await carregarFotoProfissional(ceo.medicoProfessionalId);
    if (f) { res.type(f.formato === "png" ? "png" : "jpeg").send(f.bytes); return; }
  }
  await enviarFotoCeo(ceo.fotoPath, res);
});

router.get("/ceo/identidade/foto-medico", requireCollaborator, async (req, res): Promise<void> => {
  if (donoDaPlataforma(req, res) === null) return;
  const ceo = await lerCeoIdentidade();
  const f = await carregarFotoProfissional(ceo.medicoProfessionalId);
  if (!f) { res.status(404).json({ error: "O profissional médico ainda não tem foto cadastrada." }); return; }
  res.setHeader("Cache-Control", "private, no-store");
  res.type(f.formato === "png" ? "png" : "jpeg").send(f.bytes);
});

async function enviarFotoCeo(id: string | null, res: Response): Promise<void> {
  if (!id || !uuid.test(id)) { res.status(404).json({ error: "Foto do CEO não cadastrada." }); return; }
  try {
    const bytes = await storage.readPrivateObject(`ceo-identidade/${id}`);
    res.type(tipoImagem(bytes) === "image/png" ? "png" : "jpeg").send(bytes);
  } catch { res.status(404).json({ error: "Foto do CEO indisponível." }); }
}

router.put("/ceo/identidade/medico-ativo", requireCollaborator, async (req, res): Promise<void> => {
  const por = donoDaPlataforma(req, res); if (por === null) return;
  const ativo = (req.body as { ativo?: unknown })?.ativo;
  if (typeof ativo !== "boolean") { res.status(400).json({ error: "Informe ativo como verdadeiro ou falso." }); return; }
  const antes = await lerCeoIdentidade();
  if (ativo && !antes.medicoProfessionalId) {
    res.status(409).json({ error: "Nenhum cadastro médico foi vinculado ao CEO." }); return;
  }
  await db.execute(sql`UPDATE ceo_identidade SET medico_ativo = ${ativo}, atualizado_por = ${por}, atualizado_em = now() WHERE id = 1`);
  await auditar("medico_ativo", String(antes.medicoAtivo), String(ativo), por);
  res.json({ ok: true, medicoAtivo: ativo });
});

function receber(req: Request, res: Response, next: NextFunction): void {
  upload.single("file")(req, res, (err: unknown) => {
    if (err) { res.status(400).json({ error: "Envie uma imagem JPEG ou PNG de até 2 MB." }); return; }
    next();
  });
}

router.put("/ceo/identidade/foto", requireCollaborator, receber, async (req, res): Promise<void> => {
  const por = donoDaPlataforma(req, res); if (por === null) return;
  const bytes = req.file?.buffer;
  const tipo = bytes ? tipoImagem(bytes) : null;
  if (!bytes || !tipo) { res.status(400).json({ error: "A foto precisa ser JPEG ou PNG." }); return; }
  const antes = await lerCeoIdentidade();
  const id = randomUUID();
  try { await storage.savePrivateObject(`ceo-identidade/${id}`, bytes, tipo); }
  catch { res.status(503).json({ error: "Armazenamento indisponível. A foto anterior foi preservada." }); return; }
  await db.execute(sql`UPDATE ceo_identidade SET foto_path = ${id}, atualizado_por = ${por}, atualizado_em = now() WHERE id = 1`);
  await auditar("foto", antes.fotoPath, id, por);
  res.json({ ok: true });
});

// ── Clínicas: Administrador e Responsável técnico (escolha em lista; não cria login) ──
type Linha = { empresa_id: number; nome: string; adm: number | null; rt: number | null };

router.get("/ceo/clinicas-responsaveis", requireCollaborator, async (req, res): Promise<void> => {
  if (donoDaPlataforma(req, res) === null) return;
  const e = await db.execute(sql`
    SELECT e.id AS empresa_id, e.nome, r.administrador_professional_id AS adm, r.responsavel_tecnico_professional_id AS rt
    FROM empresas e LEFT JOIN empresa_responsaveis r ON r.empresa_id = e.id
    WHERE e.ativa ORDER BY e.nome`);
  const p = await db.execute(sql`SELECT id, name, professional_type, empresa_id FROM professionals WHERE active ORDER BY name`);
  res.json({
    clinicas: (e.rows as Linha[]).map(l => ({ empresaId: l.empresa_id, nome: l.nome, administradorId: l.adm, responsavelTecnicoId: l.rt })),
    profissionais: (p.rows as Array<{ id: number; name: string; professional_type: string; empresa_id: number | null }>)
      .map(x => ({ id: x.id, nome: x.name, tipo: x.professional_type, empresaId: x.empresa_id })),
  });
});

router.put("/ceo/clinicas-responsaveis/:empresaId", requireCollaborator, async (req, res): Promise<void> => {
  const por = donoDaPlataforma(req, res); if (por === null) return;
  const empresaId = Number(req.params.empresaId);
  const body = req.body as { administradorId?: number | null; responsavelTecnicoId?: number | null };
  if (!Number.isSafeInteger(empresaId)) { res.status(400).json({ error: "Clínica inválida." }); return; }
  const emp = await db.execute(sql`SELECT id FROM empresas WHERE id = ${empresaId} AND ativa`);
  if (!emp.rows[0]) { res.status(404).json({ error: "Clínica não encontrada ou inativa." }); return; }
  const antes = (await db.execute(sql`SELECT administrador_professional_id AS adm, responsavel_tecnico_professional_id AS rt FROM empresa_responsaveis WHERE empresa_id = ${empresaId}`))
    .rows[0] as { adm: number | null; rt: number | null } | undefined;
  const novo = {
    adm: body.administradorId === undefined ? antes?.adm ?? null : body.administradorId,
    rt: body.responsavelTecnicoId === undefined ? antes?.rt ?? null : body.responsavelTecnicoId,
  };
  for (const [funcao, id] of [["administrador", novo.adm], ["responsavel_tecnico", novo.rt]] as const) {
    if (id === null) continue;
    if (!Number.isSafeInteger(id)) { res.status(400).json({ error: "Profissional inválido." }); return; }
    const ceoMed = (await lerCeoIdentidade()).medicoProfessionalId;
    const ok = await db.execute(sql`SELECT 1 FROM professionals WHERE id = ${id} AND active AND (empresa_id = ${empresaId} OR id = ${ceoMed})`);
    if (!ok.rows[0]) { res.status(400).json({ error: "Profissional inexistente, inativo ou de outra clínica." }); return; }
    if (funcao === "responsavel_tecnico") {
      const med = await db.execute(sql`SELECT 1 FROM professionals WHERE id = ${id} AND professional_type = 'medico'`);
      if (!med.rows[0]) { res.status(400).json({ error: "O responsável técnico precisa ser médico." }); return; }
    }
  }
  await db.execute(sql`INSERT INTO empresa_responsaveis (empresa_id, administrador_professional_id, responsavel_tecnico_professional_id, atualizado_por)
    VALUES (${empresaId}, ${novo.adm}, ${novo.rt}, ${por})
    ON CONFLICT (empresa_id) DO UPDATE SET administrador_professional_id = EXCLUDED.administrador_professional_id,
      responsavel_tecnico_professional_id = EXCLUDED.responsavel_tecnico_professional_id,
      atualizado_por = EXCLUDED.atualizado_por, atualizado_em = now()`);
  if ((antes?.adm ?? null) !== novo.adm) await db.execute(sql`INSERT INTO empresa_responsaveis_auditoria (empresa_id, funcao, antes, depois, por) VALUES (${empresaId}, 'administrador', ${antes?.adm ?? null}, ${novo.adm}, ${por})`);
  if ((antes?.rt ?? null) !== novo.rt) await db.execute(sql`INSERT INTO empresa_responsaveis_auditoria (empresa_id, funcao, antes, depois, por) VALUES (${empresaId}, 'responsavel_tecnico', ${antes?.rt ?? null}, ${novo.rt}, ${por})`);
  res.json({ ok: true });
});

export default router;
