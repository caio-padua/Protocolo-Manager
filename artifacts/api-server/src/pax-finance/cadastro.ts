import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { z } from "zod";
import { registrarAuditoria } from "./auditoria";
import { FinError } from "./regras";
import { PAPEIS_SOCIETARIOS } from "./schema";
import type { FinContext } from "./tenant";

type Row = Record<string, unknown>;
const dia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "data deve ser AAAA-MM-DD");

export const PerfilInput = z.object({
  regimeDeclarado: z.string().trim().max(60).nullable().optional(),
  opcaoSimples: z.enum(["nao_verificada", "confirmada", "nao_optante"]).optional(),
  fatorRAplicavel: z.boolean().nullable().optional(),
  municipioIss: z.string().trim().max(120).nullable().optional(),
  uf: z.string().trim().length(2).toUpperCase().nullable().optional(),
  capitalSocialCents: z.number().int().nonnegative().nullable().optional(),
  capitalSocialOrigem: z.string().trim().max(200).nullable().optional(),
  observacoes: z.string().trim().max(2000).nullable().optional(),
});
export const SocioInput = z.object({
  nome: z.string().trim().min(2).max(200),
  papel: z.enum(PAPEIS_SOCIETARIOS),
  participacaoBp: z.number().int().min(0).max(10000).nullable().optional(),
  vigenciaInicio: dia.nullable().optional(),
  vigenciaFim: dia.nullable().optional(),
});

/** Empresa por REFERÊNCIA: CNPJ e nome continuam em empresas; aqui só se lê. */
export async function obterEmpresa(ctx: FinContext) {
  const e = (await db.execute(sql`SELECT id, nome, razao_social, cnpj, cnae, regime_tributario, cidade, estado FROM empresas WHERE id = ${ctx.companyId}`)).rows[0] as Row | undefined;
  if (!e) throw new FinError(404, "Empresa nao encontrada");
  const p = (await db.execute(sql`SELECT * FROM fin_company_profile WHERE company_id = ${ctx.companyId}`)).rows[0] as Row | undefined;
  return {
    empresa: { id: Number(e.id), nome: e.nome, razaoSocial: e.razao_social ?? null, cnpj: e.cnpj ?? null, cnae: e.cnae ?? null, regimeCadastro: e.regime_tributario ?? null, cidade: e.cidade ?? null, estado: e.estado ?? null },
    perfil: p ? perfilApi(p) : null,
  };
}
const perfilApi = (p: Row) => ({
  regimeDeclarado: p.regime_declarado ?? null, opcaoSimples: p.opcao_simples, fatorRAplicavel: p.fator_r_aplicavel ?? null,
  municipioIss: p.municipio_iss ?? null, uf: p.uf ? String(p.uf).trim() : null,
  capitalSocialCents: p.capital_social_cents == null ? null : Number(p.capital_social_cents), capitalSocialOrigem: p.capital_social_origem ?? null,
  moeda: p.moeda, statusValidacao: p.status_validacao, validadoPor: p.validated_by ?? null,
  validadoEm: p.validated_at ? new Date(p.validated_at as string).toISOString() : null, observacoes: p.observacoes ?? null,
});

/** Salvar perfil sempre volta o estado para rascunho: alteração exige nova validação humana. */
export async function salvarPerfil(ctx: FinContext, i: z.infer<typeof PerfilInput>) {
  return db.transaction(async (tx) => {
    const r = await tx.execute(sql`INSERT INTO fin_company_profile (company_id, regime_declarado, opcao_simples, fator_r_aplicavel, municipio_iss, uf, capital_social_cents, capital_social_origem, observacoes)
      VALUES (${ctx.companyId}, ${i.regimeDeclarado ?? null}, ${i.opcaoSimples ?? "nao_verificada"}, ${i.fatorRAplicavel ?? null}, ${i.municipioIss ?? null}, ${i.uf ?? null},
        ${i.capitalSocialCents ?? null}, ${i.capitalSocialOrigem ?? null}, ${i.observacoes ?? null})
      ON CONFLICT (company_id) DO UPDATE SET regime_declarado=EXCLUDED.regime_declarado, opcao_simples=EXCLUDED.opcao_simples, fator_r_aplicavel=EXCLUDED.fator_r_aplicavel,
        municipio_iss=EXCLUDED.municipio_iss, uf=EXCLUDED.uf, capital_social_cents=EXCLUDED.capital_social_cents, capital_social_origem=EXCLUDED.capital_social_origem,
        observacoes=EXCLUDED.observacoes, status_validacao='rascunho', validated_by=NULL, validated_at=NULL, updated_at=now() RETURNING *`);
    await registrarAuditoria(tx, ctx, "perfil.salvar", "fin_company_profile", null, { opcaoSimples: i.opcaoSimples ?? "nao_verificada" });
    return perfilApi((r.rows as Row[])[0]);
  });
}

export async function validarPerfil(ctx: FinContext) {
  if (!ctx.actorId) throw new FinError(403, "Validador nao identificado");
  return db.transaction(async (tx) => {
    const r = await tx.execute(sql`UPDATE fin_company_profile SET status_validacao='validado', validated_by=${ctx.actorId}, validated_at=now(), updated_at=now()
      WHERE company_id=${ctx.companyId} RETURNING *`);
    const row = (r.rows as Row[])[0];
    if (!row) throw new FinError(404, "Perfil fiscal ainda nao preenchido");
    await registrarAuditoria(tx, ctx, "perfil.validar", "fin_company_profile", null, {});
    return perfilApi(row);
  });
}

const socioApi = (s: Row) => ({
  id: Number(s.id), nome: s.nome, papel: s.papel, participacaoBp: s.participacao_bp == null ? null : Number(s.participacao_bp),
  vigenciaInicio: s.vigencia_inicio ? String(s.vigencia_inicio).slice(0, 10) : null, vigenciaFim: s.vigencia_fim ? String(s.vigencia_fim).slice(0, 10) : null,
  origem: s.origem, sourceDocumentId: s.source_document_id == null ? null : Number(s.source_document_id), statusValidacao: s.status_validacao,
});

export async function listarSocios(ctx: FinContext) {
  const r = await db.execute(sql`SELECT * FROM fin_partner WHERE company_id=${ctx.companyId} ORDER BY id`);
  return (r.rows as Row[]).map(socioApi);
}
export async function criarSocio(ctx: FinContext, i: z.infer<typeof SocioInput>) {
  return db.transaction(async (tx) => {
    const r = await tx.execute(sql`INSERT INTO fin_partner (company_id, nome, papel, participacao_bp, vigencia_inicio, vigencia_fim)
      VALUES (${ctx.companyId}, ${i.nome}, ${i.papel}, ${i.participacaoBp ?? null}, ${i.vigenciaInicio ?? null}, ${i.vigenciaFim ?? null}) RETURNING *`);
    const row = (r.rows as Row[])[0];
    await registrarAuditoria(tx, ctx, "socio.criar", "fin_partner", Number(row.id), { papel: i.papel });
    return socioApi(row);
  });
}
export async function editarSocio(ctx: FinContext, id: number, i: z.infer<typeof SocioInput>) {
  return db.transaction(async (tx) => {
    const r = await tx.execute(sql`UPDATE fin_partner SET nome=${i.nome}, papel=${i.papel}, participacao_bp=${i.participacaoBp ?? null},
      vigencia_inicio=${i.vigenciaInicio ?? null}, vigencia_fim=${i.vigenciaFim ?? null}, status_validacao='rascunho', validated_by=NULL, validated_at=NULL, updated_at=now()
      WHERE id=${id} AND company_id=${ctx.companyId} RETURNING *`);
    const row = (r.rows as Row[])[0];
    if (!row) throw new FinError(404, "Vinculo nao encontrado");
    await registrarAuditoria(tx, ctx, "socio.editar", "fin_partner", id, {});
    return socioApi(row);
  });
}
export async function validarSocio(ctx: FinContext, id: number) {
  if (!ctx.actorId) throw new FinError(403, "Validador nao identificado");
  return db.transaction(async (tx) => {
    const r = await tx.execute(sql`UPDATE fin_partner SET status_validacao='validado', validated_by=${ctx.actorId}, validated_at=now(), updated_at=now()
      WHERE id=${id} AND company_id=${ctx.companyId} RETURNING *`);
    const row = (r.rows as Row[])[0];
    if (!row) throw new FinError(404, "Vinculo nao encontrado");
    await registrarAuditoria(tx, ctx, "socio.validar", "fin_partner", id, {});
    return socioApi(row);
  });
}
/** Não existe exclusão: o vínculo é encerrado com data de fim e continua no histórico. */
export async function encerrarSocio(ctx: FinContext, id: number, fim: string) {
  return db.transaction(async (tx) => {
    const r = await tx.execute(sql`UPDATE fin_partner SET vigencia_fim=${fim}::date, updated_at=now() WHERE id=${id} AND company_id=${ctx.companyId}
      AND (vigencia_inicio IS NULL OR vigencia_inicio <= ${fim}::date) RETURNING *`);
    const row = (r.rows as Row[])[0];
    if (!row) throw new FinError(404, "Vinculo nao encontrado ou data de fim anterior ao inicio");
    await registrarAuditoria(tx, ctx, "socio.encerrar", "fin_partner", id, { fim });
    return socioApi(row);
  });
}

export async function listarAuditoria(ctx: FinContext, limite = 100) {
  const r = await db.execute(sql`SELECT id, actor_id, action, entity, entity_id, detail, created_at FROM fin_audit_log WHERE company_id=${ctx.companyId} ORDER BY id DESC LIMIT ${Math.min(limite, 500)}`);
  return (r.rows as Row[]).map((a) => ({ id: Number(a.id), actorId: a.actor_id ?? null, action: a.action, entity: a.entity, entityId: a.entity_id == null ? null : Number(a.entity_id), detail: a.detail, criadoEm: new Date(a.created_at as string).toISOString() }));
}
