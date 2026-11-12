import { Router, type IRouter } from "express";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { requireCollaborator } from "./collaborator";
import { mayManageAgendaEmpresa } from "../lib/agenda-governance";
import { condicaoCorpoClinico } from "../lib/corpo-clinico.js";
import { agendasDoProfissional, definirPreferenciaDoProfissional, profissionaisVinculadosDaAgenda } from "../lib/agenda-vinculos.js";

/**
 * Profissional preferido de uma agenda (ex.: técnica de enfermagem preferida para a agenda Home Care).
 * É só PREFERÊNCIA: o Pit Stop a sugere, a pessoa pode trocar, e a exigência de nível do procedimento continua valendo.
 */
const router: IRouter = Router();

router.get("/agenda/resources/:id/profissionais-preferidos", requireCollaborator, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const empresaId = req.tenantContext?.empresaId;
  if (!Number.isInteger(id) || id <= 0 || !empresaId) { res.status(400).json({ error: "Identificador inválido." }); return; }
  const r = await db.execute(sql`SELECT p.id, p.name, p.habilitacao_nivel FROM agenda_profissionais_preferidos f
    JOIN professionals p ON p.id=f.professional_id JOIN agenda_resources a ON a.id=f.agenda_id
    WHERE f.agenda_id=${id} AND f.empresa_id=${empresaId} AND a.empresa_id=${empresaId} ORDER BY p.name`);
  res.json({ profissionais: r.rows.map((x) => ({ id: Number(x.id), name: String(x.name), habilitacaoNivel: x.habilitacao_nivel ?? null })) });
});

router.put("/agenda/resources/:id/profissionais-preferidos", requireCollaborator, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const empresaId = req.tenantContext?.empresaId;
  const ids = req.body?.professionalIds;
  if (!Number.isInteger(id) || id <= 0 || !empresaId || !Array.isArray(ids) || ids.length > 20 ||
    ids.some((v: unknown) => !Number.isInteger(v) || (v as number) <= 0)) {
    res.status(400).json({ code: "pedido_invalido", error: "Informe professionalIds (lista de números)." }); return;
  }
  if (!(await mayManageAgendaEmpresa(req))) {
    res.status(403).json({ code: "sem_permissao", error: "Definir preferência exige administrador autorizado ou responsável técnico." }); return;
  }
  const agenda = (await db.execute(sql`SELECT id, category_id FROM agenda_resources WHERE id=${id} AND empresa_id=${empresaId}`)).rows[0];
  if (!agenda) { res.status(404).json({ code: "agenda_nao_encontrada", error: "Agenda não encontrada nesta clínica." }); return; }
  const unicos = [...new Set(ids as number[])];
  if (unicos.length) {
    const validos = (await db.execute(sql`SELECT p.id FROM professionals p WHERE p.id = ANY(${`{${unicos.join(",")}}`}::int[]) AND p.active
      AND p.area_id=${agenda.category_id} AND ${condicaoCorpoClinico(empresaId)}`)).rows.map((x) => Number(x.id));
    const invalidos = unicos.filter((u) => !validos.includes(u));
    if (invalidos.length) {
      res.status(409).json({ code: "profissional_incompativel", error: "Há profissional inativo, de outra clínica ou de outra categoria que a da agenda.", invalidos }); return;
    }
  }
  await db.transaction(async (tx) => {
    await tx.execute(sql`DELETE FROM agenda_profissionais_preferidos WHERE agenda_id=${id} AND empresa_id=${empresaId}`);
    for (const p of unicos) {
      await tx.execute(sql`INSERT INTO agenda_profissionais_preferidos (empresa_id, agenda_id, professional_id, criado_por)
        VALUES (${empresaId}, ${id}, ${p}, ${req.collaborator?.professionalId ?? null})`);
    }
  });
  res.json({ ok: true, professionalIds: unicos });
});

/** Agenda Configuração -> cadastro: quem está ligado a esta agenda (titular, local do cadastro, preferido). */
router.get("/agenda/resources/:id/profissionais-vinculados", requireCollaborator, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const empresaId = req.tenantContext?.empresaId;
  if (!Number.isInteger(id) || id <= 0 || !empresaId) { res.status(400).json({ error: "Identificador inválido." }); return; }
  const vinculos = await profissionaisVinculadosDaAgenda(empresaId, id);
  if (!vinculos) { res.status(404).json({ code: "agenda_nao_encontrada", error: "Agenda não encontrada nesta clínica." }); return; }
  res.json(vinculos);
});

/** Cadastro do profissional -> agendas da clínica (inclui as sem local, como Home Care). */
router.get("/professionals/:id/agendas", requireCollaborator, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const empresaId = req.tenantContext?.empresaId;
  if (!Number.isInteger(id) || id <= 0 || !empresaId) { res.status(400).json({ error: "Identificador inválido." }); return; }
  const agendas = await agendasDoProfissional(empresaId, id);
  if (!agendas) { res.status(404).json({ error: "Profissional não encontrado nesta clínica." }); return; }
  res.json({ agendas });
});

/** Liga ou desliga o profissional numa agenda SEM local. Mesma autoridade do PUT em lista. */
router.put("/professionals/:id/agendas/:agendaId/preferencia", requireCollaborator, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const agendaId = Number(req.params.agendaId);
  const empresaId = req.tenantContext?.empresaId;
  const vinculado = req.body?.vinculado;
  if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(agendaId) || agendaId <= 0 || !empresaId || typeof vinculado !== "boolean") {
    res.status(400).json({ code: "pedido_invalido", error: "Informe vinculado (verdadeiro ou falso)." }); return;
  }
  if (!(await mayManageAgendaEmpresa(req))) {
    res.status(403).json({ code: "sem_permissao", error: "Ligar profissional à agenda exige administrador autorizado ou responsável técnico." }); return;
  }
  const r = await definirPreferenciaDoProfissional(empresaId, agendaId, id, vinculado, req.collaborator?.professionalId ?? null);
  if (!r.ok) { res.status(r.status).json({ code: r.code, error: r.error }); return; }
  res.json({ ok: true, vinculado: r.vinculado });
});

export default router;
