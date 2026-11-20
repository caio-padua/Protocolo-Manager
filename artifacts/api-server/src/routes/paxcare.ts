import { randomUUID } from "node:crypto";
import { Router, type IRouter, type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import { sql } from "drizzle-orm";
import { z } from "zod/v4";
import { db } from "@workspace/db";
import { verifyPatientToken } from "../lib/portal-token";
import { requireCollaborator } from "./collaborator.js";
import { requireMessageClinic } from "../middleware/messageClinic.js";
import { ObjectStorageService } from "../lib/objectStorage.js";
import { isTipoCofre, tiposVisiveis, tipoDoArquivo, nomeSeguro, LIMITE_ARQUIVO_BYTES, type Compartilhamento } from "../lib/paxcare.js";

/**
 * PAXCARE: cofre do paciente + vinculos com clinicas.
 * O clientId do paciente vem SEMPRE do token do portal (anti-IDOR). O cofre pertence ao paciente;
 * cada clinica so le o que o paciente compartilhou com ELA, e a revogacao vale na leitura seguinte.
 */
const router: IRouter = Router();
const storage = new ObjectStorageService();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: LIMITE_ARQUIVO_BYTES, files: 1 } });

function pacienteId(req: Request): number | null {
  const a = req.headers.authorization;
  return a && a.startsWith("Bearer ") ? verifyPatientToken(a.slice(7)) : null;
}
function exigePaciente(req: Request, res: Response, next: NextFunction): void {
  const id = pacienteId(req);
  if (id === null) { res.status(401).json({ error: "Sessão expirada. Identifique-se novamente." }); return; }
  (req as Request & { paxcareClientId?: number }).paxcareClientId = id;
  next();
}
const cid = (req: Request) => (req as Request & { paxcareClientId?: number }).paxcareClientId!;
const idParam = (v: unknown) => { const n = Number(v); return Number.isSafeInteger(n) && n > 0 ? n : null; };

type Vinculo = { id: number; empresa_id: number; status: string; comp_historico: boolean; comp_exames: boolean; comp_documentos: boolean; criado_em: string; revogado_em: string | null; nome?: string; cidade?: string | null; estado?: string | null };
const vinculoView = (v: Vinculo) => ({
  id: v.id, empresaId: v.empresa_id, clinica: v.nome ?? null, local: [v.cidade, v.estado].filter(Boolean).join("/") || null,
  status: v.status, criadoEm: v.criado_em, revogadoEm: v.revogado_em,
  compartilha: { historico: v.comp_historico, exames: v.comp_exames, documentos: v.comp_documentos },
});
async function hist(vinculoId: number, acao: string, detalhe?: string) {
  await db.execute(sql`INSERT INTO paxcare_vinculos_hist (vinculo_id, acao, detalhe) VALUES (${vinculoId}, ${acao}, ${detalhe ?? null})`);
}

// ---------------------------- PACIENTE ----------------------------------------
router.get("/area-paciente/paxcare/cofre", exigePaciente, async (req, res): Promise<void> => {
  const id = cid(req);
  try {
    const itens = (await db.execute(sql`
      SELECT id, tipo, titulo, to_char(data_ref,'YYYY-MM-DD') AS data_ref, notas, (arquivo IS NOT NULL) AS tem_arquivo, arquivo_nome, criado_em
        FROM paxcare_cofre_itens WHERE client_id=${id} AND removido_em IS NULL ORDER BY COALESCE(data_ref, criado_em::date) DESC, id DESC LIMIT 500`)).rows;
    const ex = (await db.execute(sql`SELECT COUNT(*)::int AS n, to_char(MAX(collection_date),'YYYY-MM-DD') AS ultima FROM exam_results WHERE client_id=${id}`)).rows[0] as { n: number; ultima: string | null };
    const origem = (await db.execute(sql`SELECT e.id, e.nome FROM clients c JOIN empresas e ON e.id=c.empresa_id WHERE c.id=${id}`)).rows[0] as { id: number; nome: string } | undefined;
    res.setHeader("Cache-Control", "private, no-store");
    res.json({
      itens: itens.map((r) => ({ id: r.id, tipo: r.tipo, titulo: r.titulo, dataRef: r.data_ref, notas: r.notas, temArquivo: r.tem_arquivo, arquivoNome: r.arquivo_nome, criadoEm: r.criado_em })),
      examesDaClinica: { total: ex.n, ultimaColeta: ex.ultima },
      clinicaOrigem: origem ? { id: origem.id, nome: origem.nome } : null,
    });
  } catch (err) { req.log.error({ err: String(err) }, "paxcare cofre"); res.status(500).json({ error: "Não foi possível carregar seu cofre." }); }
});

const NovoItem = z.object({
  tipo: z.string(), titulo: z.string().trim().min(2, "Dê um título.").max(160),
  dataRef: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
  notas: z.string().trim().max(4000).optional(),
});
router.post("/area-paciente/paxcare/cofre", exigePaciente, (req, res, next) => {
  upload.single("arquivo")(req, res, (err: unknown) => {
    if (err) { res.status(400).json({ error: (err as { code?: string }).code === "LIMIT_FILE_SIZE" ? "Arquivo maior que 8 MB." : "Arquivo inválido." }); return; }
    next();
  });
}, async (req, res): Promise<void> => {
  const id = cid(req);
  const p = NovoItem.safeParse(req.body);
  if (!p.success || !isTipoCofre(p.data.tipo)) { res.status(400).json({ error: "Informe o tipo (histórico, exame externo ou documento) e um título." }); return; }
  const file = (req as Request & { file?: Express.Multer.File }).file;
  const notas = p.data.notas?.trim() || null;
  if (!file && !notas) { res.status(400).json({ error: "Anexe um arquivo ou escreva uma observação." }); return; }
  let caminho: string | null = null, mime: string | null = null;
  try {
    if (file) {
      const t = tipoDoArquivo(file.buffer);
      if (!t) { res.status(400).json({ error: "Envie PDF, JPG ou PNG." }); return; }
      caminho = `paxcare/${id}/${randomUUID()}.${t.ext}`; mime = t.mime;
      await storage.savePrivateObject(caminho, file.buffer, t.mime);
    }
    const ins = (await db.execute(sql`
      INSERT INTO paxcare_cofre_itens (client_id, tipo, titulo, data_ref, notas, arquivo, arquivo_tipo, arquivo_nome)
      VALUES (${id}, ${p.data.tipo}, ${p.data.titulo}, ${p.data.dataRef ? p.data.dataRef : null}, ${notas}, ${caminho}, ${mime}, ${nomeSeguro(file?.originalname)})
      RETURNING id`)).rows[0] as { id: number };
    res.status(201).json({ id: ins.id });
  } catch (err) { req.log.error({ err: String(err) }, "paxcare novo item"); res.status(500).json({ error: "Não foi possível guardar no cofre." }); }
});

router.get("/area-paciente/paxcare/cofre/:itemId/arquivo", exigePaciente, async (req, res): Promise<void> => {
  const item = idParam(req.params.itemId);
  if (!item) { res.status(400).json({ error: "Item inválido." }); return; }
  await enviarArquivo(res, item, cid(req), null);
});

router.delete("/area-paciente/paxcare/cofre/:itemId", exigePaciente, async (req, res): Promise<void> => {
  const item = idParam(req.params.itemId);
  if (!item) { res.status(400).json({ error: "Item inválido." }); return; }
  // Remocao logica: o arquivo fica guardado (Regra de Ouro); a clinica deixa de ver na hora.
  const r = await db.execute(sql`UPDATE paxcare_cofre_itens SET removido_em=NOW() WHERE id=${item} AND client_id=${cid(req)} AND removido_em IS NULL RETURNING id`);
  if (!r.rows[0]) { res.status(404).json({ error: "Item não encontrado." }); return; }
  res.json({ ok: true });
});

async function enviarArquivo(res: Response, itemId: number, clientId: number, tipos: string[] | null): Promise<void> {
  const row = (await db.execute(sql`
    SELECT arquivo, arquivo_tipo, arquivo_nome, tipo FROM paxcare_cofre_itens WHERE id=${itemId} AND client_id=${clientId} AND removido_em IS NULL AND arquivo IS NOT NULL`)).rows[0] as
    { arquivo: string; arquivo_tipo: string; arquivo_nome: string | null; tipo: string } | undefined;
  if (!row || (tipos && !tipos.includes(row.tipo))) { res.status(404).json({ error: "Arquivo não encontrado." }); return; }
  try {
    const buf = await storage.readPrivateObject(row.arquivo);
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Disposition", `inline; filename="${(row.arquivo_nome ?? "documento").replace(/"/g, "")}"`);
    res.type(row.arquivo_tipo).send(buf);
  } catch { res.status(404).json({ error: "Arquivo não encontrado." }); }
}

router.get("/area-paciente/paxcare/clinicas", exigePaciente, async (req, res): Promise<void> => {
  const id = cid(req);
  const vinc = (await db.execute(sql`
    SELECT v.*, e.nome, e.cidade, e.estado FROM paxcare_vinculos v JOIN empresas e ON e.id=v.empresa_id WHERE v.client_id=${id} ORDER BY v.id`)).rows as unknown as Vinculo[];
  const usadas = new Set(vinc.filter((v) => v.status === "ativo").map((v) => v.empresa_id));
  const disp = (await db.execute(sql`SELECT id, nome, cidade, estado FROM empresas WHERE ativa=true AND status='ATIVO' AND tipo='clinic' ORDER BY nome LIMIT 200`)).rows as Array<{ id: number; nome: string; cidade: string | null; estado: string | null }>;
  res.setHeader("Cache-Control", "private, no-store");
  res.json({
    vinculos: vinc.map(vinculoView),
    disponiveis: disp.filter((e) => !usadas.has(e.id)).map((e) => ({ id: e.id, nome: e.nome, local: [e.cidade, e.estado].filter(Boolean).join("/") || null })),
  });
});

const Comp = z.object({ historico: z.boolean(), exames: z.boolean(), documentos: z.boolean() }).strict();
const NovoVinculo = z.object({ empresaId: z.number().int().positive(), compartilha: Comp }).strict();
router.post("/area-paciente/paxcare/vinculos", exigePaciente, async (req, res): Promise<void> => {
  const p = NovoVinculo.safeParse(req.body);
  if (!p.success) { res.status(400).json({ error: "Escolha a clínica e o que compartilhar." }); return; }
  const id = cid(req), c = p.data.compartilha;
  try {
    const emp = (await db.execute(sql`SELECT id FROM empresas WHERE id=${p.data.empresaId} AND ativa=true AND status='ATIVO' AND tipo='clinic'`)).rows[0];
    if (!emp) { res.status(404).json({ error: "Clínica não encontrada." }); return; }
    // Upsert atomico: dois cliques simultaneos geram um unico vinculo (indice unico cliente+clinica).
    const row = (await db.execute(sql`
      INSERT INTO paxcare_vinculos (client_id, empresa_id, comp_historico, comp_exames, comp_documentos)
      VALUES (${id}, ${p.data.empresaId}, ${c.historico}, ${c.exames}, ${c.documentos})
      ON CONFLICT (client_id, empresa_id) DO UPDATE SET status='ativo', revogado_em=NULL, atualizado_em=NOW(),
        comp_historico=EXCLUDED.comp_historico, comp_exames=EXCLUDED.comp_exames, comp_documentos=EXCLUDED.comp_documentos
      RETURNING id`)).rows[0] as { id: number };
    await hist(row.id, "vinculou", JSON.stringify(c));
    res.status(201).json({ id: row.id });
  } catch (err) { req.log.error({ err: String(err) }, "paxcare vincular"); res.status(500).json({ error: "Não foi possível vincular." }); }
});

// PATCH parcial: cada requisicao muda SO as categorias enviadas (COALESCE), entao pedidos
// simultaneos sobre categorias diferentes nunca desfazem a escolha um do outro.
const CompParcial = z.object({ historico: z.boolean().optional(), exames: z.boolean().optional(), documentos: z.boolean().optional() }).strict()
  .refine((o) => Object.values(o).some((v) => v !== undefined));
router.patch("/area-paciente/paxcare/vinculos/:id", exigePaciente, async (req, res): Promise<void> => {
  const vid = idParam(req.params.id); const p = CompParcial.safeParse(req.body);
  if (!vid || !p.success) { res.status(400).json({ error: "Dados inválidos." }); return; }
  const d = p.data;
  const r = await db.execute(sql`
    UPDATE paxcare_vinculos SET comp_historico=COALESCE(${d.historico ?? null}::boolean, comp_historico),
      comp_exames=COALESCE(${d.exames ?? null}::boolean, comp_exames),
      comp_documentos=COALESCE(${d.documentos ?? null}::boolean, comp_documentos), atualizado_em=NOW()
     WHERE id=${vid} AND client_id=${cid(req)} AND status='ativo' RETURNING id`);
  if (!r.rows[0]) { res.status(404).json({ error: "Vínculo ativo não encontrado." }); return; }
  await hist(vid, "alterou", JSON.stringify(d));
  res.json({ ok: true });
});

router.delete("/area-paciente/paxcare/vinculos/:id", exigePaciente, async (req, res): Promise<void> => {
  const vid = idParam(req.params.id);
  if (!vid) { res.status(400).json({ error: "Vínculo inválido." }); return; }
  const r = await db.execute(sql`
    UPDATE paxcare_vinculos SET status='revogado', comp_historico=FALSE, comp_exames=FALSE, comp_documentos=FALSE, revogado_em=NOW(), atualizado_em=NOW()
     WHERE id=${vid} AND client_id=${cid(req)} AND status='ativo' RETURNING id`);
  if (!r.rows[0]) { res.status(404).json({ error: "Vínculo ativo não encontrado." }); return; }
  await hist(vid, "revogou");
  res.json({ ok: true });
});

// ----------------------------- CLINICA ----------------------------------------
async function compartilhamentoDe(clientId: number, empresaId: number): Promise<Compartilhamento | null> {
  const r = (await db.execute(sql`SELECT comp_historico, comp_exames, comp_documentos FROM paxcare_vinculos WHERE client_id=${clientId} AND empresa_id=${empresaId} AND status='ativo'`)).rows[0] as
    { comp_historico: boolean; comp_exames: boolean; comp_documentos: boolean } | undefined;
  return r ? { historico: r.comp_historico, exames: r.comp_exames, documentos: r.comp_documentos } : null;
}

router.get("/collaborator/paxcare/compartilhados", requireCollaborator, requireMessageClinic, async (req, res): Promise<void> => {
  const rows = (await db.execute(sql`
    SELECT v.client_id, c.name, right(regexp_replace(coalesce(c.cpf,''),'\D','','g'),4) AS cpf_final, v.comp_historico, v.comp_exames, v.comp_documentos,
           (SELECT COUNT(*)::int FROM paxcare_cofre_itens i WHERE i.client_id=v.client_id AND i.removido_em IS NULL AND (
              (i.tipo='historico' AND v.comp_historico) OR (i.tipo='exame_externo' AND v.comp_exames) OR (i.tipo='documento' AND v.comp_documentos))) AS itens
      FROM paxcare_vinculos v JOIN clients c ON c.id=v.client_id
     WHERE v.empresa_id=${req.messageEmpresaId!} AND v.status='ativo' AND (v.comp_historico OR v.comp_exames OR v.comp_documentos)
     ORDER BY c.name LIMIT 500`)).rows as Array<{ client_id: number; name: string; cpf_final: string; comp_historico: boolean; comp_exames: boolean; comp_documentos: boolean; itens: number }>;
  res.setHeader("Cache-Control", "private, no-store");
  res.json(rows.map((r) => ({ clientId: r.client_id, nome: r.name, cpfFinal: r.cpf_final, itens: r.itens, compartilha: { historico: r.comp_historico, exames: r.comp_exames, documentos: r.comp_documentos } })));
});

router.get("/collaborator/paxcare/clientes/:clientId/cofre", requireCollaborator, requireMessageClinic, async (req, res): Promise<void> => {
  const clientId = idParam(req.params.clientId);
  const comp = clientId ? await compartilhamentoDe(clientId, req.messageEmpresaId!) : null;
  const tipos = comp ? tiposVisiveis(comp) : [];
  if (!clientId || !comp || tipos.length === 0) { res.status(403).json({ error: "O paciente não compartilha o cofre com esta clínica." }); return; }
  const itens = (await db.execute(sql`
    SELECT id, tipo, titulo, to_char(data_ref,'YYYY-MM-DD') AS data_ref, notas, (arquivo IS NOT NULL) AS tem_arquivo, arquivo_nome, criado_em
      FROM paxcare_cofre_itens WHERE client_id=${clientId} AND removido_em IS NULL AND tipo = ANY(${sql.raw("ARRAY[" + tipos.map((t) => `'${t}'`).join(",") + "]::text[]")})
     ORDER BY COALESCE(data_ref, criado_em::date) DESC, id DESC LIMIT 500`)).rows;
  res.setHeader("Cache-Control", "private, no-store");
  res.json({ compartilha: comp, itens: itens.map((r) => ({ id: r.id, tipo: r.tipo, titulo: r.titulo, dataRef: r.data_ref, notas: r.notas, temArquivo: r.tem_arquivo, arquivoNome: r.arquivo_nome, criadoEm: r.criado_em })) });
});

router.get("/collaborator/paxcare/clientes/:clientId/cofre/:itemId/arquivo", requireCollaborator, requireMessageClinic, async (req, res): Promise<void> => {
  const clientId = idParam(req.params.clientId), item = idParam(req.params.itemId);
  const comp = clientId ? await compartilhamentoDe(clientId, req.messageEmpresaId!) : null;
  const tipos = comp ? tiposVisiveis(comp) : [];
  if (!clientId || !item || tipos.length === 0) { res.status(403).json({ error: "O paciente não compartilha o cofre com esta clínica." }); return; }
  await enviarArquivo(res, item, clientId, tipos);
});

export default router;
