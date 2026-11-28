import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import multer, { MulterError } from "multer";
import { sql } from "drizzle-orm";
import { z } from "zod/v4";
import { db } from "@workspace/db";
import { verifyPortalToken } from "../lib/portal-token";
import { isPlatformOwner } from "../lib/clinical-access";
import { ObjectStorageService } from "../lib/objectStorage";
import { requireCollaborator } from "./collaborator";
import { anexarComprovante, criarCampanha, criarParticipacao } from "../lib/boloes-gestao";
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
  const out = await criarCampanha({ empresaId: b.data.empresaId, nome: b.data.nome, concurso: b.data.concurso, dataSorteio: b.data.dataSorteio, ator: { texto: `titular:${actor}`, profissionalId: actor } });
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
  const code = await criarParticipacao({ empresaId: null, campanhaId: b.data.campanhaId, clientId: b.data.clientId, cotas: b.data.cotas, ator: { texto: `titular:${actor}`, profissionalId: actor } });
  if (code.s === 404) { res.status(404).json({ error: "Campanha ou cliente não encontrado." }); return; }
  if (code.s === 409) { res.status(409).json({ error: code.dup ? "Este cliente já tem participação nesta campanha." : "Cliente e campanha pertencem a clínicas diferentes." }); return; }
  res.status(201).json({ id: code.id });
});

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: BOLOES_COMPROVANTE_MAX_BYTES, files: 1 } });
export function uploadMw(req: Request, res: Response, next: NextFunction): void {
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

  try {
    const r = await anexarComprovante(storage, { empresaId: null, participacaoId: id, origem: { buffer: file.buffer, tipo }, ator: { texto: `titular:${actor}`, profissionalId: actor } });
    if (r.ok) { res.status(201).json({ id: r.comprovanteId, tipo: tipo.mime }); return; }
    if (r.motivo === "participacao_inexistente") res.status(404).json({ error: "Participação não encontrada." });
    else if (r.motivo === "cancelada") res.status(409).json({ error: "Participação cancelada não recebe comprovante." });
    else if (r.motivo === "arquivo_duplicado") res.status(409).json({ error: "Este mesmo arquivo já é comprovante de outra participação." });
    else res.status(409).json({ error: "Esta participação já tem comprovante ativo." });
  } catch (err) {
    req.log.error({ err: String(err) }, "Falha ao anexar comprovante de bolao");
    res.status(500).json({ error: "Não foi possível anexar o comprovante." });
  }
});

export default router;
