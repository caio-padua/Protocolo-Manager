import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { FinError } from "./regras";
import type { FinContext } from "./tenant";
import { registrarAuditoria } from "./auditoria";
import { cifrarTexto, decifrarTexto } from "../lib/secure-settings";
import {
  ORDEM_APLICACAO, ROTULOS, ROTULOS_SENSIVEIS, SLOTS, SLOT_ROTULO, chaveNome, coerenciaContrato, conferirCruzado, extrair, mascarar, mascararParaIA, normalizarTranscricao, reconhecerSlot, soDigitos,
  type Extraido, type Slot, type Socio, type Valor,
} from "./documentos-calc";

const run = promisify(execFile);
type Row = Record<string, unknown>;
export const MAX_BYTES = 15 * 1024 * 1024;

/** Valida o slot vindo da URL. */
export function slotValido(s: string): Slot {
  if (!(SLOTS as readonly string[]).includes(s)) throw new FinError(400, "Tipo de documento invalido");
  return s as Slot;
}

// ---------- leitura do PDF ----------
async function comPasta<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "finDoc-"));
  try { return await fn(dir); } finally { await rm(dir, { recursive: true, force: true }); }
}
export async function textoDoPdf(buf: Buffer): Promise<string> {
  return comPasta(async (dir) => {
    const f = join(dir, "a.pdf"); await writeFile(f, buf);
    try { return (await run("pdftotext", ["-raw", f, "-"], { maxBuffer: 20 * 1024 * 1024 })).stdout; }
    catch { throw new FinError(422, "Nao foi possivel ler este PDF (arquivo danificado ou protegido)."); }
  });
}
/** Documento digitalizado (sem texto): paginas viram imagem e a IA de visao transcreve literalmente. As imagens contem dados pessoais e vao ao provedor. */
export async function transcreverPorVisao(buf: Buffer, empresaId: number): Promise<string> {
  const { requireAiTenant, logAiUsage } = await import("../lib/ai-central");
  try { requireAiTenant(empresaId, "ocr"); } catch { throw new FinError(503, "Documento digitalizado precisa da leitura por inteligencia artificial, que nao esta habilitada neste ambiente."); }
  const { anthropic } = await import("@workspace/integrations-anthropic-ai");
  return comPasta(async (dir) => {
    const f = join(dir, "a.pdf"); await writeFile(f, buf);
    await run("pdftoppm", ["-r", "110", "-png", "-l", "20", f, join(dir, "p")]);
    const imgs = (await readdir(dir)).filter((x) => x.endsWith(".png")).sort();
    if (!imgs.length) throw new FinError(422, "Nenhuma pagina legivel no PDF.");
    const partes: Array<Record<string, unknown>> = [];
    for (const i of imgs) partes.push({ type: "image", source: { type: "base64", media_type: "image/png", data: (await readFile(join(dir, i))).toString("base64") } });
    partes.push({ type: "text", text: "Transcreva LITERALMENTE todo o texto das paginas acima, na ordem, sem resumir, sem corrigir e sem comentar. Use o mesmo formato de linhas do original, em texto puro, sem markdown, sem negrito e sem tabelas com barras. Se algo estiver ilegivel escreva [ilegivel]." });
    const m = await anthropic.messages.create({ model: "claude-sonnet-4-6", max_tokens: 8192, messages: [{ role: "user", content: partes as never }] });
    await logAiUsage({ empresaId, provider: "anthropic", tipo: "ocr", inputTokens: m.usage?.input_tokens, outputTokens: m.usage?.output_tokens });
    return normalizarTranscricao(m.content.map((c) => (c.type === "text" ? c.text : "")).join("\n").trim());
  });
}

/** Segunda opiniao por IA sobre texto JA MASCARADO (sem CPF, RG, nascimento ou endereco residencial). Falha vira "indisponivel", nunca aprovacao. */
export async function conferirComIA(empresaId: number, slot: Slot, textoOriginal: string, campos: Record<string, Valor>) {
  try {
    const { requireAiTenant, logAiUsage } = await import("../lib/ai-central");
    requireAiTenant(empresaId, "ocr");
    const { anthropic } = await import("@workspace/integrations-anthropic-ai");
    const prompt = `Voce confere extracao de documento oficial (${SLOT_ROTULO[slot]}). Abaixo estao o TEXTO do documento (dados pessoais ja ocultados) e os CAMPOS extraidos por programa. Aponte APENAS campos extraidos que contradizem o texto ou informacoes importantes do texto que nao viraram campo. Responda JSON minificado: {"divergencias":["..."],"faltando":["..."]}. Sem texto extra.\n\nCAMPOS:\n${JSON.stringify(campos).slice(0, 12000)}\n\nTEXTO:\n${mascararParaIA(textoOriginal).slice(0, 40000)}`;
    const m = await anthropic.messages.create({ model: "claude-sonnet-4-6", max_tokens: 2000, messages: [{ role: "user", content: prompt }] });
    await logAiUsage({ empresaId, provider: "anthropic", tipo: "ocr", inputTokens: m.usage?.input_tokens, outputTokens: m.usage?.output_tokens });
    const t = m.content.map((c) => (c.type === "text" ? c.text : "")).join("");
    const j = /\{[\s\S]*\}/.exec(t);
    if (!j) return { status: "indisponivel" as const, motivo: "A IA nao devolveu resposta em formato valido." };
    const o = JSON.parse(j[0]) as { divergencias?: string[]; faltando?: string[] };
    return { status: "ok" as const, divergencias: (o.divergencias ?? []).map(String).slice(0, 30), faltando: (o.faltando ?? []).map(String).slice(0, 30) };
  } catch (e) {
    return { status: "indisponivel" as const, motivo: e instanceof Error ? e.message.slice(0, 200) : "IA indisponivel" };
  }
}

// ---------- cifra dos sensiveis ----------
type Cifrado = { c: string; i: string; t: string };
export const cifrarMapa = (m: Record<string, string>): Record<string, Cifrado> => Object.fromEntries(Object.entries(m).map(([k, v]) => { const e = cifrarTexto(v); return [k, { c: e.ciphertext, i: e.iv, t: e.authTag }]; }));
const abrir = (x: Cifrado) => decifrarTexto(x.c, x.i, x.t);
const mascaras = (m: Record<string, Cifrado>) => Object.fromEntries(Object.keys(m).map((k) => [k, { rotulo: ROTULOS_SENSIVEIS[k] ?? k, mascara: mascarar(k, abrir(m[k])) }]));

// ---------- upload ----------
const empresaDe = async (ctx: FinContext) => {
  const e = (await db.execute(sql`SELECT cnpj, razao_social FROM empresas WHERE id=${ctx.companyId}`)).rows[0] as Row | undefined;
  if (!e) throw new FinError(404, "Empresa nao encontrada");
  return { cnpj: String(e.cnpj ?? ""), razao: String(e.razao_social ?? "") };
};

export async function enviarDocumento(ctx: FinContext, slot: Slot, arq: { nome: string; bytes: Buffer }) {
  if (!arq.bytes.length) throw new FinError(400, "Arquivo vazio");
  if (arq.bytes.length > MAX_BYTES) throw new FinError(413, "Arquivo maior que 15 MB");
  if (arq.bytes.subarray(0, 5).toString("latin1") !== "%PDF-") throw new FinError(415, "Envie um arquivo PDF.");
  const sha = createHash("sha256").update(arq.bytes).digest("hex");
  const dup = (await db.execute(sql`SELECT id FROM fin_doc_import WHERE company_id=${ctx.companyId} AND slot=${slot} AND sha256=${sha} AND status IN ('extraido','aplicado')`)).rows[0] as Row | undefined;
  if (dup) throw new FinError(409, "Este mesmo arquivo ja foi enviado neste campo.");

  let texto = await textoDoPdf(arq.bytes);
  let metodo: "texto" | "visao_ia" = "texto";
  if (texto.replace(/\s/g, "").length < 200) { texto = await transcreverPorVisao(arq.bytes, ctx.companyId); metodo = "visao_ia"; }
  const reconhecido = reconhecerSlot(texto);
  if (reconhecido && reconhecido !== slot)
    throw new FinError(422, `Este arquivo parece ser: ${SLOT_ROTULO[reconhecido]}. Envie-o no campo correto.`);
  const ex: Extraido = extrair(slot, texto);
  // Ambiente de testes (decisao do CEO): nenhum CPF/dado pessoal cifrado ou mascarado; tudo em claro nos campos.
  Object.assign(ex.publicos, ex.sensiveis); ex.sensiveis = {};
  if (!Object.keys(ex.publicos).length) throw new FinError(422, "Nenhum dado reconhecido neste documento.");
  const avisos = [...ex.avisos];
  if (metodo === "visao_ia") avisos.push("Documento digitalizado: o texto foi transcrito por inteligencia artificial de visao. Confira cada campo contra a imagem.");
  if (slot === "contrato_social") avisos.push(...coerenciaContrato(ex.publicos));
  const conferencia = await conferirComIA(ctx.companyId, slot, texto, ex.publicos);

  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${ctx.companyId}, hashtext(${"docimport-" + slot}))`);
    await tx.execute(sql`UPDATE fin_doc_import SET status='substituido' WHERE company_id=${ctx.companyId} AND slot=${slot} AND status IN ('extraido','aplicado')`);
    const r = await tx.execute(sql`INSERT INTO fin_doc_import (company_id, slot, file_name, file_size, sha256, file_bytes, metodo, campos, sensiveis, conferencia, avisos, uploaded_by)
      VALUES (${ctx.companyId}, ${slot}, ${arq.nome.slice(0, 200)}, ${arq.bytes.length}, ${sha}, ${arq.bytes}, ${metodo}, ${JSON.stringify(ex.publicos)}::jsonb,
      ${JSON.stringify(cifrarMapa(ex.sensiveis))}::jsonb, ${JSON.stringify(conferencia)}::jsonb, ${JSON.stringify(avisos)}::jsonb, ${ctx.actorId}) RETURNING id`);
    const id = Number((r.rows as Row[])[0].id);
    await registrarAuditoria(tx, ctx, "documento.enviar", "fin_doc_import", id, { slot, sha256: sha, metodo, campos: Object.keys(ex.publicos).length, sensiveis: Object.keys(ex.sensiveis).length });
    return { id };
  });
}

// ---------- leitura ----------
const ativos = async (ctx: FinContext) => ((await db.execute(sql`SELECT id, slot, file_name, file_size, sha256, metodo, campos, sensiveis, conferencia, avisos, status, created_at, applied_at
  FROM fin_doc_import WHERE company_id=${ctx.companyId} AND status IN ('extraido','aplicado') ORDER BY slot, id DESC`)).rows as Row[]);

export async function listarDocumentos(ctx: FinContext, ehCeo: boolean) {
  const rows = await ativos(ctx);
  const porSlot: Partial<Record<Slot, Row>> = {};
  for (const r of rows) { const s = r.slot as Slot; if (!porSlot[s]) porSlot[s] = r; }
  const campos: Partial<Record<Slot, Record<string, Valor>>> = {};
  for (const s of SLOTS) if (porSlot[s]) campos[s] = porSlot[s]!.campos as Record<string, Valor>;
  const cruzada = conferirCruzado(campos);
  const empresa = await empresaDe(ctx);
  const bloqueios: string[] = [];
  const rfbCnpj = campos.cnpj_rfb?.cnpj; if (typeof rfbCnpj === "string" && empresa.cnpj && soDigitos(rfbCnpj) !== soDigitos(empresa.cnpj)) bloqueios.push("O CNPJ do comprovante nao e o CNPJ da empresa selecionada.");
  for (const l of cruzada) if (l.resultado === "diverge") bloqueios.push(`Os documentos divergem em: ${l.rotulo}.`);
  return {
    ehCeo,
    slots: SLOTS.map((s) => {
      const r = porSlot[s];
      return { slot: s, rotulo: SLOT_ROTULO[s], documento: r ? {
        id: Number(r.id), arquivo: r.file_name, bytes: Number(r.file_size), sha256: r.sha256, metodo: r.metodo, status: r.status, enviadoEm: r.created_at, aplicadoEm: r.applied_at,
        campos: Object.entries(r.campos as Record<string, Valor>).map(([k, v]) => ({ chave: k, rotulo: ROTULOS[k]?.rotulo ?? ROTULOS_SENSIVEIS[k] ?? k, grupo: ROTULOS[k]?.grupo ?? (ROTULOS_SENSIVEIS[k] ? "Dados pessoais" : "Outros"), valor: v })),
        sensiveis: Object.entries(mascaras(r.sensiveis as Record<string, Cifrado>)).map(([k, v]) => ({ chave: k, ...v })),
        conferenciaIa: r.conferencia, avisos: r.avisos,
      } : null };
    }),
    cruzada, bloqueios, podeAplicar: Object.keys(porSlot).length > 0 && bloqueios.length === 0,
  };
}

export async function revelarSensivel(ctx: FinContext, docId: number, chave: string) {
  const r = (await db.execute(sql`SELECT sensiveis FROM fin_doc_import WHERE id=${docId} AND company_id=${ctx.companyId}`)).rows[0] as Row | undefined;
  if (!r) throw new FinError(404, "Documento nao encontrado");
  const m = r.sensiveis as Record<string, Cifrado>;
  if (!m[chave]) throw new FinError(404, "Campo nao encontrado");
  await db.transaction(async (tx) => { await registrarAuditoria(tx, ctx, "documento.revelar_sensivel", "fin_doc_import", docId, { campo: chave }); });
  return { chave, rotulo: ROTULOS_SENSIVEIS[chave] ?? chave, valor: abrir(m[chave]) };
}

export async function rejeitarDocumento(ctx: FinContext, docId: number) {
  return db.transaction(async (tx) => {
    const r = await tx.execute(sql`UPDATE fin_doc_import SET status='rejeitado' WHERE id=${docId} AND company_id=${ctx.companyId} AND status='extraido' RETURNING id`);
    if (!r.rows.length) throw new FinError(404, "Documento nao encontrado ou ja aplicado");
    await registrarAuditoria(tx, ctx, "documento.rejeitar", "fin_doc_import", docId, {});
    return { ok: true };
  });
}

export async function lerRegistro(ctx: FinContext) {
  const r = (await db.execute(sql`SELECT dados, sensiveis, origem, updated_at FROM fin_company_registry WHERE company_id=${ctx.companyId}`)).rows[0] as Row | undefined;
  if (!r) return { existe: false, campos: [], sensiveis: [] };
  const d = r.dados as Record<string, Valor>, o = r.origem as Record<string, string>;
  return {
    existe: true, atualizadoEm: r.updated_at,
    campos: Object.entries(d).map(([k, v]) => ({ chave: k, rotulo: ROTULOS[k]?.rotulo ?? ROTULOS_SENSIVEIS[k] ?? k, grupo: ROTULOS[k]?.grupo ?? (ROTULOS_SENSIVEIS[k] ? "Dados pessoais" : "Outros"), valor: v, origem: o[k] ?? null })),
    sensiveis: Object.entries(mascaras(r.sensiveis as Record<string, Cifrado>)).map(([k, v]) => ({ chave: k, ...v })),
  };
}


/** Liga o medico ao campo "Responsavel tecnico" do cadastro da empresa (empresa_responsaveis) quando o registro profissional bate com UM unico medico ativo vinculado a empresa. Nunca sobrescreve escolha existente; nunca toca em administrador. */
async function vincularResponsavelTecnico(tx: Pick<typeof db, "execute">, ctx: FinContext, registro: unknown): Promise<"vinculado" | "ja_definido" | "sem_correspondencia"> {
  const dig = typeof registro === "string" ? soDigitos(registro) : "";
  if (dig.length < 4) return "sem_correspondencia";
  const c = (await tx.execute(sql`SELECT id FROM professionals p WHERE p.active AND p.professional_type='medico'
    AND regexp_replace(coalesce(p.registration_number, p.crm, ''), '\\D', '', 'g') = ${dig}
    AND (p.empresa_id=${ctx.companyId} OR EXISTS (SELECT 1 FROM professional_empresas pe WHERE pe.professional_id=p.id AND pe.empresa_id=${ctx.companyId}))`)).rows as Row[];
  if (c.length !== 1) return "sem_correspondencia";
  const id = Number(c[0].id);
  const atual = (await tx.execute(sql`SELECT responsavel_tecnico_professional_id AS rt FROM empresa_responsaveis WHERE empresa_id=${ctx.companyId}`)).rows[0] as Row | undefined;
  if (atual?.rt) return "ja_definido";
  await tx.execute(sql`INSERT INTO empresa_responsaveis (empresa_id, responsavel_tecnico_professional_id, atualizado_por) VALUES (${ctx.companyId}, ${id}, ${ctx.actorId})
    ON CONFLICT (empresa_id) DO UPDATE SET responsavel_tecnico_professional_id=EXCLUDED.responsavel_tecnico_professional_id, atualizado_por=EXCLUDED.atualizado_por, atualizado_em=now()`);
  await tx.execute(sql`INSERT INTO empresa_responsaveis_auditoria (empresa_id, funcao, antes, depois, por) VALUES (${ctx.companyId}, 'responsavel_tecnico', NULL, ${id}, ${ctx.actorId})`);
  return "vinculado";
}

// ---------- aplicar ----------
const val = (d: Record<string, Valor>, k: string) => (typeof d[k] === "string" || typeof d[k] === "number" ? d[k] : undefined);
export async function aplicarDocumentos(ctx: FinContext) {
  const empresa = await empresaDe(ctx);
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${ctx.companyId}, hashtext('docimport-apply'))`);
    const rows = ((await tx.execute(sql`SELECT id, slot, campos, sensiveis FROM fin_doc_import WHERE company_id=${ctx.companyId} AND status IN ('extraido','aplicado') ORDER BY id DESC`)).rows as Row[]);
    const por: Partial<Record<Slot, Row>> = {};
    for (const r of rows) if (!por[r.slot as Slot]) por[r.slot as Slot] = r;
    if (!Object.keys(por).length) throw new FinError(409, "Envie ao menos um documento antes de aplicar.");
    const campos: Partial<Record<Slot, Record<string, Valor>>> = {};
    for (const s of SLOTS) if (por[s]) campos[s] = por[s]!.campos as Record<string, Valor>;
    const div = conferirCruzado(campos).filter((l) => l.resultado === "diverge");
    if (div.length) throw new FinError(409, `Os documentos divergem entre si (${div.map((d) => d.rotulo).join(", ")}). Corrija enviando o documento certo.`);
    const cnpjDoc = campos.cnpj_rfb?.cnpj;
    if (typeof cnpjDoc === "string" && empresa.cnpj && soDigitos(cnpjDoc) !== soDigitos(empresa.cnpj)) throw new FinError(409, "O CNPJ do documento nao e o CNPJ da empresa selecionada. Nada foi gravado.");
    for (const s of SLOTS) { const rz = campos[s]?.razaoSocial; if (typeof rz === "string" && empresa.razao && chaveNome(rz) !== chaveNome(empresa.razao)) throw new FinError(409, "A razao social do documento nao e a da empresa selecionada. Nada foi gravado."); }

    // junta: o ultimo da ordem vence; guarda a origem de cada campo
    const merged: Record<string, Valor> = {}; const origem: Record<string, string> = {}; const sens: Record<string, Cifrado> = {};
    for (const s of ORDEM_APLICACAO) {
      const r = por[s]; if (!r) continue;
      for (const [k, v] of Object.entries(r.campos as Record<string, Valor>)) { merged[k] = v; origem[k] = s; }
      Object.assign(sens, r.sensiveis as Record<string, Cifrado>);
    }
    // Ambiente de testes (decisao do CEO): documentos pessoais ficam em claro no cadastro, sem cifra.
    for (const [k, c] of Object.entries(sens)) { merged[k] = abrir(c); origem[k] = origem[k] ?? "documento"; delete sens[k]; }
    const socios = (merged.socios as Socio[] | undefined) ?? [];
    const principal = socios.slice().sort((a, b) => (b.bp ?? 0) - (a.bp ?? 0))[0]?.nome;
    const adm = typeof merged.administradorNome === "string" ? merged.administradorNome : undefined;

    // 1) cadastro da empresa (empresas): so campos com evidencia; valores anteriores vao para a auditoria
    const atual = (await tx.execute(sql`SELECT * FROM empresas WHERE id=${ctx.companyId}`)).rows[0] as Row;
    const cnaeP = typeof merged.cnaePrincipal === "string" ? /^(\S+) - (.+)$/.exec(merged.cnaePrincipal) : null;
    const secCodes = Array.isArray(merged.cnaesSecundarios) ? (merged.cnaesSecundarios as string[]).map((x) => x.split(" - ")[0]) : null;
    const sede = [val(merged, "logradouro")].filter(Boolean)[0];
    const novo: Record<string, unknown> = {
      razao_social: val(merged, "razaoSocial"), nome_fantasia: val(merged, "nomeFantasia"), cnpj: typeof merged.cnpj === "string" ? merged.cnpj : undefined,
      cnae: cnaeP?.[1], cnae_descricao: cnaeP?.[2], natureza_juridica: val(merged, "naturezaJuridica"), data_abertura: val(merged, "dataConstituicao"),
      capital_social: typeof merged.capitalSocialCents === "number" ? merged.capitalSocialCents / 100 : undefined,
      dono_nome: principal, responsavel_legal_nome: adm ?? principal,
      endereco: sede, numero: val(merged, "numero"), complemento: val(merged, "complemento"), bairro: val(merged, "bairro"), cep: val(merged, "cep"),
      cidade: val(merged, "municipio"), estado: val(merged, "uf"), telefone: val(merged, "telefone"), email_geral: val(merged, "email"),
    };
    const anterior: Record<string, unknown> = {}, gravado: Record<string, unknown> = {};
    for (const [col, v] of Object.entries(novo)) {
      if (v === undefined || v === null || v === "") continue;
      if (String(atual[col] ?? "") === String(v)) continue;
      anterior[col] = atual[col] ?? null; gravado[col] = v;
      await tx.execute(sql`UPDATE empresas SET ${sql.raw(`"${col}"`)} = ${v as never} WHERE id=${ctx.companyId}`);
    }
    if (secCodes?.length) {
      const antes = JSON.stringify(atual.cnaes_secundarios ?? null);
      if (antes !== JSON.stringify(secCodes)) { anterior.cnaes_secundarios = atual.cnaes_secundarios ?? null; gravado.cnaes_secundarios = secCodes; await tx.execute(sql`UPDATE empresas SET cnaes_secundarios=${JSON.stringify(secCodes)}::jsonb WHERE id=${ctx.companyId}`); }
    }

    // 2) cadastro societario completo (todos os campos, sem excecao) + sensiveis cifrados
    await tx.execute(sql`INSERT INTO fin_company_registry (company_id, dados, sensiveis, origem, updated_by)
      VALUES (${ctx.companyId}, ${JSON.stringify(merged)}::jsonb, ${JSON.stringify(sens)}::jsonb, ${JSON.stringify(origem)}::jsonb, ${ctx.actorId})
      ON CONFLICT (company_id) DO UPDATE SET dados=EXCLUDED.dados, sensiveis=EXCLUDED.sensiveis, origem=EXCLUDED.origem, updated_by=EXCLUDED.updated_by, updated_at=now()`);

    const rtVinculo = await vincularResponsavelTecnico(tx, ctx, merged.rtCrm);

    // 3) Pax Finance: cadastro da entidade e pessoas (sem duplicar), devolvido a rascunho
    const cnpjFmt = String(merged.cnpj ?? empresa.cnpj);
    let ent = (await tx.execute(sql`SELECT id FROM fin_entity WHERE company_id=${ctx.companyId} AND cnpj=${cnpjFmt}`)).rows[0] as Row | undefined;
    const sedeJson = { logradouro: merged.logradouro ?? null, numero: merged.numero ?? null, complemento: merged.complemento ?? null, bairro: merged.bairro ?? null, cep: merged.cep ?? null, municipio: merged.municipio ?? null, uf: merged.uf ?? null };
    const cnaesFull = Array.isArray(merged.cnaesSecundarios) ? merged.cnaesSecundarios : null;
    if (!ent && cnpjFmt && typeof merged.razaoSocial === "string") {
      ent = (await tx.execute(sql`INSERT INTO fin_entity (company_id, cnpj, razao_social) VALUES (${ctx.companyId}, ${cnpjFmt}, ${merged.razaoSocial}) RETURNING id`)).rows[0] as Row;
    }
    let pessoas = 0;
    if (ent) {
      const eid = Number(ent.id);
      await tx.execute(sql`UPDATE fin_entity SET
        razao_social=COALESCE(${val(merged, "razaoSocial") ?? null}, razao_social), nome_fantasia=COALESCE(${val(merged, "nomeFantasia") ?? null}, nome_fantasia),
        data_constituicao=COALESCE(${(val(merged, "dataConstituicao") as string | undefined) ?? null}::date, data_constituicao), natureza_juridica=COALESCE(${val(merged, "naturezaJuridica") ?? null}, natureza_juridica),
        porte=COALESCE(${val(merged, "porte") ?? null}, porte), capital_social_cents=COALESCE(${typeof merged.capitalSocialCents === "number" ? merged.capitalSocialCents : null}::bigint, capital_social_cents),
        capital_integralizado=COALESCE(${typeof merged.capitalIntegralizado === "boolean" ? merged.capitalIntegralizado : null}::boolean, capital_integralizado),
        sede=${JSON.stringify(sedeJson)}::jsonb, cnae_principal=COALESCE(${cnaeP?.[1] ?? null}, cnae_principal), cnae_principal_descricao=COALESCE(${cnaeP?.[2] ?? null}, cnae_principal_descricao),
        cnaes_secundarios=COALESCE(${cnaesFull ? JSON.stringify(cnaesFull) : null}::jsonb, cnaes_secundarios),
        origem_campos = origem_campos || ${JSON.stringify(origem)}::jsonb,
        status_validacao='rascunho', validated_by=NULL, validated_at=NULL, updated_at=now()
        WHERE id=${eid} AND company_id=${ctx.companyId}`);
      const garantir = async (nome: string, papel: string, bp: number | null, registro: string | null, docId: number | null) => {
        const ja = ((await tx.execute(sql`SELECT id, nome FROM fin_partner WHERE company_id=${ctx.companyId} AND entity_id=${eid} AND papel=${papel}`)).rows as Row[]).find((p) => chaveNome(String(p.nome)) === chaveNome(nome));
        if (ja) { await tx.execute(sql`UPDATE fin_partner SET participacao_bp=COALESCE(${bp}::int, participacao_bp), registro_profissional=COALESCE(${registro}, registro_profissional), source_document_id=COALESCE(${docId}::bigint, source_document_id), updated_at=now() WHERE id=${Number(ja.id)}`); return; }
        await tx.execute(sql`INSERT INTO fin_partner (company_id, entity_id, nome, papel, participacao_bp, registro_profissional, origem, source_document_id, origem_doc)
          VALUES (${ctx.companyId}, ${eid}, ${nome}, ${papel}, ${bp}, ${registro}, 'documento', ${docId}, ${JSON.stringify({ documentos: [origem.socios ?? origem.rtNome ?? "contrato_social"] })}::jsonb)`);
        pessoas++;
      };
      const docContrato = por.contrato_social ?? por.certidao_jucesp; const docId = docContrato ? Number(docContrato.id) : null;
      for (const s of socios) await garantir(s.nome, adm && chaveNome(adm) === chaveNome(s.nome) ? "socio_administrador" : "socio", s.bp, null, docId);
      if (adm && !socios.some((s) => chaveNome(s.nome) === chaveNome(adm))) await garantir(adm, "administrador", null, null, docId);
      // Responsavel tecnico (medico responsavel clinico) NAO e socio nem responsavel da empresa: fica so no cadastro informativo (registry).
    }
    await tx.execute(sql`UPDATE fin_doc_import SET status='aplicado', applied_by=${ctx.actorId}, applied_at=now() WHERE company_id=${ctx.companyId} AND status='extraido'`);
    await registrarAuditoria(tx, ctx, "documento.aplicar", "empresas", ctx.companyId, { anterior, gravado, camposRegistro: Object.keys(merged).length, pessoasNovas: pessoas, rtVinculo, entidadeId: ent ? Number(ent.id) : null });
    return { rtVinculo, camposRegistro: Object.keys(merged).length, camposEmpresaAlterados: Object.keys(gravado), pessoasNovas: pessoas, entidadeId: ent ? Number(ent.id) : null, sensiveisGuardados: Object.keys(sens).length };
  });
}

/** Cadastro informativo do medico responsavel tecnico (clinico). NAO e socio, administrador nem responsavel juridico/financeiro. */
export async function salvarResponsavelTecnico(ctx: FinContext, nome: string, registro: string) {
  const n = nome.trim().slice(0, 200), r = registro.trim().slice(0, 60);
  if (n.length < 3) throw new FinError(400, "Informe o nome do medico responsavel tecnico.");
  return db.transaction(async (tx) => {
    const ant = (await tx.execute(sql`SELECT dados FROM fin_company_registry WHERE company_id=${ctx.companyId}`)).rows[0] as Row | undefined;
    const d = (ant?.dados ?? {}) as Record<string, Valor>;
    await tx.execute(sql`INSERT INTO fin_company_registry (company_id, dados, sensiveis, origem, updated_by)
      VALUES (${ctx.companyId}, ${JSON.stringify({ rtNome: n, rtCrm: r })}::jsonb, '{}'::jsonb, ${JSON.stringify({ rtNome: "manual", rtCrm: "manual" })}::jsonb, ${ctx.actorId})
      ON CONFLICT (company_id) DO UPDATE SET dados = fin_company_registry.dados || ${JSON.stringify({ rtNome: n, rtCrm: r })}::jsonb,
        origem = fin_company_registry.origem || ${JSON.stringify({ rtNome: "manual", rtCrm: "manual" })}::jsonb, updated_by=EXCLUDED.updated_by, updated_at=now()`);
    const vinculo = await vincularResponsavelTecnico(tx, ctx, r);
    await registrarAuditoria(tx, ctx, "documento.responsavel_tecnico", "fin_company_registry", ctx.companyId, { anterior: { rtNome: d.rtNome ?? null, rtCrm: d.rtCrm ?? null }, novo: { rtNome: n, rtCrm: r }, vinculo });
    return { ok: true, vinculo };
  });
}
