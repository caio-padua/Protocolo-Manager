import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import { finContext, finGuards } from "./tenant";
import { FinError, RegraInput, aprovar, ativar, criarRascunho, editarRascunho, enviarParaAprovacao, listarRegras, obterRegra } from "./regras";
import { PerfilInput, SocioInput, criarSocio, editarSocio, encerrarSocio, listarAuditoria, listarSocios, obterEmpresa, salvarPerfil, validarPerfil, validarSocio } from "./cadastro";

/** PAX FINANCE — rotas. Toda rota: colaborador + clínica da sessão + módulo financeiro. */
const router: IRouter = Router();
const wrap = (fn: (req: Request, res: Response) => Promise<unknown>) => async (req: Request, res: Response) => {
  try { await fn(req, res); } catch (e) {
    if (e instanceof FinError) { res.status(e.status).json({ error: e.message }); return; }
    if (e instanceof z.ZodError) { res.status(400).json({ error: e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") }); return; }
    const msg = e instanceof Error ? e.message : "";
    if (/PAX FINANCE:/.test(msg)) { res.status(409).json({ error: msg.replace(/^.*PAX FINANCE:\s*/, "") }); return; }
    req.log?.error({ err: e }, "pax-finance: falha");
    res.status(500).json({ error: "Falha no PAX FINANCE" });
  }
};
const idParam = (req: Request) => { const n = Number(req.params.id); if (!Number.isInteger(n) || n <= 0) throw new FinError(400, "id invalido"); return n; };

router.get("/pax-finance/status", ...finGuards, wrap(async (_req, res) => {
  res.json({
    dominio: "PAX FINANCE", ambiente: "desenvolvimento",
    fases: [
      { fase: 1, nome: "Arquitetura e modelo de dados", estado: "implementada" },
      { fase: 2, nome: "Cadastro de empresas e parametros versionados", estado: "implementada" },
      { fase: 3, nome: "Upload, extracao e revisao humana", estado: "nao_iniciada" },
      { fase: 4, nome: "Maia e tres inteligencias", estado: "nao_iniciada" },
      { fase: 5, nome: "Pax Tax e simuladores", estado: "nao_iniciada" },
      { fase: 6, nome: "Pax Goals", estado: "nao_iniciada" },
      { fase: 7, nome: "Pax Ledger", estado: "nao_iniciada" },
    ],
  });
}));

router.get("/pax-finance/company", ...finGuards, wrap(async (req, res) => { res.json(await obterEmpresa(finContext(req))); }));
router.put("/pax-finance/company/profile", ...finGuards, wrap(async (req, res) => { res.json(await salvarPerfil(finContext(req), PerfilInput.parse(req.body))); }));
router.post("/pax-finance/company/profile/validate", ...finGuards, wrap(async (req, res) => { res.json(await validarPerfil(finContext(req))); }));

router.get("/pax-finance/partners", ...finGuards, wrap(async (req, res) => { res.json(await listarSocios(finContext(req))); }));
router.post("/pax-finance/partners", ...finGuards, wrap(async (req, res) => { res.status(201).json(await criarSocio(finContext(req), SocioInput.parse(req.body))); }));
router.put("/pax-finance/partners/:id", ...finGuards, wrap(async (req, res) => { res.json(await editarSocio(finContext(req), idParam(req), SocioInput.parse(req.body))); }));
router.post("/pax-finance/partners/:id/validate", ...finGuards, wrap(async (req, res) => { res.json(await validarSocio(finContext(req), idParam(req))); }));
router.post("/pax-finance/partners/:id/end", ...finGuards, wrap(async (req, res) => {
  const { fim } = z.object({ fim: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).parse(req.body);
  res.json(await encerrarSocio(finContext(req), idParam(req), fim));
}));

router.get("/pax-finance/rules", ...finGuards, wrap(async (req, res) => {
  res.json(await listarRegras(finContext(req), { status: typeof req.query.status === "string" ? req.query.status : undefined, tributo: typeof req.query.tributo === "string" ? req.query.tributo : undefined }));
}));
router.get("/pax-finance/rules/:id", ...finGuards, wrap(async (req, res) => { res.json(await obterRegra(finContext(req), idParam(req))); }));
router.post("/pax-finance/rules", ...finGuards, wrap(async (req, res) => { res.status(201).json(await criarRascunho(finContext(req), RegraInput.parse(req.body))); }));
router.put("/pax-finance/rules/:id", ...finGuards, wrap(async (req, res) => { res.json(await editarRascunho(finContext(req), idParam(req), RegraInput.parse(req.body))); }));
router.post("/pax-finance/rules/:id/submit", ...finGuards, wrap(async (req, res) => { res.json(await enviarParaAprovacao(finContext(req), idParam(req))); }));
router.post("/pax-finance/rules/:id/approve", ...finGuards, wrap(async (req, res) => { res.json(await aprovar(finContext(req), idParam(req))); }));
router.post("/pax-finance/rules/:id/activate", ...finGuards, wrap(async (req, res) => { res.json(await ativar(finContext(req), idParam(req))); }));

router.get("/pax-finance/audit", ...finGuards, wrap(async (req, res) => { res.json(await listarAuditoria(finContext(req))); }));

export default router;
