import { Router, type NextFunction, type Request, type Response } from "express";
import { pool } from "@workspace/db";
import { requireCollaborator } from "./collaborator";
import { ErroFornecedor, listarFornecedores, salvarFornecedor } from "../lib/fornecedores-store";
import { listarVariantesSubstancia } from "../lib/substance-variantes-store";

const router = Router();

function acesso(req: Request, res: Response, next: NextFunction): void {
  const contexto = req.tenantContext;
  if (!contexto?.authenticated || !contexto.professionalId || !req.collaborator ||
      contexto.professionalId !== req.collaborator.professionalId) {
    res.status(401).json({ error: "Entre com seu acesso profissional." });
    return;
  }
  if (!contexto.isPlatformOwner) {
    res.status(403).json({ error: "Somente o proprietário pode acessar fornecedores." });
    return;
  }
  next();
}

async function estrutura(_req: Request, res: Response, next: NextFunction): Promise<void> {
  const { rows } = await pool.query("SELECT to_regclass('fornecedores_cadastrados') AS ficha, to_regclass('fornecedor_historico') AS historico");
  if (!rows[0]?.ficha || !rows[0]?.historico) {
    res.status(503).json({ error: "Cadastro de fornecedores indisponível: estrutura ainda não instalada." });
    return;
  }
  next();
}

router.get("/fornecedores", requireCollaborator, acesso, estrutura, async (req, res) => {
  res.json(await listarFornecedores(pool, req.tenantContext.empresaId));
});

router.get("/substances/:id/variantes", requireCollaborator, acesso, estrutura, async (req, res) => {
  const id = req.params.id;
  if (typeof id !== "string" || !/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id))) {
    res.status(400).json({ error: "Identificador inválido." }); return;
  }
  const tabelas = await pool.query("SELECT to_regclass('substance_variantes') AS variantes, to_regclass('substance_ofertas') AS ofertas");
  if (!tabelas.rows[0]?.variantes || !tabelas.rows[0]?.ofertas) {
    res.status(503).json({ error: "Apresentações e ofertas ainda não estão disponíveis." }); return;
  }
  const empresa = await pool.query("SELECT nome FROM empresas WHERE id=$1 AND ativa=true AND status='ATIVO'", [req.tenantContext.empresaId]);
  if (!empresa.rowCount) { res.status(403).json({ error: "A clínica da sessão não está disponível." }); return; }
  res.json({ clinica: empresa.rows[0].nome, variantes: await listarVariantesSubstancia(pool, req.tenantContext.empresaId, Number(id)) });
});

router.post("/fornecedores", requireCollaborator, acesso, estrutura, async (req, res) => {
  try {
    const salvo = await salvarFornecedor(pool, req.tenantContext.empresaId, req.tenantContext.professionalId!, req.body);
    res.status(201).json(salvo);
  } catch (erro) {
    if (erro instanceof ErroFornecedor) { res.status(erro.status).json({ error: erro.message }); return; }
    throw erro;
  }
});

router.put("/fornecedores/:id", requireCollaborator, acesso, estrutura, async (req, res) => {
  const id = req.params.id;
  if (typeof id !== "string" || !/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id))) {
    res.status(400).json({ error: "Identificador inválido." }); return;
  }
  const { versao, ...entrada } = req.body ?? {};
  try {
    const salvo = await salvarFornecedor(pool, req.tenantContext.empresaId, req.tenantContext.professionalId!, entrada, Number(id), versao);
    res.json(salvo);
  } catch (erro) {
    if (erro instanceof ErroFornecedor) { res.status(erro.status).json({ error: erro.message }); return; }
    throw erro;
  }
});

export default router;
