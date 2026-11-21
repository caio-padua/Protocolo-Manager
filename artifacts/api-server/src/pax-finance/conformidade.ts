import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { registrarAuditoria } from "./auditoria";
import { avaliarConformidade, type ParteIn, type ParteReg } from "./conformidade-calc";
import { FinError } from "./regras";
import type { FinContext } from "./tenant";

type Row = Record<string, unknown>;
const api = (r: Row): ParteReg => ({
  id: Number(r.id), tipo: r.tipo as ParteReg["tipo"], nome: String(r.nome), tipoPessoa: r.tipo_pessoa as ParteReg["tipoPessoa"], cnpj: (r.cnpj as string) ?? null,
  participacaoBp: r.participacao_bp == null ? null : Number(r.participacao_bp), via: r.via as ParteReg["via"], fonteDocumento: (r.fonte_documento as string) ?? null,
  observacao: (r.observacao as string) ?? null, statusValidacao: r.status_validacao as ParteReg["statusValidacao"], encerradaEm: r.ended_at ? new Date(r.ended_at as string).toISOString() : null,
});

async function entidadeDaEmpresa(ctx: FinContext, id: number) {
  const e = (await db.execute(sql`SELECT id, razao_social FROM fin_entity WHERE id=${id} AND company_id=${ctx.companyId}`)).rows[0] as Row | undefined;
  if (!e) throw new FinError(404, "Cadastro não encontrado nesta empresa");
  return e;
}

/** Lista partes e o parecer de conformidade da entidade. Sempre filtrado pela empresa da sessao. */
export async function lerConformidade(ctx: FinContext, entidadeId: number) {
  const e = await entidadeDaEmpresa(ctx, entidadeId);
  const partes = ((await db.execute(sql`SELECT * FROM fin_related_party WHERE company_id=${ctx.companyId} AND entity_id=${entidadeId} ORDER BY id`)).rows as Row[]).map(api);
  const pessoas = ((await db.execute(sql`SELECT nome, papel, participacao_bp FROM fin_partner WHERE company_id=${ctx.companyId} AND entity_id=${entidadeId} AND (vigencia_fim IS NULL)`)).rows as Row[])
    .map((p) => ({ nome: String(p.nome), papel: String(p.papel), participacaoBp: p.participacao_bp == null ? null : Number(p.participacao_bp) }));
  return { entidadeId, razaoSocial: String(e.razao_social), partes, pessoas, parecer: avaliarConformidade(pessoas, partes) };
}

export async function criarParte(ctx: FinContext, entidadeId: number, i: ParteIn) {
  await entidadeDaEmpresa(ctx, entidadeId);
  const r = await db.transaction(async (tx) => {
    const x = (await tx.execute(sql`INSERT INTO fin_related_party (company_id, entity_id, tipo, nome, tipo_pessoa, cnpj, participacao_bp, via, fonte_documento, observacao, created_by)
      VALUES (${ctx.companyId}, ${entidadeId}, ${i.tipo}, ${i.nome}, ${i.tipoPessoa}, ${i.cnpj ?? null}, ${i.participacaoBp ?? null}, ${i.via}, ${i.fonteDocumento ?? null}, ${i.observacao ?? null}, ${ctx.actorId}) RETURNING *`)).rows[0] as Row;
    await registrarAuditoria(tx, ctx, "conformidade.parte_criar", "fin_related_party", Number(x.id), { tipo: i.tipo, via: i.via });
    return x;
  });
  return api(r);
}

async function parteDaEmpresa(ctx: FinContext, id: number) {
  const p = (await db.execute(sql`SELECT * FROM fin_related_party WHERE id=${id} AND company_id=${ctx.companyId}`)).rows[0] as Row | undefined;
  if (!p) throw new FinError(404, "Registro não encontrado nesta empresa");
  return p;
}

export async function editarParte(ctx: FinContext, id: number, i: ParteIn) {
  const atual = await parteDaEmpresa(ctx, id);
  if (atual.ended_at) throw new FinError(409, "Registro encerrado não pode ser editado; cadastre um novo.");
  const r = await db.transaction(async (tx) => {
    const x = (await tx.execute(sql`UPDATE fin_related_party SET tipo=${i.tipo}, nome=${i.nome}, tipo_pessoa=${i.tipoPessoa}, cnpj=${i.cnpj ?? null}, participacao_bp=${i.participacaoBp ?? null}, via=${i.via},
      fonte_documento=${i.fonteDocumento ?? null}, observacao=${i.observacao ?? null}, status_validacao='rascunho', validated_by=NULL, validated_at=NULL, updated_at=now()
      WHERE id=${id} AND company_id=${ctx.companyId} RETURNING *`)).rows[0] as Row;
    await registrarAuditoria(tx, ctx, "conformidade.parte_editar", "fin_related_party", id, { tipo: i.tipo });
    return x;
  });
  return api(r);
}

/** Validacao humana: exige documento de origem. */
export async function validarParte(ctx: FinContext, id: number) {
  const p = await parteDaEmpresa(ctx, id);
  if (p.ended_at) throw new FinError(409, "Registro encerrado");
  if (!String(p.fonte_documento ?? "").trim()) throw new FinError(409, "Informe o documento de origem antes de validar.");
  const r = await db.transaction(async (tx) => {
    const x = (await tx.execute(sql`UPDATE fin_related_party SET status_validacao='validado', validated_by=${ctx.actorId}, validated_at=now(), updated_at=now() WHERE id=${id} AND company_id=${ctx.companyId} RETURNING *`)).rows[0] as Row;
    await registrarAuditoria(tx, ctx, "conformidade.parte_validar", "fin_related_party", id, {});
    return x;
  });
  return api(r);
}

/** Encerra (nunca apaga): o historico permanece. */
export async function encerrarParte(ctx: FinContext, id: number) {
  await parteDaEmpresa(ctx, id);
  const r = await db.transaction(async (tx) => {
    const x = (await tx.execute(sql`UPDATE fin_related_party SET ended_at=COALESCE(ended_at, now()), updated_at=now() WHERE id=${id} AND company_id=${ctx.companyId} RETURNING *`)).rows[0] as Row;
    await registrarAuditoria(tx, ctx, "conformidade.parte_encerrar", "fin_related_party", id, {});
    return x;
  });
  return api(r);
}
