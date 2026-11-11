import { Router, type IRouter } from "express";
import { sql } from "drizzle-orm";
import { z } from "zod/v4";
import { db } from "@workspace/db";
import { moduleGuard } from "../middleware/moduleGuard";
import { mayManageAgendaEmpresa } from "../lib/agenda-governance";
import { enderecoExternoSchema, normalizarEnderecoExterno } from "../lib/agenda-endereco-externo.js";

/**
 * Locais externos da clínica: consultórios sublocados em outro endereço, do MESMO CNPJ da empresa.
 * A empresa vem sempre da sessão (nunca do corpo). Inativar não apaga (Regra de Ouro).
 * A agenda EXTERNA continua guardando o próprio endereço; este cadastro só alimenta a escolha.
 */
const router: IRouter = Router();

const corpoSchema = z.object({
  nome: z.string().trim().min(1, "Informe o nome do local externo.").max(160),
  observacao: z.string().trim().max(400).nullable().optional(),
  endereco: enderecoExternoSchema.partial({ complemento: true }),
});

const COLUNAS = sql`id, empresa_id, nome, cep, logradouro, numero, complemento, bairro, cidade, uf, observacao, active`;

function mapear(r: Record<string, unknown>) {
  return {
    id: Number(r.id), nome: String(r.nome), observacao: (r.observacao as string | null) ?? null, active: r.active === true,
    endereco: {
      cep: String(r.cep), logradouro: String(r.logradouro), numero: String(r.numero), complemento: (r.complemento as string | null) ?? null,
      bairro: String(r.bairro), cidade: String(r.cidade), uf: String(r.uf),
    },
  };
}

const semTabela = (e: unknown) => (e as { code?: string; cause?: { code?: string } })?.code === "42P01"
  || (e as { cause?: { code?: string } })?.cause?.code === "42P01";

router.use("/agenda/locais-externos", moduleGuard("agenda"));

router.get("/agenda/locais-externos", async (req, res): Promise<void> => {
  const ctx = req.tenantContext;
  if (!ctx?.authenticated || !ctx.empresaId) { res.status(401).json({ error: "Entre com seu acesso profissional." }); return; }
  try {
    const r = await db.execute(sql`SELECT ${COLUNAS} FROM locais_externos
      WHERE empresa_id=${ctx.empresaId} AND active=true ORDER BY nome, id`);
    res.json({ locais: r.rows.map(mapear), podeGerir: await mayManageAgendaEmpresa(req) });
  } catch (e) {
    if (semTabela(e)) { res.status(503).json({ error: "estrutura_pendente: aplique a migração 20261116_locais_externos." }); return; }
    throw e;
  }
});

async function exigirGestao(req: Parameters<typeof mayManageAgendaEmpresa>[0], res: import("express").Response): Promise<number | null> {
  const ctx = req.tenantContext;
  if (!ctx?.authenticated || !ctx.empresaId) { res.status(401).json({ error: "Entre com seu acesso profissional." }); return null; }
  if (!(await mayManageAgendaEmpresa(req))) { res.status(403).json({ error: "Seu acesso não administra as agendas desta clínica." }); return null; }
  return ctx.empresaId;
}

router.post("/agenda/locais-externos", async (req, res): Promise<void> => {
  const empresaId = await exigirGestao(req, res);
  if (empresaId == null) return;
  const corpo = corpoSchema.safeParse(req.body);
  if (!corpo.success) { res.status(400).json({ error: corpo.error.issues[0]?.message ?? "Dados inválidos." }); return; }
  const end = normalizarEnderecoExterno(corpo.data.endereco);
  if (!end.ok) { res.status(400).json({ error: end.error }); return; }
  const e = end.endereco;
  try {
    const r = await db.execute(sql`INSERT INTO locais_externos
      (empresa_id, nome, cep, logradouro, numero, complemento, bairro, cidade, uf, observacao)
      VALUES (${empresaId}, ${corpo.data.nome}, ${e.cep}, ${e.logradouro}, ${e.numero}, ${e.complemento ?? null},
              ${e.bairro}, ${e.cidade}, ${e.uf}, ${corpo.data.observacao ?? null})
      RETURNING ${COLUNAS}`);
    res.status(201).json(mapear(r.rows[0]));
  } catch (err) {
    if (semTabela(err)) { res.status(503).json({ error: "estrutura_pendente: aplique a migração 20261116_locais_externos." }); return; }
    throw err;
  }
});

router.put("/agenda/locais-externos/:id", async (req, res): Promise<void> => {
  const empresaId = await exigirGestao(req, res);
  if (empresaId == null) return;
  const id = parseInt(String(req.params.id), 10);
  if (Number.isNaN(id)) { res.status(400).json({ error: "id inválido" }); return; }
  const corpo = corpoSchema.extend({ active: z.boolean().optional() }).safeParse(req.body);
  if (!corpo.success) { res.status(400).json({ error: corpo.error.issues[0]?.message ?? "Dados inválidos." }); return; }
  const end = normalizarEnderecoExterno(corpo.data.endereco);
  if (!end.ok) { res.status(400).json({ error: end.error }); return; }
  const e = end.endereco;
  const r = await db.execute(sql`UPDATE locais_externos SET nome=${corpo.data.nome}, cep=${e.cep}, logradouro=${e.logradouro},
      numero=${e.numero}, complemento=${e.complemento ?? null}, bairro=${e.bairro}, cidade=${e.cidade}, uf=${e.uf},
      observacao=${corpo.data.observacao ?? null}, active=COALESCE(${corpo.data.active ?? null}::boolean, active), updated_at=now()
    WHERE id=${id} AND empresa_id=${empresaId} RETURNING ${COLUNAS}`);
  if (!r.rows.length) { res.status(404).json({ error: "Local externo não encontrado." }); return; }
  res.json(mapear(r.rows[0]));
});

// Inativa (nunca apaga). As agendas que já copiaram o endereço continuam com o endereço delas.
router.delete("/agenda/locais-externos/:id", async (req, res): Promise<void> => {
  const empresaId = await exigirGestao(req, res);
  if (empresaId == null) return;
  const id = parseInt(String(req.params.id), 10);
  if (Number.isNaN(id)) { res.status(400).json({ error: "id inválido" }); return; }
  const r = await db.execute(sql`UPDATE locais_externos SET active=false, updated_at=now()
    WHERE id=${id} AND empresa_id=${empresaId} RETURNING id`);
  if (!r.rows.length) { res.status(404).json({ error: "Local externo não encontrado." }); return; }
  res.json({ ok: true });
});

export default router;
