import { Router, type IRouter, type Request, type Response } from "express";
import { sql } from "drizzle-orm";
import { z } from "zod/v4";
import { db } from "@workspace/db";
import { verifyPortalToken } from "../lib/portal-token";
import { isPlatformOwner } from "../lib/clinical-access";
import { requireCollaborator } from "./collaborator";
import { EXAMES_AVULSOS_AVISO, EXAMES_AVULSOS_MAX_ABERTAS, EXAMES_AVULSOS_MAX_ITENS } from "../lib/exames-avulsos";

// Exames avulsos: o cliente escolhe, pede informacao e orcamento. Nao e prescricao.
// O orcamento so existe depois que o titular da plataforma informa o valor (sem preco padrao).
const router: IRouter = Router();

interface Row {
  id: number; client_id: number; items: Array<{ codigo: string; nome: string; grupo: string | null; preparo: string | null }>;
  notes: string | null; status: string; quote_amount: string | null; quote_note: string | null;
  quoted_at: string | null; accepted_at: string | null; created_at: string; client_name?: string;
}

function portalClientId(req: Request): number | null {
  const a = req.headers.authorization;
  return a && a.startsWith("Bearer ") ? verifyPortalToken(a.slice(7)) : null;
}
const unauthorized = (res: Response) => res.status(401).json({ error: "Sessão expirada. Identifique-se novamente." });

// O cliente so ve o valor depois que o orcamento foi publicado.
function clientView(r: Row) {
  const published = r.status === "orcamento_enviado" || r.status === "aceito";
  return {
    id: r.id, status: r.status, items: r.items, notes: r.notes, createdAt: r.created_at,
    quoteAmount: published && r.quote_amount !== null ? Number(r.quote_amount) : null,
    quoteNote: published ? r.quote_note : null,
    aviso: EXAMES_AVULSOS_AVISO,
  };
}

router.get("/area-paciente/exames-avulsos/catalogo", async (req, res): Promise<void> => {
  if (!portalClientId(req)) return void unauthorized(res);
  const q = String(req.query.q ?? "").trim().slice(0, 60);
  if (q.length < 2) { res.json({ aviso: EXAMES_AVULSOS_AVISO, itens: [] }); return; }
  const like = `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
  const rows = await db.execute(sql`
    SELECT codigo_exame AS codigo, nome_exame AS nome, grupo_principal AS grupo, modalidade, preparo
      FROM catalogo_exames WHERE ativo = true AND nome_exame ILIKE ${like} ORDER BY nome_exame LIMIT 30`);
  res.json({ aviso: EXAMES_AVULSOS_AVISO, itens: rows.rows });
});

const CreateBody = z.object({
  codigos: z.array(z.string().trim().min(1).max(80)).min(1).max(EXAMES_AVULSOS_MAX_ITENS),
  notes: z.string().trim().max(1000).optional(),
}).strict();

router.post("/area-paciente/exames-avulsos", async (req, res): Promise<void> => {
  const clientId = portalClientId(req);
  if (!clientId) return void unauthorized(res);
  const body = CreateBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: `Escolha de 1 a ${EXAMES_AVULSOS_MAX_ITENS} exames do catálogo.` }); return; }
  const codigos = [...new Set(body.data.codigos)];
  try {
    const created = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"exame-avulso:" + clientId}))`);
      const cli: any = (await tx.execute(sql`SELECT id, empresa_id FROM clients WHERE id = ${clientId}`)).rows[0];
      if (!cli) return { code: 401 as const };
      const open: any = (await tx.execute(sql`
        SELECT COUNT(*)::int AS n FROM exam_avulso_requests WHERE client_id = ${clientId} AND status IN ('solicitado','orcamento_enviado')`)).rows[0];
      if (open.n >= EXAMES_AVULSOS_MAX_ABERTAS) return { code: 429 as const };
      // Itens resolvidos NO SERVIDOR pelo catalogo ativo; codigo desconhecido recusa tudo.
      const found = (await tx.execute(sql`
        SELECT codigo_exame AS codigo, nome_exame AS nome, grupo_principal AS grupo, preparo
          FROM catalogo_exames WHERE ativo = true AND codigo_exame IN (${sql.join(codigos.map((c) => sql`${c}`), sql`, `)})`)).rows as any[];
      if (found.length !== codigos.length) return { code: 422 as const };
      const ins = await tx.execute(sql`
        INSERT INTO exam_avulso_requests (client_id, empresa_id, items, notes)
        VALUES (${clientId}, ${cli.empresa_id}, ${JSON.stringify(found)}::jsonb, ${body.data.notes ?? null})
        RETURNING *`);
      return { code: 201 as const, row: ins.rows[0] as unknown as Row };
    });
    if (created.code === 401) return void unauthorized(res);
    if (created.code === 429) { res.status(429).json({ error: "Você já tem solicitações em andamento. Aguarde o retorno ou cancele uma." }); return; }
    if (created.code === 422) { res.status(422).json({ error: "Algum exame não está mais no catálogo ativo. Refaça a busca." }); return; }
    res.status(201).json(clientView(created.row));
  } catch (err) {
    req.log.error({ err: String(err) }, "Erro ao criar solicitação de exames avulsos");
    res.status(500).json({ error: "Não foi possível registrar a solicitação." });
  }
});

router.get("/area-paciente/exames-avulsos", async (req, res): Promise<void> => {
  const clientId = portalClientId(req);
  if (!clientId) return void unauthorized(res);
  const rows = await db.execute(sql`SELECT * FROM exam_avulso_requests WHERE client_id = ${clientId} ORDER BY created_at DESC, id DESC LIMIT 50`);
  res.json((rows.rows as unknown as Row[]).map(clientView));
});

const Confirm = z.object({ confirmo: z.literal(true) }).strict();

router.post("/area-paciente/exames-avulsos/:id/aceitar", async (req, res): Promise<void> => {
  const clientId = portalClientId(req);
  if (!clientId) return void unauthorized(res);
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0 || !Confirm.safeParse(req.body).success) {
    res.status(400).json({ error: "Confirme explicitamente que aceita o orçamento." }); return;
  }
  const r = await db.execute(sql`
    UPDATE exam_avulso_requests SET status='aceito', accepted_at=NOW(), updated_at=NOW()
     WHERE id=${id} AND client_id=${clientId} AND status='orcamento_enviado' RETURNING *`);
  if (!r.rows[0]) { res.status(409).json({ error: "Não há orçamento publicado para aceitar." }); return; }
  res.json(clientView(r.rows[0] as unknown as Row));
});

router.post("/area-paciente/exames-avulsos/:id/cancelar", async (req, res): Promise<void> => {
  const clientId = portalClientId(req);
  if (!clientId) return void unauthorized(res);
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) { res.status(400).json({ error: "Solicitação inválida." }); return; }
  const r = await db.execute(sql`
    UPDATE exam_avulso_requests SET status='cancelado', updated_at=NOW()
     WHERE id=${id} AND client_id=${clientId} AND status IN ('solicitado','orcamento_enviado') RETURNING *`);
  if (!r.rows[0]) { res.status(409).json({ error: "Esta solicitação não pode mais ser cancelada." }); return; }
  res.json(clientView(r.rows[0] as unknown as Row));
});

// ---- Equipe: so o titular da plataforma informa/edita valor e publica ----
async function owner(req: Request, res: Response): Promise<number | null> {
  const actor = Number(req.collaborator?.professionalId);
  if (!Number.isSafeInteger(actor) || actor <= 0) { res.status(401).json({ error: "Faça login de colaborador." }); return null; }
  if (!(await isPlatformOwner(actor))) { res.status(403).json({ error: "Acesso restrito ao titular da plataforma." }); return null; }
  return actor;
}

router.get("/exames-avulsos/fila", requireCollaborator, async (req, res): Promise<void> => {
  if (!(await owner(req, res))) return;
  const rows = await db.execute(sql`
    SELECT r.*, c.name AS client_name FROM exam_avulso_requests r JOIN clients c ON c.id = r.client_id
     WHERE r.status IN ('solicitado','orcamento_enviado','aceito') ORDER BY r.created_at ASC LIMIT 300`);
  res.json((rows.rows as unknown as Row[]).map((r) => ({
    id: r.id, clientId: r.client_id, clientName: r.client_name, status: r.status, items: r.items, notes: r.notes,
    quoteAmount: r.quote_amount === null ? null : Number(r.quote_amount), quoteNote: r.quote_note, createdAt: r.created_at,
  })));
});

const QuoteBody = z.object({
  valor: z.number().positive().max(100000),
  nota: z.string().trim().max(500).optional(),
  confirmo: z.literal(true),
}).strict();

router.put("/exames-avulsos/:id/orcamento", requireCollaborator, async (req, res): Promise<void> => {
  const actor = await owner(req, res);
  if (!actor) return;
  const id = Number(req.params.id);
  const body = QuoteBody.safeParse(req.body);
  if (!Number.isSafeInteger(id) || id <= 0 || !body.success) {
    res.status(400).json({ error: "Informe um valor positivo e confirme explicitamente a publicação do orçamento." }); return;
  }
  const valor = Math.round(body.data.valor * 100) / 100;
  const r = await db.execute(sql`
    UPDATE exam_avulso_requests SET status='orcamento_enviado', quote_amount=${valor}, quote_note=${body.data.nota ?? null},
           quoted_by=${actor}, quoted_at=NOW(), updated_at=NOW()
     WHERE id=${id} AND status IN ('solicitado','orcamento_enviado') RETURNING id, status, quote_amount`);
  if (!r.rows[0]) { res.status(409).json({ error: "Esta solicitação já foi aceita ou cancelada: o valor não pode mais mudar." }); return; }
  res.json({ id, status: "orcamento_enviado", quoteAmount: valor });
});

export default router;
