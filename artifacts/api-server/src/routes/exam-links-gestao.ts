import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";
import { verifyPatientToken } from "../lib/portal-token";
import { criarTokenExame } from "../lib/exam-link";
import { auditarAcessoLink, excedeuLimiteLink, protegerRespostaLink } from "../lib/link-acesso";
import { requireCollaborator } from "./collaborator";
import { statusLegado } from "../lib/exam-link-politica";
import { ativarPoliticaLegado, carregarPoliticaLegado } from "../lib/exam-link-politica-db";

const router: IRouter = Router();
const idDoPaciente = (auth?: string) => (auth && auth.startsWith("Bearer ") ? verifyPatientToken(auth.slice(7)) : null);

// Paciente autenticado: lista SÓ os próprios documentos (sem token, sem PDF).
router.get("/area-paciente/exames/documentos", async (req, res): Promise<void> => {
  protegerRespostaLink(res);
  const clientId = idDoPaciente(req.headers.authorization);
  if (clientId === null) { res.status(401).json({ error: "Sessão expirada. Entre novamente." }); return; }
  try {
    const r = await pool.query(
      `SELECT id, tipo, file_name AS "fileName", exam_count AS "examCount", created_at AS "createdAt",
              (revogado_em IS NOT NULL) AS revogado
         FROM exam_request_pdfs WHERE client_id = $1 ORDER BY created_at DESC NULLS LAST, id DESC LIMIT 100`, [clientId])
      .catch(async (e) => { if (String(e?.message).includes("revogado_em")) { return pool.query(
        `SELECT id, tipo, file_name AS "fileName", exam_count AS "examCount", created_at AS "createdAt", false AS revogado
           FROM exam_request_pdfs WHERE client_id = $1 ORDER BY created_at DESC NULLS LAST, id DESC LIMIT 100`, [clientId]); } throw e; });
    res.json({ documentos: r.rows });
  } catch (err) { req.log.error({ errorType: err instanceof Error ? err.constructor.name : "erro" }, "listar documentos de exame"); res.status(500).json({ error: "Não foi possível carregar seus exames." }); }
});

// Reemissão: gera acesso NOVO (30 dias) para o próprio paciente. Não envia mensagem; o link só volta nesta resposta autenticada.
router.post("/area-paciente/exames/documentos/:id/acesso", async (req, res): Promise<void> => {
  protegerRespostaLink(res);
  const clientId = idDoPaciente(req.headers.authorization);
  if (clientId === null) { res.status(401).json({ error: "Sessão expirada. Entre novamente." }); return; }
  if (excedeuLimiteLink(req, "exame")) { res.status(429).json({ error: "Muitas tentativas. Aguarde um minuto." }); return; }
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) { res.status(400).json({ error: "Documento inválido." }); return; }
  try {
    const r = await pool.query(`SELECT id, client_id FROM exam_request_pdfs WHERE id = $1 AND client_id = $2`, [id, clientId]);
    if (r.rowCount === 0) { await auditarAcessoLink(req, "exame", "paciente:reemissao", "recusado", clientId); res.status(404).json({ error: "Documento não encontrado." }); return; }
    const rev = await pool.query(`SELECT revogado_em FROM exam_request_pdfs WHERE id=$1`, [id]).catch(() => ({ rows: [{ revogado_em: null }] }));
    if (rev.rows[0]?.revogado_em) { await auditarAcessoLink(req, "exame", "paciente:reemissao:revogado", "recusado", clientId); res.status(403).json({ error: "A clínica cancelou este documento. Fale com a clínica." }); return; }
    const token = criarTokenExame({ pdfId: id, clientId });
    await auditarAcessoLink(req, "exame", "paciente:reemissao", "aceito", clientId);
    res.json({ url: `/api/exam-requests/file/${token}`, validadeDias: 30 });
  } catch (err) { req.log.error({ errorType: err instanceof Error ? err.constructor.name : "erro" }, "reemitir acesso de exame"); res.status(500).json({ error: "Não foi possível gerar o acesso." }); }
});

// Política de transição dos legados: leitura e ativação explícita, só dono da plataforma.
router.get("/exam-requests/politica-legado", requireCollaborator, async (req, res): Promise<void> => {
  if (!req.tenantContext?.isPlatformOwner) { res.status(403).json({ error: "Somente o dono da plataforma." }); return; }
  const p = await carregarPoliticaLegado();
  res.json({ politica: p, status: statusLegado(p) });
});
router.post("/exam-requests/politica-legado/ativar", requireCollaborator, async (req, res): Promise<void> => {
  if (!req.tenantContext?.isPlatformOwner) { res.status(403).json({ error: "Somente o dono da plataforma." }); return; }
  if (req.body?.confirmar !== "ATIVAR_POLITICA_LEGADO") { res.status(400).json({ error: "Confirmação explícita ausente." }); return; }
  const quem = String((req.tenantContext as { professionalId?: unknown }).professionalId ?? "dono");
  const ok = await ativarPoliticaLegado(quem);
  const p = await carregarPoliticaLegado();
  res.status(ok ? 201 : 409).json({ ativada: ok, politica: p, status: statusLegado(p) });
});

export default router;
