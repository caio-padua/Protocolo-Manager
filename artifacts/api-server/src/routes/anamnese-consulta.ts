import { Router, type IRouter } from "express";
import { randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { requireCollaborator } from "./collaborator.js";
import { requireMessageClinic } from "../middleware/messageClinic.js";
import { absoluteBaseUrl } from "../lib/messaging/base-url.js";
import { volatilidadeDa, herdaResposta, type Volatilidade } from "../lib/anamnese-volatilidade.js";
import { enviarComunicacao, ambienteDoCliente } from "../lib/comunicacao-padrao.js";

/**
 * NOVA ANAMNESE NA CONSULTA. O medico abre uma sessao nova para o cliente (na tela dele ou no celular do cliente).
 * A sessao nova herda so o que nao muda (fixa/acumula); o estado atual vem em branco. Nada e apagado da anterior.
 * Tudo isolado pela clinica da sessao do colaborador.
 */
const router: IRouter = Router();
const PAGINA = "/anamnese/v2";
const linkDe = (req: Parameters<typeof absoluteBaseUrl>[0], token: string) => `${absoluteBaseUrl(req)}${PAGINA}?s=${token}`;

async function clienteDaClinica(clientId: number, empresaId: number) {
  if (!Number.isSafeInteger(clientId) || clientId <= 0) return null;
  const r = (await db.execute(sql`SELECT id, name, empresa_id FROM clients WHERE id=${clientId} AND empresa_id=${empresaId}`)).rows[0] as { id: number; name: string } | undefined;
  return r ?? null;
}

/** Sessao de consulta em aberto (rascunho) do cliente, se houver. */
async function emAberto(clientId: number) {
  return (await db.execute(sql`SELECT id, token,
      to_char(started_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') AS started_at,
      to_char(last_seen_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') AS last_seen_at,
      (SELECT COUNT(*)::int FROM anamnese_session_answers a WHERE a.session_id=s.id) AS respondidas
    FROM anamnese_sessions s WHERE client_id=${clientId} AND status='rascunho' AND mode='consulta' ORDER BY id DESC LIMIT 1`)).rows[0] as
    { id: number; token: string; started_at: string; last_seen_at: string | null; respondidas: number } | undefined;
}

router.get("/collaborator/anamnese/clientes/:clientId/consulta", requireCollaborator, requireMessageClinic, async (req, res): Promise<void> => {
  res.setHeader("Cache-Control", "no-store");
  const clientId = Number(req.params.clientId);
  if (!(await clienteDaClinica(clientId, req.messageEmpresaId!))) { res.status(404).json({ error: "Cliente não encontrado nesta clínica." }); return; }
  const a = await emAberto(clientId);
  const total = ((await db.execute(sql`SELECT COUNT(*)::int AS n FROM anamnese_questionario`)).rows[0] as { n: number }).n;
  res.json({ total, emAberto: a ? { id: a.id, link: linkDe(req, a.token), iniciadaEm: a.started_at, ultimaAtividade: a.last_seen_at, respondidas: a.respondidas } : null });
});

router.post("/collaborator/anamnese/clientes/:clientId/nova", requireCollaborator, requireMessageClinic, async (req, res): Promise<void> => {
  const empresaId = req.messageEmpresaId!;
  const clientId = Number(req.params.clientId);
  const cli = await clienteDaClinica(clientId, empresaId);
  if (!cli) { res.status(404).json({ error: "Cliente não encontrado nesta clínica." }); return; }
  try {
    const out = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"anamnese-nova:" + clientId}))`);
      const aberta = (await tx.execute(sql`SELECT id, token FROM anamnese_sessions WHERE client_id=${clientId} AND status='rascunho' AND mode='consulta' ORDER BY id DESC LIMIT 1`)).rows[0] as { id: number; token: string } | undefined;
      if (aberta) return { id: aberta.id, token: aberta.token, retomada: true, herdadas: 0 };
      const token = randomBytes(24).toString("hex");
      const ins = (await tx.execute(sql`INSERT INTO anamnese_sessions (token, client_id, mode, empresa_id) VALUES (${token}, ${clientId}, 'consulta', ${empresaId}) RETURNING id`)).rows[0] as { id: number };
      // Herda da ULTIMA concluida: so as perguntas que nao mudam.
      const ant = (await tx.execute(sql`SELECT id FROM anamnese_sessions WHERE client_id=${clientId} AND status IN ('concluida','concluido') AND id<>${ins.id} ORDER BY completed_at DESC NULLS LAST, id DESC LIMIT 1`)).rows[0] as { id: number } | undefined;
      let herdadas = 0;
      if (ant) {
        const resp = (await tx.execute(sql`SELECT question_row_id, pergunta_id, valor FROM anamnese_session_answers WHERE session_id=${ant.id}`)).rows as Array<{ question_row_id: number; pergunta_id: string | null; valor: unknown }>;
        for (const r of resp) {
          if (!herdaResposta(volatilidadeDa(Number(r.question_row_id)))) continue;
          await tx.execute(sql`INSERT INTO anamnese_session_answers (session_id, question_row_id, pergunta_id, valor, tempo_seg) VALUES (${ins.id}, ${r.question_row_id}, ${r.pergunta_id}, ${JSON.stringify(r.valor)}::jsonb, 0) ON CONFLICT DO NOTHING`);
          herdadas += 1;
        }
      }
      return { id: ins.id, token, retomada: false, herdadas };
    });
    res.status(out.retomada ? 200 : 201).json({ id: out.id, link: linkDe(req, out.token), retomada: out.retomada, herdadas: out.herdadas });
  } catch (err) {
    req.log.error({ err: String(err) }, "falha ao abrir nova anamnese");
    res.status(500).json({ error: "Não foi possível abrir a nova anamnese." });
  }
});

/** Envia o link ao celular do cliente (Telegram vinculado). Ação humana explícita: o botão pede confirmação na tela. */
router.post("/collaborator/anamnese/clientes/:clientId/enviar-link", requireCollaborator, requireMessageClinic, async (req, res): Promise<void> => {
  const clientId = Number(req.params.clientId);
  if (!(await clienteDaClinica(clientId, req.messageEmpresaId!))) { res.status(404).json({ error: "Cliente não encontrado nesta clínica." }); return; }
  const a = await emAberto(clientId);
  if (!a) { res.status(409).json({ error: "Abra a nova anamnese antes de enviar o link." }); return; }
  try {
    const r = await enviarComunicacao({ ambiente: await ambienteDoCliente(clientId), categoria: "anamnese_nova", clienteId: clientId, link: linkDe(req, a.token) });
    res.status(r.status === "aceito" ? 200 : 502).json({ status: r.status, erro: r.erro ?? null });
  } catch (err) {
    res.status(422).json({ status: "recusado", erro: String((err as Error).message ?? err) });
  }
});

export type { Volatilidade };
export default router;
