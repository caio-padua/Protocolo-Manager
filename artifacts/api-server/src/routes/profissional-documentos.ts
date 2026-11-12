import { Router, type IRouter, type NextFunction, type Request, type Response } from "express";
import multer, { MulterError } from "multer";
import { requireCollaborator } from "./collaborator";
import { professionalIdsForCompany } from "./professionals";
import {
  DocumentoErro, MAX_BYTES, SITUACOES, TIPOS, auditarDocumento, autorizarDocumentos, enviarDocumento, lerArquivo, listarDocumentos,
  mudarSituacao, revisarDado, sugerirDados, type TipoDocumento,
} from "../lib/profissional-documentos";

/**
 * Aba "Documentos" do profissional. Qualquer categoria de profissional pode ter documentos; quem envia/vê é o proprietário,
 * o próprio titular ou quem a matriz de Governança autorizou, sempre dentro da empresa da sessão.
 */
const router: IRouter = Router();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_BYTES, files: 1 } });
function uploadMw(req: Request, res: Response, next: NextFunction): void {
  upload.single("file")(req, res, (err: unknown) => {
    if (err instanceof MulterError) {
      res.status(err.code === "LIMIT_FILE_SIZE" ? 413 : 400).json({ code: "upload_invalido", error: err.code === "LIMIT_FILE_SIZE" ? "Arquivo maior que 10 MB." : "Envio inválido." });
      return;
    }
    if (err) { res.status(400).json({ code: "upload_invalido", error: "Falha no envio." }); return; }
    next();
  });
}

const pertence = async (empresaId: number, id: number) => (await professionalIdsForCompany(empresaId)).includes(id);
const idDe = (v: unknown) => (/^[1-9]\d{0,9}$/.test(String(v ?? "")) ? Number(v) : null);

function recusar(res: Response, e: unknown) {
  if (e instanceof DocumentoErro) { res.status(e.status).json({ code: e.code, error: e.message }); return; }
  throw e;
}

async function acesso(req: Request, res: Response) {
  const id = idDe(req.params.id);
  if (!id) { res.status(400).json({ code: "pedido_invalido", error: "Identificador inválido." }); return null; }
  const a = await autorizarDocumentos(req, id, pertence);
  if (!a.ok) { res.status(a.status).json({ code: a.code, error: a.error }); return null; }
  return { ...a, professionalId: id };
}

router.get("/professionals/:id/documentos", requireCollaborator, async (req, res): Promise<void> => {
  const a = await acesso(req, res); if (!a) return;
  res.setHeader("Cache-Control", "no-store");
  res.json({ documentos: await listarDocumentos(a.empresaId, a.professionalId, req.query.arquivados === "1") });
});

router.post("/professionals/:id/documentos", requireCollaborator, uploadMw, async (req, res): Promise<void> => {
  const a = await acesso(req, res); if (!a) return;
  if (!req.file) { res.status(400).json({ code: "sem_arquivo", error: "Envie o arquivo no campo 'file'." }); return; }
  const tipo = String(req.body?.tipo ?? "");
  if (!(TIPOS as readonly string[]).includes(tipo)) { res.status(400).json({ code: "tipo_invalido", error: `Tipo de documento inválido. Use: ${TIPOS.join(", ")}.` }); return; }
  try {
    const doc = await enviarDocumento({
      empresaId: a.empresaId, professionalId: a.professionalId, ator: a.me, arquivo: req.file.buffer,
      nomeOriginal: Buffer.from(req.file.originalname, "latin1").toString("utf8"), tipo: tipo as TipoDocumento,
      titulo: typeof req.body?.titulo === "string" ? req.body.titulo : undefined,
      titularDeclarado: typeof req.body?.titularDeclarado === "string" ? req.body.titularDeclarado : null,
      observacao: typeof req.body?.observacao === "string" ? req.body.observacao : null,
      situacaoInicial: req.body?.titularDivergente === "true" ? "titular_divergente" : "pendente_confirmacao",
    });
    res.status(201).json({ documento: doc });
  } catch (e) { recusar(res, e); }
});

router.get("/professionals/:id/documentos/:docId/arquivo", requireCollaborator, async (req, res): Promise<void> => {
  const a = await acesso(req, res); if (!a) return;
  const docId = idDe(req.params.docId);
  if (!docId) { res.status(400).json({ code: "pedido_invalido", error: "Identificador inválido." }); return; }
  try {
    const f = await lerArquivo(a.empresaId, a.professionalId, docId);
    await auditarDocumento(a.empresaId, a.professionalId, docId, a.me, "visualizou");
    res.setHeader("Content-Type", f.mime);
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(f.nome)}`);
    res.setHeader("Content-Length", String(f.buffer.length));
    res.end(f.buffer);
  } catch (e) { recusar(res, e); }
});

router.patch("/professionals/:id/documentos/:docId", requireCollaborator, async (req, res): Promise<void> => {
  const a = await acesso(req, res); if (!a) return;
  const docId = idDe(req.params.docId);
  const situacao = String(req.body?.situacao ?? "");
  if (!docId || !(SITUACOES as readonly string[]).includes(situacao)) { res.status(400).json({ code: "pedido_invalido", error: "Situação inválida." }); return; }
  // O titular não confirma o próprio documento: conferência é de outra pessoa (ou do proprietário).
  if (situacao === "confirmado" && a.me === a.professionalId && !a.dono) {
    res.status(403).json({ code: "autoconfirmacao", error: "O próprio titular não confirma seu documento." }); return;
  }
  try {
    res.json({ documento: await mudarSituacao(a.empresaId, a.professionalId, docId, a.me, situacao as (typeof SITUACOES)[number],
      typeof req.body?.observacao === "string" ? req.body.observacao : null) });
  } catch (e) { recusar(res, e); }
});

router.post("/professionals/:id/documentos/:docId/dados", requireCollaborator, async (req, res): Promise<void> => {
  const a = await acesso(req, res); if (!a) return;
  const docId = idDe(req.params.docId);
  const dados = Array.isArray(req.body?.dados) ? (req.body.dados as { campo?: unknown; valor?: unknown }[]) : null;
  if (!docId || !dados || !dados.length || dados.length > 20 || dados.some((d) => typeof d.campo !== "string" || typeof d.valor !== "string")) {
    res.status(400).json({ code: "pedido_invalido", error: "Informe a lista de dados sugeridos." }); return;
  }
  try {
    await sugerirDados(a.empresaId, a.professionalId, docId, a.me, dados as { campo: string; valor: string }[]);
    res.status(201).json({ documentos: await listarDocumentos(a.empresaId, a.professionalId) });
  } catch (e) { recusar(res, e); }
});

router.patch("/professionals/:id/documentos/:docId/dados/:campo", requireCollaborator, async (req, res): Promise<void> => {
  const a = await acesso(req, res); if (!a) return;
  const docId = idDe(req.params.docId);
  const acao = req.body?.acao;
  if (!docId || (acao !== "aceitar" && acao !== "recusar")) { res.status(400).json({ code: "pedido_invalido", error: "Use acao: aceitar ou recusar." }); return; }
  if (acao === "aceitar" && a.me === a.professionalId && !a.dono) {
    res.status(403).json({ code: "autoconfirmacao", error: "O próprio titular não aceita dados do seu documento no cadastro." }); return;
  }
  try { res.json(await revisarDado(a.empresaId, a.professionalId, docId, a.me, String(req.params.campo), acao)); } catch (e) { recusar(res, e); }
});

export default router;
