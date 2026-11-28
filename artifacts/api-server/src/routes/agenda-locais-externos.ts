import { Router, type IRouter } from "express";
import { sql } from "drizzle-orm";
import { z } from "zod/v4";
import { db } from "@workspace/db";
import { moduleGuard } from "../middleware/moduleGuard";
import { mayManageAgendaEmpresa } from "../lib/agenda-governance";
import { enderecoExternoSchema, normalizarEnderecoExterno } from "../lib/agenda-endereco-externo.js";
import { dadosDaLinha, normalizarDados, CAMPOS_LOCAL } from "../lib/locais-externos-campos.js";

/**
 * Locais externos da clínica: consultórios sublocados em outro endereço, cadastrados DENTRO do cadastro da empresa
 * (aba "Locais Externos"), com os mesmos campos da empresa (CNPJ próprio fictício na homologação), sem ligação com
 * nenhuma outra tabela. A empresa vem da sessão; o proprietário da plataforma pode indicar outra por ?empresaId=.
 * Ativar/desativar é um interruptor reversível (PATCH). Excluir só o CEO (proprietário da plataforma), com o local
 * já desativado e o nome digitado; mesmo assim a linha só é carimbada (excluido_em), nunca apagada (Regra de Ouro).
 * A agenda EXTERNA continua guardando o próprio endereço; este cadastro só alimenta a escolha.
 */
const router: IRouter = Router();

const corpoSchema = z.object({
  nome: z.string().trim().min(1, "Informe o nome do local externo.").max(160),
  observacao: z.string().trim().max(400).nullable().optional(),
  endereco: enderecoExternoSchema.partial({ complemento: true }),
  dados: z.record(z.string(), z.unknown()).optional(),
});

function mapear(r: Record<string, unknown>) {
  return {
    id: Number(r.id), empresaId: Number(r.empresa_id), nome: String(r.nome), observacao: (r.observacao as string | null) ?? null,
    active: r.active === true,
    endereco: {
      cep: String(r.cep), logradouro: String(r.logradouro), numero: String(r.numero), complemento: (r.complemento as string | null) ?? null,
      bairro: String(r.bairro), cidade: String(r.cidade), uf: String(r.uf),
    },
    dados: dadosDaLinha(r),
  };
}

const semTabela = (e: unknown) => (e as { code?: string; cause?: { code?: string } })?.code === "42P01"
  || (e as { cause?: { code?: string } })?.cause?.code === "42P01";
const PENDENTE = "estrutura_pendente: aplique as migrações 20261116_locais_externos, 20261117_locais_externos_cadastro e 20261118_locais_externos_exclusao.";

router.use("/agenda/locais-externos", moduleGuard("agenda"));

/** Empresa-alvo: a da sessão; outra só para o proprietário da plataforma. */
function empresaAlvo(req: Parameters<typeof mayManageAgendaEmpresa>[0], res: import("express").Response): number | null {
  const ctx = req.tenantContext;
  if (!ctx?.authenticated || !ctx.empresaId) { res.status(401).json({ error: "Entre com seu acesso profissional." }); return null; }
  const pedido = req.query.empresaId;
  if (pedido === undefined) return ctx.empresaId;
  const alvo = Number.parseInt(String(pedido), 10);
  if (!Number.isInteger(alvo) || alvo <= 0) { res.status(400).json({ error: "empresaId inválido." }); return null; }
  if (alvo !== ctx.empresaId && !ctx.isPlatformOwner) { res.status(403).json({ error: "Seu acesso não alcança esta empresa." }); return null; }
  return alvo;
}

async function podeGerirEmpresa(req: Parameters<typeof mayManageAgendaEmpresa>[0], alvo: number): Promise<boolean> {
  const ctx = req.tenantContext;
  if (ctx.isPlatformOwner) return true;
  return alvo === ctx.empresaId && (await mayManageAgendaEmpresa(req));
}

router.get("/agenda/locais-externos", async (req, res): Promise<void> => {
  const empresaId = empresaAlvo(req, res);
  if (empresaId == null) return;
  try {
    // A agenda lê só os ativos; a aba do cadastro pede todos (?todos=1) para poder reativar. Excluídos nunca aparecem.
    const todos = req.query.todos === "1";
    const r = await db.execute(sql`SELECT * FROM locais_externos WHERE empresa_id=${empresaId} AND excluido_em IS NULL
      AND (${todos}::boolean OR active=true) ORDER BY nome, id`);
    res.json({ locais: r.rows.map(mapear), podeGerir: await podeGerirEmpresa(req, empresaId), podeExcluir: req.tenantContext.isPlatformOwner === true });
  } catch (e) {
    if (semTabela(e)) { res.status(503).json({ error: PENDENTE }); return; }
    throw e;
  }
});

async function exigirGestao(req: Parameters<typeof mayManageAgendaEmpresa>[0], res: import("express").Response): Promise<number | null> {
  const empresaId = empresaAlvo(req, res);
  if (empresaId == null) return null;
  if (!(await podeGerirEmpresa(req, empresaId))) { res.status(403).json({ error: "Seu acesso não administra o cadastro desta empresa." }); return null; }
  return empresaId;
}

/** Colunas extras (campos da empresa) como fragmentos "coluna = valor" com o tipo certo. */
function atribuicoes(valores: Record<string, string | number | boolean | null>) {
  return CAMPOS_LOCAL.filter((c) => c.col in valores).map((c) => {
    const v = valores[c.col];
    const cast = c.tipo === "date" ? sql`::date` : c.tipo === "money" ? sql`::numeric` : c.tipo === "int" ? sql`::integer` : c.tipo === "bool" ? sql`::boolean` : sql`::text`;
    return { col: c.col, valor: sql`${v}${cast}` };
  });
}

router.post("/agenda/locais-externos", async (req, res): Promise<void> => {
  const empresaId = await exigirGestao(req, res);
  if (empresaId == null) return;
  const corpo = corpoSchema.safeParse(req.body);
  if (!corpo.success) { res.status(400).json({ error: corpo.error.issues[0]?.message ?? "Dados inválidos." }); return; }
  const end = normalizarEnderecoExterno(corpo.data.endereco);
  if (!end.ok) { res.status(400).json({ error: end.error }); return; }
  const dados = normalizarDados(corpo.data.dados);
  if (!dados.ok) { res.status(400).json({ error: dados.error }); return; }
  const e = end.endereco;
  const extras = atribuicoes(dados.valores);
  try {
    const colunas = sql.join([sql`empresa_id`, sql`nome`, sql`cep`, sql`logradouro`, sql`numero`, sql`complemento`, sql`bairro`, sql`cidade`, sql`uf`, sql`observacao`,
      ...extras.map((x) => sql.identifier(x.col))], sql`, `);
    const valores = sql.join([sql`${empresaId}`, sql`${corpo.data.nome}`, sql`${e.cep}`, sql`${e.logradouro}`, sql`${e.numero}`, sql`${e.complemento ?? null}`,
      sql`${e.bairro}`, sql`${e.cidade}`, sql`${e.uf}`, sql`${corpo.data.observacao ?? null}`, ...extras.map((x) => x.valor)], sql`, `);
    const r = await db.execute(sql`INSERT INTO locais_externos (${colunas}) VALUES (${valores}) RETURNING *`);
    res.status(201).json(mapear(r.rows[0]));
  } catch (err) {
    if (semTabela(err)) { res.status(503).json({ error: PENDENTE }); return; }
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
  const dados = normalizarDados(corpo.data.dados);
  if (!dados.ok) { res.status(400).json({ error: dados.error }); return; }
  const e = end.endereco;
  const extras = atribuicoes(dados.valores).map((x) => sql`${sql.identifier(x.col)} = ${x.valor}`);
  const sets = sql.join([sql`nome=${corpo.data.nome}`, sql`cep=${e.cep}`, sql`logradouro=${e.logradouro}`, sql`numero=${e.numero}`,
    sql`complemento=${e.complemento ?? null}`, sql`bairro=${e.bairro}`, sql`cidade=${e.cidade}`, sql`uf=${e.uf}`,
    sql`observacao=${corpo.data.observacao ?? null}`, sql`active=COALESCE(${corpo.data.active ?? null}::boolean, active)`, sql`updated_at=now()`, ...extras], sql`, `);
  const r = await db.execute(sql`UPDATE locais_externos SET ${sets} WHERE id=${id} AND empresa_id=${empresaId} AND excluido_em IS NULL RETURNING *`);
  if (!r.rows.length) { res.status(404).json({ error: "Local externo não encontrado." }); return; }
  res.json(mapear(r.rows[0]));
});

// Interruptor ativar/desativar: reversível, sem confirmação. Desativado some da escolha da agenda, mas continua na aba.
router.patch("/agenda/locais-externos/:id/ativo", async (req, res): Promise<void> => {
  const empresaId = await exigirGestao(req, res);
  if (empresaId == null) return;
  const id = parseInt(String(req.params.id), 10);
  if (Number.isNaN(id)) { res.status(400).json({ error: "id inválido" }); return; }
  if (typeof req.body?.ativo !== "boolean") { res.status(400).json({ error: "Informe ativo: true ou false." }); return; }
  const r = await db.execute(sql`UPDATE locais_externos SET active=${req.body.ativo}::boolean, updated_at=now()
    WHERE id=${id} AND empresa_id=${empresaId} AND excluido_em IS NULL RETURNING *`);
  if (!r.rows.length) { res.status(404).json({ error: "Local externo não encontrado." }); return; }
  res.json(mapear(r.rows[0]));
});

// Excluir: só o CEO, local já desativado e nome digitado igual. A linha é carimbada, nunca apagada.
router.delete("/agenda/locais-externos/:id", async (req, res): Promise<void> => {
  const empresaId = await exigirGestao(req, res);
  if (empresaId == null) return;
  if (req.tenantContext.isPlatformOwner !== true) { res.status(403).json({ error: "Excluir um local externo exige a confirmação do CEO." }); return; }
  const id = parseInt(String(req.params.id), 10);
  if (Number.isNaN(id)) { res.status(400).json({ error: "id inválido" }); return; }
  const atual = await db.execute(sql`SELECT nome, active FROM locais_externos WHERE id=${id} AND empresa_id=${empresaId} AND excluido_em IS NULL`);
  const linha = atual.rows[0] as { nome: string; active: boolean } | undefined;
  if (!linha) { res.status(404).json({ error: "Local externo não encontrado." }); return; }
  if (linha.active) { res.status(409).json({ error: "Desative o local antes de excluir." }); return; }
  if (typeof req.body?.confirmacao !== "string" || req.body.confirmacao !== linha.nome) {
    res.status(400).json({ error: "Digite o nome exato do local para confirmar a exclusão." }); return;
  }
  await db.execute(sql`UPDATE locais_externos SET excluido_em=now(), excluido_por=${req.tenantContext.professionalId}::integer, updated_at=now()
    WHERE id=${id} AND empresa_id=${empresaId}`);
  res.json({ ok: true });
});

export default router;
