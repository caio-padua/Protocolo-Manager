/**
 * Governança da identidade do laudo por clínica:
 *  - matriz de regras versionada (GET/PUT);
 *  - histórico de decisões de um documento;
 *  - lista de auto-aceites para auditoria posterior e a própria auditoria;
 *  - métricas de falso bloqueio e de erro de vinculação, por versão das regras.
 * A clínica vem SEMPRE da sessão; nunca de parâmetro do navegador.
 */
import { Router, type IRouter, type Request, type Response } from "express";
import { eq, sql } from "drizzle-orm";
import { db, professionalsTable } from "@workspace/db";
import { authorizeExamReviewer } from "../lib/exam-review-policy.js";
import { requireDocumentInSession, sessionEmpresaId } from "../lib/exam-tenant.js";
import { DEFAULT_RULES, GLOBAL_SAFETY_LIMITS, VARIANT_KINDS, PARTIAL_POLICIES, normalizeRuleConfig } from "../lib/exam-extraction/identity-rules.js";
import {
  getActiveRules,
  listRuleVersions,
  revokeAliasesOfDocument,
  saveRuleVersion,
} from "../lib/exam-extraction/identity-rules-store.js";
import { requireCollaborator } from "./collaborator.js";

type Rows = { rows: Array<Record<string, any>> };
const rowsOf = (r: unknown) => (r as Rows).rows;

const RULES_NOTE_MIN = 15;
const AUDIT_NOTE_MIN = 10;
const RULE_EDITORS = new Set(["platform_owner", "admin", "medico"]);
/** Decisão registrada de cada documento, mesmo nos registros anteriores à matriz de regras (decision nula). */
const DECISION_SQL = sql`COALESCE(v.decision, CASE WHEN v.verdict = 'confirmada' THEN 'incorporar' ELSE 'quarentena' END)`;

function ratio(numerator: number, denominator: number): number | null {
  return denominator > 0 ? Math.round((numerator / denominator) * 10000) / 100 : null;
}

export function createExamIdentityGovernanceRouter(): IRouter {
  const router: IRouter = Router();

  router.get("/exames-lab/identidade/regras", requireCollaborator, async (req: Request, res: Response) => {
    try {
      const empresaId = sessionEmpresaId(req);
      if (!empresaId) {
        res.status(403).json({ error: "Sem clínica ativa na sessão." });
        return;
      }
      const [active, historico] = await Promise.all([getActiveRules(empresaId), listRuleVersions(empresaId)]);
      res.json({
        versaoVigente: active.version,
        regras: active.rules,
        degradado: active.degraded,
        padraoGlobal: DEFAULT_RULES,
        limitesGlobais: GLOBAL_SAFETY_LIMITS,
        opcoes: { tiposDeVariante: VARIANT_KINDS, politicasNomeParcial: PARTIAL_POLICIES, distanciaMaximaEdicao: [0, 1, 2] },
        historico,
      });
    } catch (err) {
      req.log?.error({ err }, "GET regras de identidade falhou");
      res.status(500).json({ error: "Falha ao consultar as regras de identidade." });
    }
  });

  router.put("/exames-lab/identidade/regras", requireCollaborator, async (req: Request, res: Response) => {
    try {
      const empresaId = sessionEmpresaId(req);
      const actorId = req.collaborator?.professionalId;
      if (!empresaId || !actorId || req.tenantContext.professionalId !== actorId) {
        res.status(403).json({ error: "Sem vínculo ativo com a clínica." });
        return;
      }
      if (!RULE_EDITORS.has(req.tenantContext.perfilPlataforma)) {
        res.status(403).json({ error: "Seu perfil não pode alterar as regras de identidade desta clínica." });
        return;
      }
      const note = typeof req.body?.justificativa === "string" ? req.body.justificativa.trim() : "";
      if (note.length < RULES_NOTE_MIN) {
        res.status(400).json({ error: `Informe a justificativa (mínimo de ${RULES_NOTE_MIN} caracteres).` });
        return;
      }
      const parsed = normalizeRuleConfig(req.body?.regras);
      if (!parsed.ok) {
        res.status(400).json({ error: "Regras inválidas.", detalhes: parsed.errors, limitesGlobais: GLOBAL_SAFETY_LIMITS });
        return;
      }
      const version = await saveRuleVersion({ empresaId, config: parsed.config, createdBy: actorId, note });
      res.status(201).json({ ok: true, versao: version, regras: parsed.config });
    } catch (err) {
      req.log?.error({ err }, "PUT regras de identidade falhou");
      res.status(500).json({ error: "Falha ao gravar as regras de identidade." });
    }
  });

  // Histórico de decisões do documento (verificação com versão das regras, decisões humanas, auditoria).
  router.get("/exames-lab/documentos/:id/identidade/historico", requireCollaborator, async (req: Request, res: Response) => {
    try {
      const scope = await requireDocumentInSession(req, res, Number(req.params.id));
      if (!scope) return;
      const result = await db.execute(sql`
        SELECT id, event, verdict, decision, rule_set_version, field_results, reasons, trail, professional_id, note, created_at
        FROM exam_identity_checks
        WHERE document_id = ${scope.id} AND empresa_id = ${scope.empresaId}
        ORDER BY id
      `);
      res.json({
        documentId: scope.id,
        eventos: rowsOf(result).map((r) => ({
          id: Number(r.id),
          evento: r.event,
          veredito: r.verdict,
          decisao: r.decision,
          versaoRegras: r.rule_set_version,
          campos: r.field_results,
          motivos: r.reasons,
          trilha: r.trail,
          profissionalId: r.professional_id,
          justificativa: r.note,
          em: new Date(r.created_at).toISOString(),
        })),
      });
    } catch (err) {
      req.log?.error({ err }, "GET histórico de identidade falhou");
      res.status(500).json({ error: "Falha ao consultar o histórico de identidade." });
    }
  });

  // Auto-aceites para auditoria posterior (a pessoa não precisou confirmar; pode conferir depois).
  router.get("/exames-lab/identidade/auto-aceitos", requireCollaborator, async (req: Request, res: Response) => {
    try {
      const empresaId = sessionEmpresaId(req);
      if (!empresaId) {
        res.status(403).json({ error: "Sem clínica ativa na sessão." });
        return;
      }
      const limit = Math.min(Math.max(Number(req.query.limite) || 50, 1), 100);
      const offset = Math.max(Number(req.query.deslocamento) || 0, 0);
      const onlyAlias = req.query.somenteComApelido === "1";
      const onlyPending = req.query.somentePendentes === "1";
      const result = await db.execute(sql`
        SELECT v.document_id, v.client_id, v.rule_set_version, v.trail, v.created_at, ${DECISION_SQL} AS decision,
               c.name AS client_name, a.event AS audit_event, a.created_at AS audit_at
        FROM exam_identity_checks v
        JOIN clients c ON c.id = v.client_id AND c.empresa_id = ${empresaId}
        LEFT JOIN exam_identity_checks a
          ON a.document_id = v.document_id AND a.event IN ('auditoria_confirmou', 'auditoria_vinculo_incorreto')
        WHERE v.empresa_id = ${empresaId} AND v.event = 'verificacao'
          AND ${DECISION_SQL} IN ${onlyAlias ? sql`('incorporar_com_alias')` : sql`('incorporar', 'incorporar_com_alias')`}
          ${onlyPending ? sql`AND a.id IS NULL` : sql``}
        ORDER BY v.id DESC
        LIMIT ${limit} OFFSET ${offset}
      `);
      res.json({
        itens: rowsOf(result).map((r) => ({
          documentId: Number(r.document_id),
          clientId: Number(r.client_id),
          cliente: r.client_name,
          decisao: r.decision,
          versaoRegras: r.rule_set_version,
          trilha: r.trail,
          em: new Date(r.created_at).toISOString(),
          auditoria: r.audit_event
            ? { resultado: r.audit_event === "auditoria_confirmou" ? "confirmou" : "vinculo_incorreto", em: new Date(r.audit_at).toISOString() }
            : null,
        })),
        limite: limit,
        deslocamento: offset,
      });
    } catch (err) {
      req.log?.error({ err }, "GET auto-aceitos falhou");
      res.status(500).json({ error: "Falha ao listar os auto-aceites." });
    }
  });

  router.post("/exames-lab/documentos/:id/identidade/auditoria", requireCollaborator, async (req: Request, res: Response) => {
    try {
      const actorId = req.collaborator?.professionalId;
      const scope = await requireDocumentInSession(req, res, Number(req.params.id));
      if (!scope) return;
      if (!actorId || sessionEmpresaId(req) !== scope.empresaId || req.tenantContext.professionalId !== actorId) {
        res.status(403).json({ error: "Sem vínculo ativo com a clínica deste exame." });
        return;
      }
      const resultado = req.body?.resultado;
      if (resultado !== "confirmou" && resultado !== "vinculo_incorreto") {
        res.status(400).json({ error: "Informe o resultado da auditoria: confirmou ou vinculo_incorreto." });
        return;
      }
      const note = typeof req.body?.justificativa === "string" ? req.body.justificativa.trim() : "";
      if (note.length < AUDIT_NOTE_MIN) {
        res.status(400).json({ error: `Informe a justificativa (mínimo de ${AUDIT_NOTE_MIN} caracteres).` });
        return;
      }
      const [professional] = await db
        .select({
          id: professionalsTable.id,
          name: professionalsTable.name,
          role: professionalsTable.role,
          category: professionalsTable.category,
          professionalType: professionalsTable.professionalType,
          active: professionalsTable.active,
          crm: professionalsTable.crm,
          registrationNumber: professionalsTable.registrationNumber,
          registrationCouncil: professionalsTable.registrationCouncil,
        })
        .from(professionalsTable)
        .where(eq(professionalsTable.id, actorId))
        .limit(1);
      const authorization = authorizeExamReviewer({
        phase: 1,
        authenticatedProfessionalId: actorId,
        requestedProfessionalId: req.body?.professionalId,
        professional,
        companyMatches: true,
        clinicalMembershipValidated: false,
      });
      if (!authorization.allowed) {
        res.status(authorization.status).json({ error: authorization.error });
        return;
      }

      const verification = rowsOf(await db.execute(sql`
        SELECT ${DECISION_SQL} AS decision FROM exam_identity_checks v
        WHERE v.document_id = ${scope.id} AND v.empresa_id = ${scope.empresaId} AND v.event = 'verificacao' LIMIT 1
      `))[0];
      if (!verification || !["incorporar", "incorporar_com_alias"].includes(verification.decision)) {
        res.status(409).json({ error: "Só documentos aceitos automaticamente passam por esta auditoria." });
        return;
      }

      const outcome = await db.transaction(async (tx) => {
        const event = resultado === "confirmou" ? "auditoria_confirmou" : "auditoria_vinculo_incorreto";
        // Trava a linha do documento: duas auditorias simultâneas não leem estados diferentes.
        const previous = (rowsOf(await tx.execute(sql`SELECT status FROM exam_documents WHERE id = ${scope.id} FOR UPDATE`))[0]?.status ?? null) as string | null;
        // O registro é imutável: o status anterior precisa nascer junto dele.
        const trail = resultado === "vinculo_incorreto" ? JSON.stringify([`Status do documento antes da auditoria: ${previous ?? "desconhecido"}.`]) : null;
        const inserted = rowsOf(await tx.execute(sql`
          INSERT INTO exam_identity_checks (document_id, empresa_id, client_id, event, professional_id, note, trail)
          VALUES (${scope.id}, ${scope.empresaId}, ${scope.clientId}, ${event}, ${actorId}, ${note}, ${trail}::jsonb)
          ON CONFLICT (document_id) WHERE event IN ('auditoria_confirmou', 'auditoria_vinculo_incorreto') DO NOTHING
          RETURNING id
        `));
        if (inserted.length === 0) return "ja_auditado" as const;
        if (resultado === "vinculo_incorreto") {
          // Nada é apagado: o documento sai de circulação (status); o resultado continua gravado.
          await tx.execute(sql`UPDATE exam_documents SET status = 'identidade_rejeitada' WHERE id = ${scope.id}`);
          return { anterior: previous };
        }
        return "ok" as const;
      });
      if (outcome === "ja_auditado") {
        res.status(409).json({ error: "Este documento já foi auditado." });
        return;
      }
      if (resultado === "vinculo_incorreto") {
        await revokeAliasesOfDocument(scope.empresaId, scope.id);
      }
      res.status(201).json({
        ok: true,
        resultado,
        ...(typeof outcome === "object" ? { statusAnterior: outcome.anterior, statusAtual: "identidade_rejeitada" } : {}),
      });
    } catch (err) {
      req.log?.error({ err }, "auditoria de identidade falhou");
      res.status(500).json({ error: "Falha ao registrar a auditoria de identidade." });
    }
  });

  router.get("/exames-lab/identidade/metricas", requireCollaborator, async (req: Request, res: Response) => {
    try {
      const empresaId = sessionEmpresaId(req);
      if (!empresaId) {
        res.status(403).json({ error: "Sem clínica ativa na sessão." });
        return;
      }
      const since = typeof req.query.desde === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.query.desde) ? req.query.desde : "1970-01-01";
      const result = await db.execute(sql`
        SELECT COALESCE(v.rule_set_version, 0) AS versao,
          count(*)::int AS total,
          count(*) FILTER (WHERE ${DECISION_SQL} IN ('incorporar', 'incorporar_com_alias'))::int AS auto_aceitos,
          count(*) FILTER (WHERE ${DECISION_SQL} = 'incorporar_com_alias')::int AS auto_aceitos_com_apelido,
          count(*) FILTER (WHERE ${DECISION_SQL} = 'preliminar')::int AS preliminares,
          count(*) FILTER (WHERE ${DECISION_SQL} = 'quarentena')::int AS quarentenas,
          count(*) FILTER (WHERE ${DECISION_SQL} IN ('quarentena', 'preliminar') AND h.event = 'liberacao_humana')::int AS bloqueios_liberados,
          count(*) FILTER (WHERE ${DECISION_SQL} IN ('quarentena', 'preliminar') AND h.event = 'rejeicao_humana')::int AS bloqueios_confirmados,
          count(*) FILTER (WHERE ${DECISION_SQL} IN ('incorporar', 'incorporar_com_alias') AND a.event IS NOT NULL)::int AS auditados,
          count(*) FILTER (WHERE a.event = 'auditoria_vinculo_incorreto')::int AS vinculos_incorretos
        FROM exam_identity_checks v
        LEFT JOIN exam_identity_checks h
          ON h.document_id = v.document_id AND h.event IN ('liberacao_humana', 'rejeicao_humana')
        LEFT JOIN exam_identity_checks a
          ON a.document_id = v.document_id AND a.event IN ('auditoria_confirmou', 'auditoria_vinculo_incorreto')
        WHERE v.empresa_id = ${empresaId} AND v.event = 'verificacao' AND v.created_at >= ${since}::date
        GROUP BY 1 ORDER BY 1
      `);
      const porVersao = rowsOf(result).map((r) => {
        const decididos = Number(r.bloqueios_liberados) + Number(r.bloqueios_confirmados);
        return {
          versaoRegras: Number(r.versao),
          total: Number(r.total),
          autoAceitos: Number(r.auto_aceitos),
          autoAceitosComApelido: Number(r.auto_aceitos_com_apelido),
          preliminares: Number(r.preliminares),
          quarentenas: Number(r.quarentenas),
          bloqueiosLiberadosPorHumano: Number(r.bloqueios_liberados),
          bloqueiosConfirmadosPorHumano: Number(r.bloqueios_confirmados),
          bloqueiosAindaSemDecisao: Number(r.quarentenas) + Number(r.preliminares) - decididos,
          autoAceitosAuditados: Number(r.auditados),
          vinculosIncorretos: Number(r.vinculos_incorretos),
          // Falso bloqueio provável = retido e depois liberado por pessoa. Denominador: retidos já decididos por pessoa.
          taxaFalsoBloqueioPct: ratio(Number(r.bloqueios_liberados), decididos),
          // Erro de vinculação = auto-aceite marcado como incorreto na auditoria. Denominador: auto-aceites auditados.
          taxaErroVinculacaoPct: ratio(Number(r.vinculos_incorretos), Number(r.auditados)),
          coberturaAuditoriaPct: ratio(Number(r.auditados), Number(r.auto_aceitos)),
        };
      });
      res.json({
        desde: since,
        porVersao,
        leitura: "Taxa nula significa que ainda não há decisões ou auditorias para calcular; nunca equivale a 0%. Versão 0 reúne o padrão global e registros anteriores à matriz de regras.",
      });
    } catch (err) {
      req.log?.error({ err }, "GET métricas de identidade falhou");
      res.status(500).json({ error: "Falha ao calcular as métricas de identidade." });
    }
  });

  return router;
}
