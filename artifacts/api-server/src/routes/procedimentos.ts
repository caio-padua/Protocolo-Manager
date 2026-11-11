import { Router, type NextFunction, type Request, type Response } from "express";
import { pool } from "@workspace/db";
import { requireCollaborator } from "./collaborator";
import { listarProcedimentos, ProcedimentoErro, salvarProcedimento, temVersaoEdicao, validarProcedimento } from "../lib/procedimentos-store";

const router = Router();

function exigirContexto(req: Request, res: Response, next: NextFunction) {
  if (!req.tenantContext?.authenticated || !req.tenantContext.professionalId || !req.collaborator ||
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
      AND column_name = 'duracao_minutos' AND data_type = 'numeric' AND numeric_scale = 2
      AND EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'procedimentos_clinicos'
          AND column_name = 'duracao_segundos' AND data_type = 'integer')
      AND EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'procedimentos_clinicos' AND column_name = 'dose')
      AND to_regclass('procedimento_equipes') IS NOT NULL
      AND to_regclass('procedimento_equipes_profissionais') IS NOT NULL
      AND to_regclass('procedimento_revisoes') IS NOT NULL`);
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
  try {
    const versaoEdicaoHabilitada = await temVersaoEdicao(pool);
    res.json({ empresaId, empresaNome: empresa.rows[0].nome, duracaoSegundosHabilitada: true, profissionaisNecessariosHabilitado: true, vinculosCamposHabilitados: false, versaoEdicaoHabilitada, procedimentos: await listarProcedimentos(pool, empresaId) });
  } catch (error) {
    if (error instanceof ProcedimentoErro) { res.status(error.status).json({ error: error.message }); return; }
    throw error;
  }
});

router.get("/procedimentos/opcoes-profissionais", requireCollaborator, exigirContexto, async (req, res) => {
  const empresaId = req.tenantContext.empresaId;
  const [locais, areas, profissionais] = await Promise.all([
    pool.query("SELECT id, name FROM locations WHERE empresa_id=$1 AND active='true' ORDER BY name,id", [empresaId]),
    pool.query("SELECT id, name FROM professional_areas WHERE active=TRUE ORDER BY name,id"),
    pool.query(`SELECT p.id, p.name, p.area_id, lp.location_id,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('nome', a.name, 'origem', 'Sistema') ORDER BY a.name)
        FROM agenda_resources a WHERE a.active=TRUE AND a.location_id=lp.location_id AND a.professional_id=p.id), '[]'::jsonb) AS agendas_sistema,
      CASE WHEN ac.id IS NOT NULL AND ac.active=TRUE AND ac.location_id=lp.location_id
        THEN jsonb_build_object('nome',ac.name,'origem','Google') ELSE NULL END AS agenda_google
      FROM location_professionals lp JOIN professionals p ON p.id=lp.professional_id AND p.active=TRUE
      JOIN professional_areas pa ON pa.id=p.area_id AND pa.active=TRUE
      JOIN locations l ON l.id=lp.location_id AND l.active='true' AND l.empresa_id=$1
      LEFT JOIN agenda_calendars ac ON ac.id=lp.agenda_calendar_id
      ORDER BY p.name,p.id`, [empresaId]),
  ]);
  res.json({ locais: locais.rows, areas: areas.rows, profissionais: profissionais.rows.map((p) => ({
    id: p.id, nome: p.name, areaId: p.area_id, localId: p.location_id,
    agendas: [...p.agendas_sistema, ...(p.agenda_google ? [p.agenda_google] : [])],
  })) });
});

async function salvar(req: Request, res: Response, id?: number): Promise<void> {
  const parsed = validarProcedimento(req.body);
  if (!parsed.success) {
    const equipe = parsed.error.issues.find((issue) => issue.path[0] === "profissionaisNecessarios");
    res.status(400).json({ error: equipe?.message ?? "Confira os campos do procedimento.", detalhes: parsed.error.issues });
    return;
  }
  try {
    const result = await salvarProcedimento(pool, req.tenantContext.empresaId, parsed.data, req.tenantContext.professionalId!, id);
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
