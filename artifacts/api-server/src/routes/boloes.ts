import { randomUUID } from "node:crypto";
import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import multer, { MulterError } from "multer";
import { sql } from "drizzle-orm";
import { z } from "zod/v4";
import { db } from "@workspace/db";
import { verifyPortalToken } from "../lib/portal-token";
import { isPlatformOwner } from "../lib/clinical-access";
import { ObjectStorageService } from "../lib/objectStorage";
import { requireCollaborator } from "./collaborator";
import {
  BOLOES_AVISO, BOLOES_COMPROVANTE_MAX_BYTES, auditarBolao, comprovanteDoCliente,
  detectarTipoComprovante, listarParticipacoesDoCliente, sha256Hex,
} from "../lib/boloes";

/**
 * Meus Boloes. Cliente: so leitura e download do recibo real da CAIXA ja validado.
 * Titular da plataforma: cadastro minimo (campanha, participacao, anexo do recibo), sem tela, sem venda.
 * Nada aqui cobra, convida, aposta ou gera bilhete.
 */
const router: IRouter = Router();
const storage = new ObjectStorageService();

// So o cabecalho Authorization vale (nunca ?token=, que vaza em log e historico).
function portalClientId(req: Request): number | null {
  const a = req.headers.authorization;
  return a && a.startsWith("Bearer ") ? verifyPortalToken(a.slice(7)) : null;
}
const unauthorized = (res: Response) => res.status(401).json({ error: "Sessão expirada. Identifique-se novamente." });

router.get("/area-paciente/boloes", async (req, res): Promise<void> => {
  const clientId = portalClientId(req);
  if (!clientId) return void unauthorized(res);
  try {
    res.set("Cache-Control", "private, no-store");
    res.json({ aviso: BOLOES_AVISO, participacoes: await listarParticipacoesDoCliente(clientId) });
  } catch (err) {
    req.log.error({ err: String(err) }, "Falha ao listar boloes do cliente");
    res.status(500).json({ error: "Não foi possível carregar seus bolões agora." });
  }
});

const EXT: Record<string, string> = { "application/pdf": "pdf", "image/png": "png", "image/jpeg": "jpg" };

router.get("/area-paciente/boloes/comprovantes/:id/download", async (req, res): Promise<void> => {
  const clientId = portalClientId(req);
  if (!clientId) return void unauthorized(res);
  const idTxt = String(req.params.id ?? "");
  const id = /^[1-9]\d{0,9}$/.test(idTxt) ? Number(idTxt) : null;
  try {
    const comp = id ? await comprovanteDoCliente(clientId, id) : null;
    if (!comp) {
      // 404 uniforme: nao revela se o comprovante existe para outra pessoa.
      await auditarBolao({ clientId, ator: `cliente:${clientId}`, acao: "download", comprovanteId: id, resultado: "negado", detalhe: "comprovante inexistente ou nao pertence ao cliente" });
      res.status(404).json({ error: "Comprovante oficial ainda não disponível." });
      return;
    }
    const bytes = await storage.readPrivateObject(comp.storageKey);
    if (bytes.length !== comp.bytes || sha256Hex(bytes) !== comp.sha256) {
      await auditarBolao({ empresaId: comp.empresaId, clientId, ator: `cliente:${clientId}`, acao: "download", participacaoId: comp.participacaoId, comprovanteId: comp.id, resultado: "erro", detalhe: "integridade do arquivo divergente" });
      res.status(409).json({ error: "O arquivo do comprovante não passou na conferência de integridade. A clínica foi avisada." });
      return;
    }
    // A trilha vem ANTES dos bytes: se nao gravar, nao entrega.
    await auditarBolao({ empresaId: comp.empresaId, clientId, ator: `cliente:${clientId}`, acao: "download", participacaoId: comp.participacaoId, comprovanteId: comp.id, resultado: "ok" });
    res.set({
      "Content-Type": comp.mime,
      "Content-Length": String(bytes.length),
      "Content-Disposition": `attachment; filename="comprovante-caixa-${comp.id}.${EXT[comp.mime] ?? "bin"}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    });
    res.status(200).end(bytes);
  } catch (err) {
    req.log.error({ err: String(err) }, "Falha no download de comprovante de bolao");
    res.status(500).json({ error: "Não foi possível baixar o comprovante agora." });
  }
});

// ---- Titular da plataforma: cadastro minimo ----
async function owner(req: Request, res: Response): Promise<number | null> {
  const actor = Number(req.collaborator?.professionalId);
  if (!Number.isSafeInteger(actor) || actor <= 0) { res.status(401).json({ error: "Faça login de colaborador." }); return null; }
  if (!(await isPlatformOwner(actor))) { res.status(403).json({ error: "Acesso restrito ao titular da plataforma." }); return null; }
  return actor;
}

const Campanha = z.object({
  empresaId: z.number().int().positive(),
  nome: z.string().trim().min(1).max(120),
  concurso: z.string().trim().max(60).optional(),
  dataSorteio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
}).strict();

router.post("/boloes/campanhas", requireCollaborator, async (req, res): Promise<void> => {
  const actor = await owner(req, res);
  if (!actor) return;
  const b = Campanha.safeParse(req.body);
  if (!b.success) { res.status(400).json({ error: "Informe empresa, nome (até 120 caracteres) e, se houver, concurso e data AAAA-MM-DD." }); return; }
  const emp: any = (await db.execute(sql`SELECT id FROM empresas WHERE id = ${b.data.empresaId}`)).rows[0];
  if (!emp) { res.status(404).json({ error: "Empresa não encontrada." }); return; }
  const out = await db.transaction(async (tx) => {
    const r: any = (await tx.execute(sql`
      INSERT INTO boloes_campanhas (empresa_id, nome, concurso, data_sorteio, criado_por)
      VALUES (${b.data.empresaId}, ${b.data.nome}, ${b.data.concurso ?? null}, ${b.data.dataSorteio ?? null}, ${actor}) RETURNING id`)).rows[0];
    await auditarBolao({ empresaId: b.data.empresaId, ator: `titular:${actor}`, acao: "campanha_criada", resultado: "ok", detalhe: `campanha ${r.id}` }, tx);
    return r.id as number;
  });
  res.status(201).json({ id: out });
});

const Participacao = z.object({
  campanhaId: z.number().int().positive(),
  clientId: z.number().int().positive(),
  cotas: z.number().int().min(1).max(1000),
}).strict();

router.post("/boloes/participacoes", requireCollaborator, async (req, res): Promise<void> => {
  const actor = await owner(req, res);
  if (!actor) return;
  const b = Participacao.safeParse(req.body);
  if (!b.success) { res.status(400).json({ error: "Informe campanha, cliente e cotas (1 a 1000)." }); return; }
  const code = await db.transaction(async (tx) => {
    const ca: any = (await tx.execute(sql`SELECT id, empresa_id FROM boloes_campanhas WHERE id = ${b.data.campanhaId}`)).rows[0];
    const cl: any = (await tx.execute(sql`SELECT id, empresa_id FROM clients WHERE id = ${b.data.clientId} AND deleted_at IS NULL`)).rows[0];
    if (!ca || !cl) return { s: 404 as const };
    // A clinica do cliente e a da campanha precisam ser a mesma: nunca se cruza clinica.
    if (ca.empresa_id !== cl.empresa_id) return { s: 409 as const };
    const ins: any = await tx.execute(sql`
      INSERT INTO boloes_participacoes (empresa_id, campanha_id, client_id, cotas, criado_por)
      VALUES (${ca.empresa_id}, ${ca.id}, ${cl.id}, ${b.data.cotas}, ${actor})
      ON CONFLICT (campanha_id, client_id) DO NOTHING RETURNING id`);
    if (!ins.rows[0]) return { s: 409 as const, dup: true };
    await auditarBolao({ empresaId: ca.empresa_id, clientId: cl.id, ator: `titular:${actor}`, acao: "participacao_criada", participacaoId: ins.rows[0].id, resultado: "ok" }, tx);
    return { s: 201 as const, id: ins.rows[0].id as number };
  });
  if (code.s === 404) { res.status(404).json({ error: "Campanha ou cliente não encontrado." }); return; }
  if (code.s === 409) { res.status(409).json({ error: "dup" in code ? "Este cliente já tem participação nesta campanha." : "Cliente e campanha pertencem a clínicas diferentes." }); return; }
  res.status(201).json({ id: code.id });
});

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: BOLOES_COMPROVANTE_MAX_BYTES, files: 1 } });
function uploadMw(req: Request, res: Response, next: NextFunction): void {
  upload.single("file")(req, res, (err: unknown) => {
    if (err instanceof MulterError) {
      res.status(400).json({ error: err.code === "LIMIT_FILE_SIZE" ? "Arquivo maior que 10 MB." : "Arquivo inválido." });
      return;
    }
    if (err) { res.status(400).json({ error: "Falha no envio do arquivo." }); return; }
    next();
  });
}

router.post("/boloes/participacoes/:id/comprovante", requireCollaborator, uploadMw, async (req, res): Promise<void> => {
  const actor = await owner(req, res);
  if (!actor) return;
  const id = /^[1-9]\d{0,9}$/.test(String(req.params.id)) ? Number(req.params.id) : null;
  const file = req.file;
  if (!id) { res.status(400).json({ error: "Participação inválida." }); return; }
  // A confirmacao e do titular: o sistema NAO consulta a CAIXA e nao desenha recibo.
  if (req.body?.confirmoReciboCaixaReal !== "true") {
    res.status(400).json({ error: "Confirme que o arquivo é o recibo real da CAIXA, já recebido e conferido." }); return;
  }
  if (!file || file.size === 0) { res.status(400).json({ error: "Envie o arquivo do recibo (não pode estar vazio)." }); return; }
  const tipo = detectarTipoComprovante(file.buffer);
  if (!tipo) { res.status(422).json({ error: "Tipo de arquivo não aceito. Envie PDF, PNG ou JPEG." }); return; }

  const part: any = (await db.execute(sql`SELECT id, empresa_id, client_id, status FROM boloes_participacoes WHERE id = ${id}`)).rows[0];
  if (!part) { res.status(404).json({ error: "Participação não encontrada." }); return; }
  if (part.status === "cancelada") { res.status(409).json({ error: "Participação cancelada não recebe comprovante." }); return; }

  const key = `boloes-comprovantes/${part.empresa_id}/${randomUUID()}`;
  await storage.savePrivateObject(key, file.buffer, tipo.mime);
  try {
    const compId = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT id FROM boloes_participacoes WHERE id = ${id} FOR UPDATE`);
      const ins: any = await tx.execute(sql`
        INSERT INTO boloes_comprovantes (empresa_id, participacao_id, storage_key, mime, bytes, sha256, validado_por)
        VALUES (${part.empresa_id}, ${id}, ${key}, ${tipo.mime}, ${file.size}, ${sha256Hex(file.buffer)}, ${actor})
        ON CONFLICT DO NOTHING RETURNING id`);
      if (!ins.rows[0]) return null;
      await tx.execute(sql`UPDATE boloes_participacoes SET status = 'registrada', registrada_em = NOW() WHERE id = ${id}`);
      await auditarBolao({ empresaId: part.empresa_id, clientId: part.client_id, ator: `titular:${actor}`, acao: "comprovante_anexado", participacaoId: id, comprovanteId: ins.rows[0].id, resultado: "ok" }, tx);
      return ins.rows[0].id as number;
    });
    if (compId === null) {
      await storage.deletePrivateObject(key).catch(() => undefined);
      res.status(409).json({ error: "Esta participação já tem comprovante ativo." });
      return;
    }
    res.status(201).json({ id: compId, tipo: tipo.mime });
  } catch (err) {
    await storage.deletePrivateObject(key).catch(() => undefined);
    req.log.error({ err: String(err) }, "Falha ao anexar comprovante de bolao");
    res.status(500).json({ error: "Não foi possível anexar o comprovante." });
  }
});

export default router;
