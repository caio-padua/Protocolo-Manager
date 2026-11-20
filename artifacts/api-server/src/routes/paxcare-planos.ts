import { Router, type IRouter, type NextFunction, type Request, type Response } from "express";
import { sql } from "drizzle-orm";
import { z } from "zod/v4";
import { db } from "@workspace/db";
import { verifyPatientToken } from "../lib/portal-token";
import { requireCollaborator } from "./collaborator.js";
import { isPlatformOwner } from "../lib/clinical-access.js";
import { hashOferta, pendenciasParaAtivar, periodoRef, type Plano } from "../lib/paxcare-planos.js";

/**
 * PAXCARE planos B2C. Catalogo = so o titular da plataforma; contratacao = so o paciente autenticado
 * (token de previa do administrador nao contrata). A assinatura do app NAO concede beneficio de clinica:
 * a elegibilidade ao PAM continua em client_member_beneficios, decidida por cada clinica.
 */
const router: IRouter = Router();

async function exigeDono(req: Request, res: Response, next: NextFunction): Promise<void> {
  const id = Number(req.collaborator?.professionalId);
  if (!Number.isSafeInteger(id) || id <= 0 || !(await isPlatformOwner(id))) { res.status(403).json({ error: "Acesso restrito ao titular da plataforma." }); return; }
  next();
}
function exigePaciente(req: Request, res: Response, next: NextFunction): void {
  const a = req.headers.authorization;
  const id = a && a.startsWith("Bearer ") ? verifyPatientToken(a.slice(7)) : null;
  if (id === null) { res.status(401).json({ error: "Sessão expirada. Identifique-se novamente." }); return; }
  (req as Request & { pid?: number }).pid = id; next();
}
const pid = (req: Request) => (req as Request & { pid?: number }).pid!;
const idParam = (v: unknown) => { const n = Number(v); return Number.isSafeInteger(n) && n > 0 ? n : null; };

const Per = z.enum(["mensal", "anual"]);
const Campos = z.object({
  nome: z.string().trim().min(2).max(120),
  descricao: z.string().trim().max(2000).nullable(),
  gratuito: z.boolean(),
  precoCentavos: z.number().int().min(0).nullable(),
  periodicidade: Per.nullable(),
  franquiaQtd: z.number().int().min(0).nullable(),
  franquiaUnidade: z.string().trim().max(60).nullable(),
  franquiaPeriodo: Per.nullable(),
  precoExcedenteCentavos: z.number().int().min(0).nullable(),
  descontoExcedentePct: z.number().min(0).max(100).nullable(),
  beneficios: z.array(z.string().trim().min(1).max(200)).max(30),
  termoAceite: z.string().trim().max(8000).nullable(),
}).strict();
const Parcial = Campos.partial().strict();

const view = (p: Plano & Record<string, unknown>) => ({
  id: p.id, nome: p.nome, descricao: p.descricao, status: p.status, gratuito: p.gratuito,
  precoCentavos: p.preco_centavos, periodicidade: p.periodicidade,
  franquiaQtd: p.franquia_qtd, franquiaUnidade: p.franquia_unidade, franquiaPeriodo: p.franquia_periodo,
  precoExcedenteCentavos: p.preco_excedente_centavos,
  descontoExcedentePct: p.desconto_excedente_pct === null ? null : Number(p.desconto_excedente_pct),
  beneficios: p.beneficios, termoAceite: p.termo_aceite,
});

// ------------------------- ADMINISTRADOR (catalogo) ---------------------------
router.get("/paxcare/planos", requireCollaborator, exigeDono, async (_req, res): Promise<void> => {
  const r = await db.execute(sql`SELECT * FROM paxcare_planos ORDER BY id`);
  res.json((r.rows as unknown as Plano[]).map((p) => view(p as never)));
});

router.post("/paxcare/planos", requireCollaborator, exigeDono, async (req, res): Promise<void> => {
  const nome = z.object({ nome: z.string().trim().min(2).max(120) }).strict().safeParse(req.body);
  if (!nome.success) { res.status(400).json({ error: "Informe o nome do plano." }); return; }
  const r = await db.execute(sql`INSERT INTO paxcare_planos (nome) VALUES (${nome.data.nome}) RETURNING *`);
  res.status(201).json(view(r.rows[0] as never));
});

router.patch("/paxcare/planos/:id", requireCollaborator, exigeDono, async (req, res): Promise<void> => {
  const id = idParam(req.params.id); const p = Parcial.safeParse(req.body);
  if (!id || !p.success || Object.keys(p.data).length === 0) { res.status(400).json({ error: "Dados inválidos." }); return; }
  const d = p.data;
  try {
    const out = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"paxcare-plano:" + id}))`);
      const cur = (await tx.execute(sql`SELECT * FROM paxcare_planos WHERE id=${id} FOR UPDATE`)).rows[0] as unknown as Plano | undefined;
      if (!cur) return "NF" as const;
      if (cur.status === "encerrado") return "ENC" as const;
      const m = {
        nome: d.nome ?? cur.nome, descricao: d.descricao === undefined ? cur.descricao : d.descricao,
        gratuito: d.gratuito ?? cur.gratuito,
        preco: d.precoCentavos === undefined ? cur.preco_centavos : d.precoCentavos,
        per: d.periodicidade === undefined ? cur.periodicidade : d.periodicidade,
        fq: d.franquiaQtd === undefined ? cur.franquia_qtd : d.franquiaQtd,
        fu: d.franquiaUnidade === undefined ? cur.franquia_unidade : d.franquiaUnidade,
        fp: d.franquiaPeriodo === undefined ? cur.franquia_periodo : d.franquiaPeriodo,
        pe: d.precoExcedenteCentavos === undefined ? cur.preco_excedente_centavos : d.precoExcedenteCentavos,
        de: d.descontoExcedentePct === undefined ? cur.desconto_excedente_pct : d.descontoExcedentePct,
        be: d.beneficios ?? cur.beneficios, te: d.termoAceite === undefined ? cur.termo_aceite : d.termoAceite,
      };
      if (cur.status === "ativo") {
        // Plano ativo continua completo; contratos ja feitos guardam o proprio snapshot.
        const falta = pendenciasParaAtivar({ nome: m.nome, termo_aceite: m.te, gratuito: m.gratuito, preco_centavos: m.preco, periodicidade: m.per, franquia_qtd: m.fq, franquia_unidade: m.fu, franquia_periodo: m.fp });
        if (falta.length) return falta;
      }
      const r = await tx.execute(sql`
        UPDATE paxcare_planos SET nome=${m.nome}, descricao=${m.descricao}, gratuito=${m.gratuito}, preco_centavos=${m.preco}, periodicidade=${m.per},
          franquia_qtd=${m.fq}, franquia_unidade=${m.fu}, franquia_periodo=${m.fp}, preco_excedente_centavos=${m.pe}, desconto_excedente_pct=${m.de},
          beneficios=${JSON.stringify(m.be)}::jsonb, termo_aceite=${m.te}, atualizado_em=NOW() WHERE id=${id} RETURNING *`);
      return r.rows[0] as unknown as Plano;
    });
    if (out === "NF") { res.status(404).json({ error: "Plano não encontrado." }); return; }
    if (out === "ENC") { res.status(409).json({ error: "Plano encerrado não pode ser alterado." }); return; }
    if (Array.isArray(out)) { res.status(409).json({ error: `Plano ativo precisa continuar completo: ${out.join(", ")}.` }); return; }
    res.json(view(out as never));
  } catch (err) { req.log.error({ err: String(err) }, "paxcare plano patch"); res.status(500).json({ error: "Não foi possível salvar o plano." }); }
});

async function mudarStatus(req: Request, res: Response, para: "ativo" | "encerrado"): Promise<void> {
  const id = idParam(req.params.id);
  if (!id) { res.status(400).json({ error: "Plano inválido." }); return; }
  const out = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"paxcare-plano:" + id}))`);
    const cur = (await tx.execute(sql`SELECT * FROM paxcare_planos WHERE id=${id} FOR UPDATE`)).rows[0] as unknown as Plano | undefined;
    if (!cur) return "NF" as const;
    if (para === "ativo") {
      if (cur.status !== "rascunho") return "ESTADO" as const;
      const falta = pendenciasParaAtivar(cur);
      if (falta.length) return falta;
    } else if (cur.status === "encerrado") return "ESTADO" as const;
    // Encerrar nao cancela quem ja contratou: so fecha novas contratacoes.
    const r = await tx.execute(sql`UPDATE paxcare_planos SET status=${para}, atualizado_em=NOW() WHERE id=${id} RETURNING *`);
    return r.rows[0] as unknown as Plano;
  });
  if (out === "NF") { res.status(404).json({ error: "Plano não encontrado." }); return; }
  if (out === "ESTADO") { res.status(409).json({ error: "Estado do plano não permite esta ação." }); return; }
  if (Array.isArray(out)) { res.status(409).json({ error: `Para ativar, preencha: ${out.join(", ")}.` }); return; }
  res.json(view(out as never));
}
router.post("/paxcare/planos/:id/ativar", requireCollaborator, exigeDono, (req, res) => void mudarStatus(req, res, "ativo"));
router.post("/paxcare/planos/:id/encerrar", requireCollaborator, exigeDono, (req, res) => void mudarStatus(req, res, "encerrado"));

// ------------------------------- PACIENTE -------------------------------------
router.get("/area-paciente/paxcare/planos", exigePaciente, async (_req, res): Promise<void> => {
  const r = await db.execute(sql`SELECT * FROM paxcare_planos WHERE status='ativo' ORDER BY id`);
  const planos = (r.rows as unknown as Plano[]).map((p) => ({ ...view(p as never), termoHash: hashOferta(p) }));
  res.setHeader("Cache-Control", "private, no-store");
  res.json({ planos, aviso: "A assinatura do PaxCare é separada do PAM. A elegibilidade ao PAM é decidida por cada clínica." });
});

router.get("/area-paciente/paxcare/assinatura", exigePaciente, async (req, res): Promise<void> => {
  const a = (await db.execute(sql`SELECT id, plano_id, aceite_em, plano_snapshot, cobranca_status, ambiente FROM paxcare_assinaturas WHERE client_id=${pid(req)} AND status='ativa'`)).rows[0] as
    { id: number; plano_id: number; aceite_em: string; plano_snapshot: Plano; cobranca_status: string; ambiente: string } | undefined;
  res.setHeader("Cache-Control", "private, no-store");
  if (!a) { res.json({ assinatura: null }); return; }
  const s = a.plano_snapshot;
  const per = s.franquia_periodo ?? "mensal";
  const ref = periodoRef(per);
  const u = (await db.execute(sql`SELECT COALESCE(SUM(qtd),0)::int AS usado, COALESCE(SUM(excedente),0)::int AS exc, SUM(valor_excedente_centavos)::int AS valor FROM paxcare_consumo WHERE assinatura_id=${a.id} AND periodo_ref=${ref}`)).rows[0] as { usado: number; exc: number; valor: number | null };
  res.json({
    assinatura: { id: a.id, planoId: a.plano_id, aceiteEm: a.aceite_em, cobrancaStatus: a.cobranca_status, ambiente: a.ambiente, plano: view(s as never) },
    consumo: { periodo: ref, usado: u.usado, franquia: s.franquia_qtd, excedente: u.exc, valorExcedenteCentavos: u.valor },
  });
});

const Contratar = z.object({ planoId: z.number().int().positive(), aceite: z.literal(true), termoHash: z.string().length(64) }).strict();
router.post("/area-paciente/paxcare/assinatura", exigePaciente, async (req, res): Promise<void> => {
  const p = Contratar.safeParse(req.body);
  if (!p.success) { res.status(400).json({ error: "Para contratar é preciso aceitar o termo do plano." }); return; }
  const cid = pid(req);
  try {
    const out = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"paxcare-assin:" + cid}))`);
      const ja = (await tx.execute(sql`SELECT id, plano_id FROM paxcare_assinaturas WHERE client_id=${cid} AND status='ativa'`)).rows[0] as { id: number; plano_id: number } | undefined;
      if (ja) return ja.plano_id === p.data.planoId ? ({ id: ja.id, repetido: true } as const) : ("OUTRO" as const);
      const plano = (await tx.execute(sql`SELECT * FROM paxcare_planos WHERE id=${p.data.planoId} AND status='ativo'`)).rows[0] as unknown as Plano | undefined;
      if (!plano) return "NF" as const;
      const termo = plano.termo_aceite ?? "";
      if (hashOferta(plano) !== p.data.termoHash) return "TERMO" as const; // oferta mudou depois de exibida
      const snap = view(plano as never);
      const r = await tx.execute(sql`
        INSERT INTO paxcare_assinaturas (client_id, plano_id, aceite_termo, aceite_hash, plano_snapshot, cobranca_status)
        VALUES (${cid}, ${plano.id}, ${termo}, ${p.data.termoHash}, ${JSON.stringify({ ...plano, beneficios: plano.beneficios })}::jsonb,
                ${plano.gratuito ? "sem_cobranca" : "pendente_integracao"}) RETURNING id`);
      void snap;
      return { id: (r.rows[0] as { id: number }).id, repetido: false } as const;
    });
    if (out === "OUTRO") { res.status(409).json({ error: "Você já tem um plano ativo. Cancele-o antes de contratar outro." }); return; }
    if (out === "NF") { res.status(404).json({ error: "Plano indisponível." }); return; }
    if (out === "TERMO") { res.status(409).json({ error: "A oferta do plano mudou. Releia e aceite novamente." }); return; }
    res.status(out.repetido ? 200 : 201).json(out);
  } catch (err) { req.log.error({ err: String(err) }, "paxcare contratar"); res.status(500).json({ error: "Não foi possível contratar agora." }); }
});

router.delete("/area-paciente/paxcare/assinatura", exigePaciente, async (req, res): Promise<void> => {
  const r = await db.execute(sql`UPDATE paxcare_assinaturas SET status='cancelada', cancelado_em=NOW() WHERE client_id=${pid(req)} AND status='ativa' RETURNING id`);
  if (!r.rows[0]) { res.status(404).json({ error: "Nenhuma assinatura ativa." }); return; }
  res.json({ ok: true });
});

export default router;
