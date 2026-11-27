/**
 * PAXCARE: o cliente convida um médico. Acesso individual (não da clínica), por escopo e prazo.
 * Token aleatório guardado só em hash. Nenhuma mensagem é enviada por aqui.
 */
import { createHash, randomBytes } from "node:crypto";
import { Router, type IRouter, type NextFunction, type Request, type Response } from "express";
import { sql } from "drizzle-orm";
import { z } from "zod/v4";
import { db } from "@workspace/db";
import { verifyPatientToken } from "../lib/portal-token";
import { requireCollaborator } from "./collaborator.js";
import { isPlatformOwner } from "../lib/clinical-access";
import { empresaIdsDoProfissional } from "../lib/professional-empresas";
import { tiposVisiveis } from "../lib/paxcare.js";

const router: IRouter = Router();

export async function garantirTabelasConviteMedico(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS paxcare_convites_medico (
      id SERIAL PRIMARY KEY,
      client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      medico_nome TEXT NOT NULL,
      medico_email TEXT NOT NULL,
      medico_conselho TEXT NOT NULL,
      medico_uf TEXT NOT NULL,
      empresa_id INTEGER REFERENCES empresas(id),
      comp_historico BOOLEAN NOT NULL DEFAULT FALSE,
      comp_exames BOOLEAN NOT NULL DEFAULT FALSE,
      comp_documentos BOOLEAN NOT NULL DEFAULT FALSE,
      acesso_dias INTEGER NOT NULL DEFAULT 30,
      status TEXT NOT NULL DEFAULT 'pendente',
      expira_em TIMESTAMPTZ NOT NULL,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      aceito_em TIMESTAMPTZ,
      acesso_ate TIMESTAMPTZ,
      aceito_por INTEGER,
      encerrado_em TIMESTAMPTZ,
      CONSTRAINT paxcare_conv_med_status_ck CHECK (status IN ('pendente','aceito','recusado','revogado'))
    )`);
  await db.execute(sql`ALTER TABLE paxcare_convites_medico ADD COLUMN IF NOT EXISTS consentimento_em TIMESTAMPTZ`);
  await db.execute(sql`ALTER TABLE paxcare_convites_medico ADD COLUMN IF NOT EXISTS consentimento_hash TEXT`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_paxcare_conv_med_client ON paxcare_convites_medico (client_id, criado_em DESC)`);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS paxcare_convites_medico_hist (
      id SERIAL PRIMARY KEY,
      convite_id INTEGER NOT NULL REFERENCES paxcare_convites_medico(id) ON DELETE CASCADE,
      acao TEXT NOT NULL,
      ator TEXT,
      em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
}

const TERMO_VERSAO = "2026-11-27.1";
const TERMO_TEXTO = "Autorizo que o médico indicado por mim veja, somente para consulta, as categorias que marquei do meu cofre PaxCare, apenas pelo prazo escolhido. Posso retirar este acesso a qualquer momento e ele cessa imediatamente. Nenhuma mensagem é enviada por este aviso: eu mesmo entrego o link ao médico.";
const hash = (t: string) => createHash("sha256").update(t).digest("hex");
const norm = (s: string) => s.toLowerCase().trim();
const digitos = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "").replace(/^0+/, "");
const idParam = (v: unknown) => { const n = Number(v); return Number.isSafeInteger(n) && n > 0 ? n : null; };
async function hist(id: number, acao: string, ator: string) {
  await db.execute(sql`INSERT INTO paxcare_convites_medico_hist (convite_id, acao, ator) VALUES (${id}, ${acao}, ${ator})`);
}
const mascara = (e: string) => e.replace(/^(.).*(@.*)$/, "$1***$2");

const janelas = new Map<string, { n: number; fim: number }>();
function estourou(k: string, max: number, ms: number): boolean {
  const agora = Date.now(); const h = janelas.get(k);
  if (!h || agora > h.fim) { janelas.set(k, { n: 1, fim: agora + ms }); return false; }
  h.n += 1; return h.n > max;
}
export function zerarLimitesConviteMedico(): void { janelas.clear(); }

function exigePaciente(req: Request, res: Response, next: NextFunction): void {
  const a = req.headers.authorization;
  const id = a && a.startsWith("Bearer ") ? verifyPatientToken(a.slice(7)) : null;
  if (id === null) { res.status(401).json({ error: "Sessão expirada. Identifique-se novamente." }); return; }
  (req as Request & { cliId?: number }).cliId = id;
  next();
}
const cid = (req: Request) => (req as Request & { cliId?: number }).cliId!;

// ------------------------------- CLIENTE -------------------------------------
router.get("/area-paciente/paxcare/convites-medico/termo", exigePaciente, (_req, res): void => {
  res.json({ versao: TERMO_VERSAO, texto: TERMO_TEXTO, hash: hash(TERMO_VERSAO + TERMO_TEXTO) });
});

const Novo = z.object({
  consentimentoHash: z.string(),
  medicoNome: z.string().trim().min(3).max(120),
  medicoEmail: z.string().trim().max(255).regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/),
  conselho: z.string().trim().regex(/^\d{3,8}$/),
  uf: z.string().trim().length(2),
  empresaId: z.number().int().positive().optional(),
  compartilha: z.object({ historico: z.boolean(), exames: z.boolean(), documentos: z.boolean() }).strict()
    .refine((c) => c.historico || c.exames || c.documentos, "Escolha ao menos uma categoria."),
  validadeDias: z.number().int().min(1).max(30).default(7),
  acessoDias: z.number().int().min(1).max(365).default(30),
}).strict();

router.post("/area-paciente/paxcare/convites-medico", exigePaciente, async (req, res): Promise<void> => {
  const p = Novo.safeParse(req.body);
  if (!p.success) { res.status(400).json({ error: "Confira nome, e-mail, CRM, UF e o que compartilhar." }); return; }
  const d = p.data;
  if (d.consentimentoHash !== hash(TERMO_VERSAO + TERMO_TEXTO)) { res.status(400).json({ error: "Leia e aceite o termo de compartilhamento." }); return; }
  try {
    await garantirTabelasConviteMedico();
    if (estourou(`cli:${cid(req)}`, 10, 60 * 60_000)) { res.status(429).json({ error: "Muitos convites seguidos. Tente mais tarde." }); return; }
    if (d.empresaId) {
      const emp = (await db.execute(sql`SELECT id FROM empresas WHERE id=${d.empresaId} AND ativa=true AND status='ATIVO' AND tipo='clinic'`)).rows[0];
      if (!emp) { res.status(404).json({ error: "Clínica não encontrada." }); return; }
    }
    const token = randomBytes(32).toString("base64url");
    const row = (await db.execute(sql`
      INSERT INTO paxcare_convites_medico (client_id, token_hash, medico_nome, medico_email, medico_conselho, medico_uf, empresa_id,
        comp_historico, comp_exames, comp_documentos, acesso_dias, expira_em, consentimento_em, consentimento_hash)
      VALUES (${cid(req)}, ${hash(token)}, ${d.medicoNome}, ${norm(d.medicoEmail)}, ${d.conselho}, ${d.uf.toUpperCase()}, ${d.empresaId ?? null},
        ${d.compartilha.historico}, ${d.compartilha.exames}, ${d.compartilha.documentos}, ${d.acessoDias}, NOW() + make_interval(days => ${d.validadeDias}::int), NOW(), ${d.consentimentoHash})
      RETURNING id, expira_em`)).rows[0] as { id: number; expira_em: string };
    await hist(row.id, "criou", `cliente:${cid(req)}`);
    res.setHeader("Cache-Control", "no-store");
    res.status(201).json({ id: row.id, token, expiraEm: row.expira_em, aviso: "O link aparece só agora. Nenhuma mensagem foi enviada." });
  } catch (err) { req.log?.error({ err: String(err) }, "paxcare convite medico criar"); res.status(500).json({ error: "Não foi possível criar o convite." }); }
});

router.get("/area-paciente/paxcare/convites-medico", exigePaciente, async (req, res): Promise<void> => {
  await garantirTabelasConviteMedico();
  const rows = (await db.execute(sql`
    SELECT id, medico_nome, medico_email, status, expira_em, acesso_ate, criado_em, comp_historico, comp_exames, comp_documentos,
      (status='pendente' AND expira_em < NOW()) AS vencido
      FROM paxcare_convites_medico WHERE client_id=${cid(req)} ORDER BY id DESC LIMIT 200`)).rows as any[];
  res.setHeader("Cache-Control", "private, no-store");
  res.json(rows.map((r) => ({ id: r.id, medico: r.medico_nome, email: mascara(r.medico_email), status: r.vencido ? "expirado" : r.status,
    expiraEm: r.expira_em, acessoAte: r.acesso_ate, criadoEm: r.criado_em,
    compartilha: { historico: r.comp_historico, exames: r.comp_exames, documentos: r.comp_documentos } })));
});

router.delete("/area-paciente/paxcare/convites-medico/:id", exigePaciente, async (req, res): Promise<void> => {
  const id = idParam(req.params.id);
  if (!id) { res.status(400).json({ error: "Convite inválido." }); return; }
  const r = await db.execute(sql`
    UPDATE paxcare_convites_medico SET status='revogado', encerrado_em=NOW()
     WHERE id=${id} AND client_id=${cid(req)} AND status IN ('pendente','aceito') RETURNING id`);
  if (!r.rows[0]) { res.status(404).json({ error: "Convite ativo não encontrado." }); return; }
  await hist(id, "revogou", `cliente:${cid(req)}`);
  res.json({ ok: true });
});

// -------------------------------- MÉDICO -------------------------------------
type Conv = { id: number; client_id: number; medico_email: string; medico_conselho: string; empresa_id: number | null; status: string;
  comp_historico: boolean; comp_exames: boolean; comp_documentos: boolean; acesso_dias: number; expira_em: string; vencido: boolean; nome: string };
const ator = (req: Request) => `prof:${req.collaborator?.professionalId}`;

async function conviteDoToken(token: string): Promise<Conv | null> {
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) return null;
  const r = (await db.execute(sql`
    SELECT v.*, (v.expira_em < NOW()) AS vencido, c.name AS nome FROM paxcare_convites_medico v JOIN clients c ON c.id=v.client_id
     WHERE v.token_hash=${hash(token)}`)).rows[0] as Conv | undefined;
  return r ?? null;
}
/** Identidade: e-mail E número do conselho do cadastro precisam coincidir com o convite. */
async function identidadeConfere(profId: number, c: Conv): Promise<boolean> {
  const p = (await db.execute(sql`SELECT email, secondary_email, registration_number, crm FROM professionals WHERE id=${profId}`)).rows[0] as
    { email: string | null; secondary_email: string | null; registration_number: string | null; crm: string | null } | undefined;
  if (!p) return false;
  const emails = [p.email, p.secondary_email].filter(Boolean).map((e) => norm(e!));
  const conselhoOk = [p.registration_number, p.crm].some((n) => digitos(n) !== "" && digitos(n) === digitos(c.medico_conselho));
  if (!emails.includes(norm(c.medico_email)) || !conselhoOk) return false;
  if (c.empresa_id && !(await empresaIdsDoProfissional(profId)).has(c.empresa_id)) return false;
  return true;
}
const NEGADO = { error: "Este convite não pode ser aberto com a sua conta." };

router.get("/collaborator/paxcare/convites/:token", requireCollaborator, async (req, res): Promise<void> => {
  if (estourou(`tok:${req.ip}`, 20, 10 * 60_000)) { res.status(429).json({ error: "Muitas tentativas." }); return; }
  await garantirTabelasConviteMedico();
  const c = await conviteDoToken(String(req.params.token));
  const profId = Number(req.collaborator?.professionalId);
  if (!c || !(await identidadeConfere(profId, c))) {
    if (c) await hist(c.id, "negou", ator(req));
    res.status(403).json(NEGADO); return;
  }
  await hist(c.id, "visualizou", ator(req));
  res.setHeader("Cache-Control", "private, no-store");
  res.json({ id: c.id, cliente: c.nome.split(" ")[0], status: c.vencido && c.status === "pendente" ? "expirado" : c.status,
    compartilha: { historico: c.comp_historico, exames: c.comp_exames, documentos: c.comp_documentos }, acessoDias: c.acesso_dias, expiraEm: c.expira_em });
});

async function decidir(req: Request, res: Response, aceitar: boolean): Promise<void> {
  await garantirTabelasConviteMedico();
  const c = await conviteDoToken(String(req.params.token));
  const profId = Number(req.collaborator?.professionalId);
  if (!c || !(await identidadeConfere(profId, c))) { if (c) await hist(c.id, "negou", ator(req)); res.status(403).json(NEGADO); return; }
  const r = aceitar
    ? await db.execute(sql`UPDATE paxcare_convites_medico SET status='aceito', aceito_em=NOW(), aceito_por=${profId},
        acesso_ate=NOW() + make_interval(days => acesso_dias) WHERE id=${c.id} AND status='pendente' AND expira_em >= NOW() RETURNING id`)
    : await db.execute(sql`UPDATE paxcare_convites_medico SET status='recusado', encerrado_em=NOW() WHERE id=${c.id} AND status='pendente' RETURNING id`);
  if (!r.rows[0]) { res.status(409).json({ error: "Convite expirado ou já respondido." }); return; }
  await hist(c.id, aceitar ? "aceitou" : "recusou", ator(req));
  res.json({ ok: true });
}
router.post("/collaborator/paxcare/convites/:token/aceitar", requireCollaborator, (req, res) => decidir(req, res, true));
router.post("/collaborator/paxcare/convites/:token/recusar", requireCollaborator, (req, res) => decidir(req, res, false));

const ATIVO = sql`status='aceito' AND acesso_ate > NOW()`;
router.get("/collaborator/paxcare/convites-aceitos", requireCollaborator, async (req, res): Promise<void> => {
  await garantirTabelasConviteMedico();
  const rows = (await db.execute(sql`
    SELECT v.id, v.client_id, c.name, v.acesso_ate FROM paxcare_convites_medico v JOIN clients c ON c.id=v.client_id
     WHERE v.aceito_por=${Number(req.collaborator?.professionalId)} AND v.${ATIVO} ORDER BY v.id DESC LIMIT 200`)).rows as any[];
  res.setHeader("Cache-Control", "private, no-store");
  res.json(rows.map((r) => ({ id: r.id, clientId: r.client_id, nome: r.name, acessoAte: r.acesso_ate })));
});

router.get("/collaborator/paxcare/convites-aceitos/:id/cofre", requireCollaborator, async (req, res): Promise<void> => {
  const id = idParam(req.params.id);
  await garantirTabelasConviteMedico();
  const c = id ? (await db.execute(sql`
    SELECT client_id, comp_historico, comp_exames, comp_documentos FROM paxcare_convites_medico
     WHERE id=${id} AND aceito_por=${Number(req.collaborator?.professionalId)} AND ${ATIVO}`)).rows[0] as
    { client_id: number; comp_historico: boolean; comp_exames: boolean; comp_documentos: boolean } | undefined : undefined;
  const tipos = c ? tiposVisiveis({ historico: c.comp_historico, exames: c.comp_exames, documentos: c.comp_documentos }) : [];
  if (!c || tipos.length === 0) { res.status(403).json({ error: "Acesso encerrado ou não autorizado pelo cliente." }); return; }
  const itens = (await db.execute(sql`
    SELECT id, tipo, titulo, to_char(data_ref,'YYYY-MM-DD') AS data_ref, notas, (arquivo IS NOT NULL) AS tem_arquivo
      FROM paxcare_cofre_itens WHERE client_id=${c.client_id} AND removido_em IS NULL AND tipo IN (${sql.join(tipos.map((t) => sql`${t}`), sql`, `)})
     ORDER BY COALESCE(data_ref, criado_em::date) DESC, id DESC LIMIT 500`)).rows as any[];
  await hist(id!, "leu_cofre", ator(req));
  res.setHeader("Cache-Control", "private, no-store");
  res.json({ itens: itens.map((r) => ({ id: r.id, tipo: r.tipo, titulo: r.titulo, dataRef: r.data_ref, notas: r.notas, temArquivo: r.tem_arquivo })) });
});

// --------------------------------- CEO ---------------------------------------
router.get("/ceo/paxcare/convites-medico", requireCollaborator, async (req, res): Promise<void> => {
  const prof = Number(req.collaborator?.professionalId);
  if (!(await isPlatformOwner(prof))) { res.status(403).json({ error: "Acesso restrito ao titular da plataforma." }); return; }
  await garantirTabelasConviteMedico();
  const rows = (await db.execute(sql`
    SELECT v.id, v.medico_nome, v.medico_email, v.empresa_id, v.criado_em, v.expira_em, v.acesso_ate,
      CASE WHEN v.status='pendente' AND v.expira_em < NOW() THEN 'expirado' WHEN v.status='aceito' AND v.acesso_ate <= NOW() THEN 'acesso_encerrado' ELSE v.status END AS situacao
      FROM paxcare_convites_medico v ORDER BY v.id DESC LIMIT 500`)).rows as any[];
  const resumo: Record<string, number> = {};
  for (const r of rows) resumo[r.situacao] = (resumo[r.situacao] ?? 0) + 1;
  res.setHeader("Cache-Control", "private, no-store");
  res.json({ resumo, convites: rows.map((r) => ({ id: r.id, medico: r.medico_nome, email: mascara(r.medico_email), empresaId: r.empresa_id, situacao: r.situacao, criadoEm: r.criado_em, expiraEm: r.expira_em, acessoAte: r.acesso_ate })) });
});

export default router;
