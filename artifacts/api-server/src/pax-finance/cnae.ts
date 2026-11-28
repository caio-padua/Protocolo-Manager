import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { FinError } from "./regras";
import type { FinContext } from "./tenant";
import { registrarAuditoria } from "./auditoria";
import { ensurePaxFinanceSchema } from "./schema";
import { CNAE_IBGE } from "./cnae-ibge-dados";

type Row = Record<string, unknown>;
export const RE_CNAE = /^\d{2}\.\d{2}-\d-\d{2}$/;
const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Cadastro global de CNAE: semeia (idempotente) o catalogo oficial IBGE; linhas ja existentes (inclusive acrescentadas a mao) nunca sao alteradas. */
let semeado: Promise<void> | null = null;
export async function garantirCatalogoCnae(): Promise<void> {
  if (!semeado) {
    semeado = (async () => {
      await ensurePaxFinanceSchema();
      const n = Number(((await db.execute(sql`SELECT count(*)::int c FROM fin_cnae_catalogo WHERE origem='ibge'`)).rows[0] as Row).c);
      if (n >= CNAE_IBGE.length) return;
      for (let i = 0; i < CNAE_IBGE.length; i += 300) {
        const f = CNAE_IBGE.slice(i, i + 300);
        const js = JSON.stringify(f.map((r) => ({ c: r[0], d: r[1], v: r[2], a: r[3], b: norm(`${r[0]} ${r[0].replace(/\D/g, "")} ${r[1]}`) })));
        await db.execute(sql`INSERT INTO fin_cnae_catalogo (codigo, descricao, divisao, area_saude, busca, origem)
          SELECT c, d, v, a, b, 'ibge' FROM jsonb_to_recordset(${js}::jsonb) AS t(c text, d text, v text, a text, b text)
          ON CONFLICT (codigo) DO NOTHING`);
      }
    })().catch((e) => { semeado = null; throw e; });
  }
  return semeado;
}

export interface CnaeItem { codigo: string; descricao: string; divisao: string | null; areaSaude: string | null }
const item = (r: Row): CnaeItem => ({ codigo: String(r.codigo), descricao: String(r.descricao), divisao: (r.divisao as string) ?? null, areaSaude: (r.area_saude as string) ?? null });

/** Autocompletar: por codigo (com ou sem pontuacao) ou palavras da descricao. Saude primeiro; `todas` inclui as demais atividades. */
export async function buscarCnae(q: string, todas: boolean, limite = 25): Promise<CnaeItem[]> {
  await garantirCatalogoCnae();
  const termos = norm(q).split(" ").filter(Boolean).slice(0, 6);
  const lim = Math.min(Math.max(limite, 1), 60);
  const cond = termos.length ? sql.join(termos.map((t) => sql`busca LIKE ${"%" + t + "%"}`), sql` AND `) : sql`TRUE`;
  const filtro = todas ? sql`TRUE` : sql`area_saude IS NOT NULL`;
  const r = await db.execute(sql`SELECT codigo, descricao, divisao, area_saude FROM fin_cnae_catalogo WHERE ${filtro} AND ${cond}
    ORDER BY (area_saude IS NULL), area_saude, codigo LIMIT ${lim}`);
  return (r.rows as Row[]).map(item);
}

async function descricoes(codigos: string[]): Promise<Map<string, CnaeItem>> {
  if (!codigos.length) return new Map();
  const r = await db.execute(sql`SELECT codigo, descricao, divisao, area_saude FROM fin_cnae_catalogo WHERE codigo IN (${sql.join(codigos.map((c) => sql`${c}`), sql`, `)})`);
  return new Map((r.rows as Row[]).map((x) => [String(x.codigo), item(x)]));
}

export async function lerCnaeEmpresa(ctx: FinContext) {
  await garantirCatalogoCnae();
  const e = (await db.execute(sql`SELECT cnae, cnae_descricao, cnaes_secundarios FROM empresas WHERE id=${ctx.companyId}`)).rows[0] as Row | undefined;
  if (!e) throw new FinError(404, "Empresa nao encontrada");
  const sec = Array.isArray(e.cnaes_secundarios) ? (e.cnaes_secundarios as unknown[]).map((x) => String(x).split(" - ")[0].trim()) : [];
  const m = await descricoes([...(e.cnae ? [String(e.cnae)] : []), ...sec]);
  const mk = (c: string) => ({ codigo: c, descricao: m.get(c)?.descricao ?? null, areaSaude: m.get(c)?.areaSaude ?? null });
  return { principal: e.cnae ? { ...mk(String(e.cnae)), descricao: m.get(String(e.cnae))?.descricao ?? (e.cnae_descricao ? String(e.cnae_descricao) : null) } : null, secundarios: sec.map(mk) };
}

export async function salvarCnaeEmpresa(ctx: FinContext, principal: string | null, secundariosIn: string[]) {
  await garantirCatalogoCnae();
  const sec = [...new Set(secundariosIn.map((x) => x.trim()))].filter((x) => x && x !== principal);
  for (const c of [...(principal ? [principal] : []), ...sec]) if (!RE_CNAE.test(c)) throw new FinError(400, `CNAE invalido: ${c}. Use o formato 00.00-0-00.`);
  if (sec.length > 100) throw new FinError(400, "Limite de 100 atividades secundarias.");
  const m = await descricoes([...(principal ? [principal] : []), ...sec]);
  const fora = [...(principal ? [principal] : []), ...sec].filter((c) => !m.has(c));
  if (fora.length) throw new FinError(422, `CNAE fora do cadastro oficial: ${fora.join(", ")}. Escolha pela busca.`);
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${ctx.companyId}, hashtext('cnae-empresa'))`);
    const ant = (await tx.execute(sql`SELECT cnae, cnae_descricao, cnaes_secundarios FROM empresas WHERE id=${ctx.companyId}`)).rows[0] as Row | undefined;
    if (!ant) throw new FinError(404, "Empresa nao encontrada");
    const pDesc = principal ? m.get(principal)!.descricao : null;
    await tx.execute(sql`UPDATE empresas SET cnae=${principal}, cnae_descricao=${pDesc}, cnaes_secundarios=${JSON.stringify(sec)}::jsonb WHERE id=${ctx.companyId}`);
    const full = sec.map((c) => `${c} - ${m.get(c)!.descricao}`);
    await tx.execute(sql`UPDATE fin_entity SET cnae_principal=${principal}, cnae_principal_descricao=${pDesc}, cnaes_secundarios=${JSON.stringify(full)}::jsonb,
      status_validacao='rascunho', validated_by=NULL, validated_at=NULL, updated_at=now() WHERE company_id=${ctx.companyId}`);
    await tx.execute(sql`INSERT INTO fin_company_registry (company_id, dados, sensiveis, origem, updated_by)
      VALUES (${ctx.companyId}, ${JSON.stringify({ cnaePrincipal: principal ? `${principal} - ${pDesc}` : "", cnaesSecundarios: full })}::jsonb, '{}'::jsonb, ${JSON.stringify({ cnaePrincipal: "manual", cnaesSecundarios: "manual" })}::jsonb, ${ctx.actorId})
      ON CONFLICT (company_id) DO UPDATE SET dados = fin_company_registry.dados || ${JSON.stringify({ cnaePrincipal: principal ? `${principal} - ${pDesc}` : "", cnaesSecundarios: full })}::jsonb,
        origem = fin_company_registry.origem || ${JSON.stringify({ cnaePrincipal: "manual", cnaesSecundarios: "manual" })}::jsonb, updated_by=EXCLUDED.updated_by, updated_at=now()`);
    await registrarAuditoria(tx, ctx, "cnae.salvar", "empresas", ctx.companyId, { anterior: { principal: ant.cnae ?? null, secundarios: ant.cnaes_secundarios ?? null }, novo: { principal, secundarios: sec } });
    return { ok: true, principal, secundarios: sec.length };
  });
}
