import { Router, type NextFunction, type Request, type Response } from "express";
import { pool } from "@workspace/db";
import { requireCollaborator } from "./collaborator";
import { listarProcedimentos, ProcedimentoErro, salvarProcedimento, validarProcedimento } from "../lib/procedimentos-store";

const router = Router();

function exigirContexto(req: Request, res: Response, next: NextFunction) {
  if (!req.tenantContext?.authenticated || !req.collaborator ||
      req.tenantContext.professionalId !== req.collaborator.professionalId) {
    res.status(401).json({ error: "Entre com seu acesso profissional." });
    return;
  }
  next();
}
function exigirProprietario(req: Request, res: Response, next: NextFunction) {
  if (!req.tenantContext.isPlatformOwner) {
    res.status(403).json({ error: "Somente o proprietário da plataforma pode editar este cadastro." });
    return;
  }
  next();
}

async function exigirEstruturaSegura(_req: Request, res: Response, next: NextFunction) {
  const result = await pool.query(`SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'procedimentos_clinicos'
      AND column_name = 'duracao_minutos' AND data_type = 'numeric' AND numeric_scale = 2`);
  if (result.rowCount !== 1) {
    res.status(503).json({ error: "O cadastro de procedimentos está indisponível: estrutura pendente de conferência." });
    return;
  }
  next();
}

router.get("/procedimentos", requireCollaborator, exigirContexto, exigirEstruturaSegura, async (req, res) => {
  const empresaId = req.tenantContext.empresaId;
  const empresa = await pool.query<{ nome: string }>(
    "SELECT COALESCE(NULLIF(TRIM(nome_fantasia), ''), nome) AS nome FROM empresas WHERE id = $1 AND ativa = TRUE AND status = 'ATIVO'",
    [empresaId],
  );
  if (!empresa.rows[0]) {
    res.status(403).json({ error: "A clínica da sessão não está disponível." });
    return;
  }
  res.json({ empresaId, empresaNome: empresa.rows[0].nome, procedimentos: await listarProcedimentos(pool, empresaId) });
});

async function salvar(req: Request, res: Response, id?: number): Promise<void> {
  const parsed = validarProcedimento(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Confira os campos do procedimento.", detalhes: parsed.error.issues });
    return;
  }
  try {
    const result = await salvarProcedimento(pool, req.tenantContext.empresaId, parsed.data, id);
    res.status(id === undefined ? 201 : 200).json(result);
  } catch (error) {
    if (error instanceof ProcedimentoErro) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    throw error;
  }
}

router.post("/procedimentos", requireCollaborator, exigirContexto, exigirProprietario, exigirEstruturaSegura, async (req, res) => {
  await salvar(req, res);
});
router.put("/procedimentos/:id", requireCollaborator, exigirContexto, exigirProprietario, exigirEstruturaSegura, async (req, res) => {
  const raw = req.params.id;
  if (typeof raw !== "string" || !/^[1-9]\d*$/.test(raw) || !Number.isSafeInteger(Number(raw))) {
    res.status(400).json({ error: "Identificador inválido." });
    return;
  }
  await salvar(req, res, Number(raw));
});

export default router;
