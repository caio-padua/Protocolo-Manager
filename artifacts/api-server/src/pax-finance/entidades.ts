import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { z } from "zod";
import { registrarAuditoria } from "./auditoria";
import { FinError } from "./regras";
import { CNAES_SECUNDARIOS, PADUMANN } from "./padumann-rascunho";
import { PAPEIS_SOCIETARIOS } from "./schema";
import type { FinContext } from "./tenant";

type Row = Record<string, unknown>;
const so = (c: string) => c.replace(/\D/g, "");

/** Digitos verificadores do CNPJ (modulo 11). */
export function cnpjValido(c: string): boolean {
  const d = so(c);
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
  const dv = (n: number) => { const w = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]; const s = w.reduce((a, x, i) => a + x * Number(d[i]), 0) % 11; return s < 2 ? 0 : 11 - s; };
  return dv(12) === Number(d[12]) && dv(13) === Number(d[13]);
}
const fmtCnpj = (c: string) => { const d = so(c); return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`; };

export const EntidadeInput = z.object({
  cnpj: z.string().trim().refine(cnpjValido, "CNPJ invalido (digitos verificadores)"),
  razaoSocial: z.string().trim().min(3).max(200),
  nomeFantasia: z.string().trim().max(200).nullable().optional(),
  dataConstituicao: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  naturezaJuridica: z.string().trim().max(200).nullable().optional(),
  porte: z.string().trim().max(120).nullable().optional(),
  capitalSocialCents: z.number().int().nonnegative().nullable().optional(),
  cnaePrincipal: z.string().trim().max(20).nullable().optional(),
  regimeEfetivo: z.string().trim().max(60).nullable().optional(),
  opcaoSimples: z.enum(["nao_verificada", "confirmada", "nao_optante"]).optional(),
  inscricaoMunicipal: z.string().trim().max(40).nullable().optional(),
  inscricaoEstadual: z.string().trim().max(40).nullable().optional(),
});
export const PessoaInput = z.object({
  nome: z.string().trim().min(2).max(200),
  papel: z.enum(PAPEIS_SOCIETARIOS),
  participacaoBp: z.number().int().min(0).max(10000).nullable().optional(),
  registroProfissional: z.string().trim().max(60).nullable().optional(),
});

const entApi = (e: Row) => ({
  id: Number(e.id), cnpj: e.cnpj, cnpjValido: cnpjValido(String(e.cnpj)), razaoSocial: e.razao_social, nomeFantasia: e.nome_fantasia ?? null, nomeFantasiaPreferencial: e.nome_fantasia_preferencial ?? null, aliases: (e.aliases as string[]) ?? [],
  dataConstituicao: e.data_constituicao ? String(e.data_constituicao).slice(0, 10) : null, naturezaJuridica: e.natureza_juridica ?? null, porte: e.porte ?? null,
  capitalSocialCents: e.capital_social_cents == null ? null : Number(e.capital_social_cents), capitalIntegralizado: e.capital_integralizado ?? null,
  sede: e.sede ?? {}, cnaePrincipal: e.cnae_principal ?? null, cnaePrincipalDescricao: e.cnae_principal_descricao ?? null, cnaesSecundarios: (e.cnaes_secundarios as string[]) ?? [],
  regimeEfetivo: e.regime_efetivo ?? null, opcaoSimples: e.opcao_simples, inscricaoMunicipal: e.inscricao_municipal ?? null, inscricaoEstadual: e.inscricao_estadual ?? null,
  origemCampos: e.origem_campos ?? {}, statusValidacao: e.status_validacao, validadoEm: e.validated_at ? new Date(e.validated_at as string).toISOString() : null,
});
const pesApi = (p: Row) => ({
  id: Number(p.id), entidadeId: Number(p.entity_id), nome: p.nome, papel: p.papel, participacaoBp: p.participacao_bp == null ? null : Number(p.participacao_bp),
  registroProfissional: p.registro_profissional ?? null, origemDoc: p.origem_doc ?? {}, statusValidacao: p.status_validacao,
});

export async function listarEntidades(ctx: FinContext) {
  const e = (await db.execute(sql`SELECT * FROM fin_entity WHERE company_id=${ctx.companyId} ORDER BY id`)).rows as Row[];
  const p = (await db.execute(sql`SELECT * FROM fin_partner WHERE company_id=${ctx.companyId} AND entity_id IS NOT NULL ORDER BY id`)).rows as Row[];
  return e.map((x) => ({ ...entApi(x), pessoas: p.filter((y) => Number(y.entity_id) === Number(x.id)).map(pesApi) }));
}

export async function criarEntidade(ctx: FinContext, i: z.infer<typeof EntidadeInput>) {
  return db.transaction(async (tx) => {
    const cnpj = fmtCnpj(i.cnpj);
    const dup = (await tx.execute(sql`SELECT 1 FROM fin_entity WHERE company_id=${ctx.companyId} AND cnpj=${cnpj}`)).rows[0];
    if (dup) throw new FinError(409, "Este CNPJ ja esta cadastrado nesta empresa");
    const r = await tx.execute(sql`INSERT INTO fin_entity (company_id, cnpj, razao_social, nome_fantasia, data_constituicao, natureza_juridica, porte, capital_social_cents,
      cnae_principal, regime_efetivo, opcao_simples, inscricao_municipal, inscricao_estadual)
      VALUES (${ctx.companyId}, ${cnpj}, ${i.razaoSocial}, ${i.nomeFantasia ?? null}, ${i.dataConstituicao ?? null}, ${i.naturezaJuridica ?? null}, ${i.porte ?? null},
      ${i.capitalSocialCents ?? null}, ${i.cnaePrincipal ?? null}, ${i.regimeEfetivo ?? null}, ${i.opcaoSimples ?? "nao_verificada"}, ${i.inscricaoMunicipal ?? null}, ${i.inscricaoEstadual ?? null}) RETURNING *`);
    const row = (r.rows as Row[])[0];
    await registrarAuditoria(tx, ctx, "entidade.criar", "fin_entity", Number(row.id), { cnpj });
    return entApi(row);
  });
}

/** Editar sempre devolve o cadastro a rascunho: alteracao exige nova conferencia humana. */
export async function editarEntidade(ctx: FinContext, id: number, i: z.infer<typeof EntidadeInput>) {
  return db.transaction(async (tx) => {
    const r = await tx.execute(sql`UPDATE fin_entity SET cnpj=${fmtCnpj(i.cnpj)}, razao_social=${i.razaoSocial}, nome_fantasia=${i.nomeFantasia ?? null},
      data_constituicao=${i.dataConstituicao ?? null}, natureza_juridica=${i.naturezaJuridica ?? null}, porte=${i.porte ?? null}, capital_social_cents=${i.capitalSocialCents ?? null},
      cnae_principal=${i.cnaePrincipal ?? null}, regime_efetivo=${i.regimeEfetivo ?? null}, opcao_simples=${i.opcaoSimples ?? "nao_verificada"},
      inscricao_municipal=${i.inscricaoMunicipal ?? null}, inscricao_estadual=${i.inscricaoEstadual ?? null},
      status_validacao='rascunho', validated_by=NULL, validated_at=NULL, updated_at=now() WHERE id=${id} AND company_id=${ctx.companyId} RETURNING *`);
    const row = (r.rows as Row[])[0];
    if (!row) throw new FinError(404, "Cadastro nao encontrado");
    await registrarAuditoria(tx, ctx, "entidade.editar", "fin_entity", id, {});
    return entApi(row);
  });
}

export async function validarEntidade(ctx: FinContext, id: number) {
  if (!ctx.actorId) throw new FinError(403, "Validador nao identificado");
  return db.transaction(async (tx) => {
    const r = await tx.execute(sql`UPDATE fin_entity SET status_validacao='validado', validated_by=${ctx.actorId}, validated_at=now(), updated_at=now()
      WHERE id=${id} AND company_id=${ctx.companyId} RETURNING *`);
    const row = (r.rows as Row[])[0];
    if (!row) throw new FinError(404, "Cadastro nao encontrado");
    await tx.execute(sql`UPDATE fin_partner SET status_validacao='validado', validated_by=${ctx.actorId}, validated_at=now() WHERE entity_id=${id} AND company_id=${ctx.companyId}`);
    await registrarAuditoria(tx, ctx, "entidade.validar", "fin_entity", id, {});
    return entApi(row);
  });
}

export async function adicionarPessoa(ctx: FinContext, entidadeId: number, i: z.infer<typeof PessoaInput>) {
  return db.transaction(async (tx) => {
    const ok = (await tx.execute(sql`SELECT 1 FROM fin_entity WHERE id=${entidadeId} AND company_id=${ctx.companyId}`)).rows[0];
    if (!ok) throw new FinError(404, "Cadastro nao encontrado");
    const r = await tx.execute(sql`INSERT INTO fin_partner (company_id, entity_id, nome, papel, participacao_bp, registro_profissional)
      VALUES (${ctx.companyId}, ${entidadeId}, ${i.nome}, ${i.papel}, ${i.participacaoBp ?? null}, ${i.registroProfissional ?? null}) RETURNING *`);
    const row = (r.rows as Row[])[0];
    await tx.execute(sql`UPDATE fin_entity SET status_validacao='rascunho', validated_by=NULL, validated_at=NULL WHERE id=${entidadeId} AND company_id=${ctx.companyId}`);
    await registrarAuditoria(tx, ctx, "entidade.pessoa_adicionar", "fin_partner", Number(row.id), { papel: i.papel });
    return pesApi(row);
  });
}

/** Carrega o rascunho documental da PADUMANN neste tenant. Idempotente: nao duplica nem sobrescreve edicao humana. */
export async function carregarRascunhoPadumann(ctx: FinContext) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${ctx.companyId}, hashtext('padumann-rascunho'))`);
    const emp = (await tx.execute(sql`SELECT cnpj FROM empresas WHERE id=${ctx.companyId}`)).rows[0] as Row | undefined;
    if (so(String(emp?.cnpj ?? "")) !== so(PADUMANN.cnpj)) throw new FinError(409, "O cadastro da PADUMANN so pode ser carregado na propria empresa PADUMANN (selecione-a no seletor).");
    const ja = (await tx.execute(sql`SELECT id FROM fin_entity WHERE company_id=${ctx.companyId} AND cnpj=${PADUMANN.cnpj}`)).rows[0] as Row | undefined;
    if (ja) return { criado: false, id: Number(ja.id) };
    const r = await tx.execute(sql`INSERT INTO fin_entity (company_id, cnpj, razao_social, data_constituicao, natureza_juridica, porte, capital_social_cents, capital_integralizado,
      sede, cnae_principal, cnae_principal_descricao, cnaes_secundarios, origem_campos, nome_fantasia, nome_fantasia_preferencial, aliases)
      VALUES (${ctx.companyId}, ${PADUMANN.cnpj}, ${PADUMANN.razaoSocial}, ${PADUMANN.dataConstituicao}, ${PADUMANN.naturezaJuridica}, ${PADUMANN.porte},
      ${PADUMANN.capitalSocialCents}, ${PADUMANN.capitalIntegralizado}, ${JSON.stringify(PADUMANN.sede)}::jsonb, ${PADUMANN.cnaePrincipal}, ${PADUMANN.cnaePrincipalDescricao},
      ${JSON.stringify(CNAES_SECUNDARIOS)}::jsonb, ${JSON.stringify(PADUMANN.origemCampos)}::jsonb, ${PADUMANN.nomeFantasia}, ${PADUMANN.nomeFantasia}, ${JSON.stringify(PADUMANN.aliases)}::jsonb) RETURNING id`);
    const id = Number((r.rows as Row[])[0].id);
    for (const p of PADUMANN.pessoas) {
      await tx.execute(sql`INSERT INTO fin_partner (company_id, entity_id, nome, papel, participacao_bp, registro_profissional, origem, origem_doc)
        VALUES (${ctx.companyId}, ${id}, ${p.nome}, ${p.papel}, ${p.participacaoBp}, ${p.registro}, 'documento', ${JSON.stringify({ documentos: p.origem })}::jsonb)`);
    }
    await registrarAuditoria(tx, ctx, "entidade.rascunho_documental", "fin_entity", id, { cnpj: PADUMANN.cnpj, pessoas: PADUMANN.pessoas.length, secundarios: CNAES_SECUNDARIOS.length });
    return { criado: true, id };
  });
}
