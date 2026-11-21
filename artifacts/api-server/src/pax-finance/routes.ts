import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import { finContext, finGuards } from "./tenant";
import { FinError, RegraInput, aprovar, ativar, criarRascunho, editarRascunho, enviarParaAprovacao, listarRegras, obterRegra } from "./regras";
import { MetaInput, MarcoInput, CreditoInput, apagarMeta, listarCredito, listarMarcos, listarMetas, novaVersaoCredito, resumoGoals, salvarMarco, salvarMeta, semearCredito } from "./goals";
import { PERIOD_TYPES, type PeriodType } from "./goals-calc";
import { EntidadeInput, PessoaInput, adicionarPessoa, carregarRascunhoPadumann, criarEntidade, editarEntidade, listarEntidades, validarEntidade } from "./entidades";
import { SimInput, simular } from "./simulador";
import { LancInput, cancelarLancamento, criarLancamento, livroCaixa } from "./ledger";
import { listarEmpresasSeletor } from "./empresas";
import { CenarioMesInput, apagarDemo, lerCenario, salvarMesDemo, semearDemo } from "./cenario";
import { SimCreditoInput, CATALOGO, compararCredito, simularCredito } from "./credito";
import { PainelInput, calcularPainel } from "./painel-tributario";
import { CreditoPainelInput, painelCredito } from "./credito-pesquisa";
import { FlagsInput, estadoAgentes, lerConfig, salvarFlags } from "./produto";
import { ParteInput } from "./conformidade-calc";
import { criarParte, editarParte, encerrarParte, lerConformidade, validarParte } from "./conformidade";
import { VALORES } from "./tributos-catalogo";
import { LabSalvarInput, lerLab, limparLab, salvarLab } from "./laboratorio";
import multer from "multer";
import { buscarCnae, lerCnaeEmpresa, salvarCnaeEmpresa } from "./cnae";
import { aplicarDocumentos, enviarDocumento, lerRegistro, listarDocumentos, rejeitarDocumento, baixarDocumento, revelarSensivel, salvarResponsavelTecnico, slotValido, MAX_BYTES } from "./documentos";
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
      { fase: 5, nome: "Pax Tax e simuladores", estado: "implementada_parcial" },
      { fase: 6, nome: "Pax Goals", estado: "implementada_parcial" },
      { fase: 7, nome: "Pax Ledger", estado: "implementada_parcial" },
    ],
  });
}));

const uploadDoc = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_BYTES, files: 1 } });
const ehCeo = (req: Request) => req.tenantContext?.authenticated === true && req.tenantContext.isPlatformOwner === true;
router.get("/pax-finance/documents", ...finGuards, wrap(async (req, res) => { res.set("Cache-Control", "no-store"); res.json(await listarDocumentos(finContext(req), ehCeo(req))); }));
router.get("/pax-finance/documents/registry", ...finGuards, wrap(async (req, res) => { res.set("Cache-Control", "no-store"); res.json(await lerRegistro(finContext(req))); }));
router.put("/pax-finance/documents/registry/responsavel-tecnico", ...finGuards, wrap(async (req, res) => { res.json(await salvarResponsavelTecnico(finContext(req), String(req.body?.nome ?? ""), String(req.body?.registro ?? ""))); }));
router.get("/pax-finance/cnae/search", ...finGuards, wrap(async (req, res) => { res.set("Cache-Control", "no-store"); res.json(await buscarCnae(String(req.query.q ?? ""), req.query.todas === "1", Number(req.query.limite) || 25)); }));
router.get("/pax-finance/cnae/company", ...finGuards, wrap(async (req, res) => { res.set("Cache-Control", "no-store"); res.json(await lerCnaeEmpresa(finContext(req))); }));
router.put("/pax-finance/cnae/company", ...finGuards, wrap(async (req, res) => { const b = req.body ?? {}; res.json(await salvarCnaeEmpresa(finContext(req), b.principal ? String(b.principal) : null, Array.isArray(b.secundarios) ? b.secundarios.map(String) : [])); }));
router.post("/pax-finance/documents/apply", ...finGuards, wrap(async (req, res) => { res.json(await aplicarDocumentos(finContext(req))); }));
router.get("/pax-finance/documents/:id/download", ...finGuards, wrap(async (req, res) => { const d = await baixarDocumento(finContext(req), idParam(req)); res.set({ "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${d.nome.replace(/[^\w.\- ]/g, "_")}"`, "Cache-Control": "no-store" }); res.send(d.bytes); }));
router.post("/pax-finance/documents/:id/reject", ...finGuards, wrap(async (req, res) => { res.json(await rejeitarDocumento(finContext(req), idParam(req))); }));
router.post("/pax-finance/documents/:id/reveal", ...finGuards, wrap(async (req, res) => {
  if (!ehCeo(req)) { res.status(403).json({ error: "Somente o CEO pode revelar dados pessoais." }); return; }
  const { chave } = z.object({ chave: z.string().regex(/^[a-z0-9_]{3,40}$/) }).parse(req.body);
  res.set("Cache-Control", "no-store"); res.json(await revelarSensivel(finContext(req), idParam(req), chave));
}));
router.post("/pax-finance/documents/:slot", ...finGuards, (req, res, next) => uploadDoc.single("arquivo")(req, res, (err: unknown) => {
  if (err) { res.status(err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE" ? 413 : 400).json({ error: err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE" ? "Arquivo maior que 15 MB" : "Envio invalido" }); return; }
  next();
}), wrap(async (req, res) => {
  const slot = slotValido(String(req.params.slot));
  if (!req.file) throw new FinError(400, "Nenhum arquivo enviado (campo 'arquivo').");
  res.status(201).json(await enviarDocumento(finContext(req), slot, { nome: req.file.originalname, bytes: req.file.buffer }));
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

router.get("/pax-finance/entities", ...finGuards, wrap(async (req, res) => { res.json(await listarEntidades(finContext(req))); }));
router.post("/pax-finance/entities", ...finGuards, wrap(async (req, res) => { res.status(201).json(await criarEntidade(finContext(req), EntidadeInput.parse(req.body))); }));
router.post("/pax-finance/entities/seed-padumann", ...finGuards, wrap(async (req, res) => { res.json(await carregarRascunhoPadumann(finContext(req))); }));
router.put("/pax-finance/entities/:id", ...finGuards, wrap(async (req, res) => { res.json(await editarEntidade(finContext(req), idParam(req), EntidadeInput.parse(req.body))); }));
router.post("/pax-finance/entities/:id/validate", ...finGuards, wrap(async (req, res) => { res.json(await validarEntidade(finContext(req), idParam(req))); }));
router.post("/pax-finance/entities/:id/people", ...finGuards, wrap(async (req, res) => { res.status(201).json(await adicionarPessoa(finContext(req), idParam(req), PessoaInput.parse(req.body))); }));

router.get("/pax-finance/goals", ...finGuards, wrap(async (req, res) => { res.json(await listarMetas(finContext(req))); }));
router.put("/pax-finance/goals", ...finGuards, wrap(async (req, res) => { res.json(await salvarMeta(finContext(req), MetaInput.parse(req.body))); }));
router.delete("/pax-finance/goals/:id", ...finGuards, wrap(async (req, res) => { res.json(await apagarMeta(finContext(req), idParam(req))); }));
router.get("/pax-finance/goals/summary", ...finGuards, wrap(async (req, res) => {
  const pt = z.enum(PERIOD_TYPES as [PeriodType, ...PeriodType[]]).parse(req.query.periodType ?? "month");
  res.json(await resumoGoals(finContext(req), pt, typeof req.query.periodKey === "string" ? req.query.periodKey : undefined));
}));
router.get("/pax-finance/milestones", ...finGuards, wrap(async (req, res) => { res.json(await listarMarcos(finContext(req))); }));
router.put("/pax-finance/milestones", ...finGuards, wrap(async (req, res) => { res.json(await salvarMarco(finContext(req), MarcoInput.parse(req.body))); }));
router.get("/pax-finance/credit-lines", ...finGuards, wrap(async (req, res) => { res.json(await listarCredito(finContext(req))); }));
router.post("/pax-finance/credit-lines/seed", ...finGuards, wrap(async (req, res) => { res.json(await semearCredito(finContext(req))); }));
router.put("/pax-finance/credit-lines/:key", ...finGuards, wrap(async (req, res) => { res.json(await novaVersaoCredito(finContext(req), String(req.params.key), CreditoInput.parse(req.body))); }));

router.post("/pax-finance/simulate", ...finGuards, wrap(async (req, res) => { res.json(await simular(finContext(req), SimInput.parse(req.body))); }));

router.get("/pax-finance/ledger", ...finGuards, wrap(async (req, res) => { res.json(await livroCaixa(finContext(req))); }));
router.post("/pax-finance/ledger", ...finGuards, wrap(async (req, res) => { res.status(201).json(await criarLancamento(finContext(req), LancInput.parse(req.body))); }));
router.post("/pax-finance/ledger/:id/cancel", ...finGuards, wrap(async (req, res) => { res.json(await cancelarLancamento(finContext(req), idParam(req))); }));

router.get("/pax-finance/companies", ...finGuards, wrap(async (req, res) => { res.json(await listarEmpresasSeletor(req, finContext(req).companyId)); }));

const anoQ = (req: Request) => { const a = Number(req.query.ano ?? 2026); if (!Number.isInteger(a) || a < 2000 || a > 2100) throw new FinError(400, "ano invalido"); return a; };
router.get("/pax-finance/scenario", ...finGuards, wrap(async (req, res) => { res.json(await lerCenario(finContext(req), anoQ(req))); }));
router.post("/pax-finance/scenario/demo/seed", ...finGuards, wrap(async (req, res) => { res.json(await semearDemo(finContext(req), anoQ(req))); }));
router.put("/pax-finance/scenario/:mes", ...finGuards, wrap(async (req, res) => { res.json(await salvarMesDemo(finContext(req), Number(req.params.mes), CenarioMesInput.parse(req.body))); }));
router.delete("/pax-finance/scenario/:mes", ...finGuards, wrap(async (req, res) => { res.json(await apagarDemo(finContext(req), anoQ(req), Number(req.params.mes))); }));
router.delete("/pax-finance/scenario", ...finGuards, wrap(async (req, res) => { res.json(await apagarDemo(finContext(req), anoQ(req))); }));

router.get("/pax-finance/credit/catalog", ...finGuards, wrap(async (_req, res) => { res.json(CATALOGO); }));
router.post("/pax-finance/credit/simulate", ...finGuards, wrap(async (req, res) => { res.json(await simularCredito(finContext(req), SimCreditoInput.parse(req.body))); }));
router.post("/pax-finance/credit/compare", ...finGuards, wrap(async (req, res) => { res.json(await compararCredito(finContext(req), SimCreditoInput.parse(req.body))); }));

router.post("/pax-finance/tax/panel", ...finGuards, wrap(async (req, res) => { res.json(calcularPainel(PainelInput.parse(req.body))); }));
router.post("/pax-finance/credit/panel", ...finGuards, wrap(async (req, res) => { res.json(painelCredito(CreditoPainelInput.parse(req.body))); }));

router.get("/pax-finance/config", ...finGuards, wrap(async (req, res) => { res.json(await lerConfig(finContext(req))); }));
router.put("/pax-finance/config/flags", ...finGuards, wrap(async (req, res) => { res.json(await salvarFlags(finContext(req), FlagsInput.parse(req.body).flags)); }));
router.get("/pax-finance/agents", ...finGuards, wrap(async (_req, res) => { res.json(estadoAgentes()); }));
router.post("/pax-finance/agents/:id/toggle", ...finGuards, wrap(async (req, res) => {
  const a = estadoAgentes().find((x) => x.id === req.params.id);
  if (!a) throw new FinError(404, "Agente desconhecido");
  res.status(409).json({ error: `${a.nome}: ${a.motivo} Nenhuma execução foi iniciada.` });
}));

router.get("/pax-finance/lab", ...finGuards, wrap(async (req, res) => {
  const inicio = typeof req.query.inicio === "string" ? z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).parse(req.query.inicio) : undefined;
  res.json(await lerLab(finContext(req), inicio));
}));
router.get("/pax-finance/limites-regime", ...finGuards, wrap(async (_req, res) => { res.json({ anualCents: VALORES.simples.limiteEPP * 100, mensalCents: Math.round((VALORES.simples.limiteEPP * 100) / 12), fonte: "Lei Complementar 123/2006 (Simples Nacional): R$ 4.800.000,00 por ano; limite mensal = anual dividido por 12 (proporcional)." }); }));
router.put("/pax-finance/lab", ...finGuards, wrap(async (req, res) => { res.json(await salvarLab(finContext(req), LabSalvarInput.parse(req.body))); }));
router.delete("/pax-finance/lab", ...finGuards, wrap(async (req, res) => { res.json(await limparLab(finContext(req))); }));

router.get("/pax-finance/entities/:id/compliance", ...finGuards, wrap(async (req, res) => { res.json(await lerConformidade(finContext(req), idParam(req))); }));
router.post("/pax-finance/entities/:id/compliance/parties", ...finGuards, wrap(async (req, res) => { res.status(201).json(await criarParte(finContext(req), idParam(req), ParteInput.parse(req.body))); }));
router.put("/pax-finance/compliance/parties/:id", ...finGuards, wrap(async (req, res) => { res.json(await editarParte(finContext(req), idParam(req), ParteInput.parse(req.body))); }));
router.post("/pax-finance/compliance/parties/:id/validate", ...finGuards, wrap(async (req, res) => { res.json(await validarParte(finContext(req), idParam(req))); }));
router.post("/pax-finance/compliance/parties/:id/end", ...finGuards, wrap(async (req, res) => { res.json(await encerrarParte(finContext(req), idParam(req))); }));

router.get("/pax-finance/audit", ...finGuards, wrap(async (req, res) => { res.json(await listarAuditoria(finContext(req))); }));

export default router;
