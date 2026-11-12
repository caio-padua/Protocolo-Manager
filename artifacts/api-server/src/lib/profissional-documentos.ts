import { createHash, randomUUID } from "node:crypto";
import type { Request } from "express";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { normalizeMatriz, podeUsar, type Matriz } from "@workspace/governanca";
import { ObjectStorageService } from "./objectStorage";
import { getJsonSetting } from "./secure-settings";

/**
 * Documentos dos profissionais (carteira do conselho, comprovante, identidade...). Arquivo em armazenamento PRIVADO
 * (fora de `uploads/`, que a rota pública serve); só sai por rota autenticada, da mesma empresa, com permissão.
 * Nada é apagado: arquivar muda a situação. Toda ação grava auditoria sem o conteúdo do documento.
 */
export const TIPOS = ["carteira_conselho", "comprovante_endereco", "documento_identidade", "diploma_certificado", "contrato", "outro"] as const;
export type TipoDocumento = (typeof TIPOS)[number];
export const SITUACOES = ["pendente_confirmacao", "confirmado", "titular_divergente", "arquivado"] as const;
export const MAX_BYTES = 10 * 1024 * 1024;
export const FERRAMENTA_DOCUMENTOS = "documentos_profissionais";

export class DocumentoErro extends Error {
  constructor(public status: number, message: string, public code: string) { super(message); }
}

/** Tipo REAL pelo conteúdo (assinatura do arquivo), nunca pelo nome ou pelo tipo declarado. */
export function detectarTipo(b: Buffer): { mime: string; ext: string } | null {
  if (b.length >= 5 && b.subarray(0, 5).toString("latin1") === "%PDF-") return { mime: "application/pdf", ext: "pdf" };
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: "image/png", ext: "png" };
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { mime: "image/jpeg", ext: "jpg" };
  if (b.length >= 12 && b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP") return { mime: "image/webp", ext: "webp" };
  return null;
}

export type AcessoDocumentos = { ok: true; empresaId: number; me: number; dono: boolean } | { ok: false; status: 401 | 403 | 404; error: string; code: string };

/**
 * Empresa da sessão + profissional DESSA empresa + (proprietário | o próprio titular | permissão da matriz).
 * Profissional de outra empresa responde 404 (não confirma que existe).
 */
export async function autorizarDocumentos(req: Request, professionalId: number, pertenceAEmpresa: (empresaId: number, id: number) => Promise<boolean>): Promise<AcessoDocumentos> {
  const ctx = req.tenantContext;
  const me = req.collaborator?.professionalId;
  if (!req.collaborator || !me || !ctx?.authenticated || !ctx.empresaId) return { ok: false, status: 401, code: "sem_sessao", error: "Entre com seu acesso profissional." };
  if (!(await pertenceAEmpresa(ctx.empresaId, professionalId))) return { ok: false, status: 404, code: "profissional_nao_encontrado", error: "Profissional não encontrado." };
  const ator = (await db.execute(sql`SELECT active, category, is_platform_owner FROM professionals WHERE id=${me}`)).rows[0];
  if (!ator || ator.active !== true) return { ok: false, status: 403, code: "profissional_inativo", error: "O acesso autenticado não pertence a um profissional ativo." };
  if (ator.is_platform_owner === true) return { ok: true, empresaId: ctx.empresaId, me, dono: true };
  if (me === professionalId) return { ok: true, empresaId: ctx.empresaId, me, dono: false };
  const matriz: Matriz = normalizeMatriz(await getJsonSetting<Matriz>("governanca.matriz"));
  if (!podeUsar(matriz, FERRAMENTA_DOCUMENTOS, String(ator.category ?? ""))) {
    return { ok: false, status: 403, code: "sem_permissao_documentos", error: "Seu perfil não está autorizado a ver ou enviar documentos de outros profissionais. Peça ao CEO para liberar em Governança." };
  }
  return { ok: true, empresaId: ctx.empresaId, me, dono: false };
}

export async function auditarDocumento(empresaId: number, professionalId: number, documentoId: number | null, atorId: number, acao: string, detalhe?: Record<string, unknown>) {
  await db.execute(sql`INSERT INTO profissional_documento_auditoria (empresa_id, documento_id, professional_id, ator_id, acao, detalhe)
    VALUES (${empresaId}, ${documentoId}, ${professionalId}, ${atorId}, ${acao}, ${detalhe ? JSON.stringify(detalhe) : null}::jsonb)`);
}

const projetar = (r: Record<string, any>) => ({
  id: Number(r.id), tipo: String(r.tipo), titulo: String(r.titulo), nomeOriginal: String(r.nome_original), mime: String(r.mime),
  tamanhoBytes: Number(r.tamanho_bytes), situacao: String(r.situacao), titularDeclarado: r.titular_declarado ?? null,
  observacao: r.observacao ?? null, enviadoPor: r.enviado_por == null ? null : Number(r.enviado_por), criadoEm: r.criado_em, arquivadoEm: r.arquivado_em ?? null,
});

export async function listarDocumentos(empresaId: number, professionalId: number, incluirArquivados = false) {
  const docs = (await db.execute(sql`SELECT * FROM profissional_documentos WHERE empresa_id=${empresaId} AND professional_id=${professionalId}
    AND (${incluirArquivados}::boolean OR situacao <> 'arquivado') ORDER BY id DESC`)).rows;
  const ids = docs.map((d) => Number(d.id));
  const dados = ids.length ? (await db.execute(sql`SELECT documento_id, campo, valor, status, valor_anterior FROM profissional_documento_dados
    WHERE documento_id = ANY(${`{${ids.join(",")}}`}::int[]) ORDER BY id`)).rows : [];
  return docs.map((d) => ({
    ...projetar(d),
    dados: dados.filter((x) => Number(x.documento_id) === Number(d.id)).map((x) => ({
      campo: String(x.campo), valor: String(x.valor), status: String(x.status), valorAnterior: x.valor_anterior ?? null })),
  }));
}

export async function enviarDocumento(a: {
  empresaId: number; professionalId: number; ator: number; arquivo: Buffer; nomeOriginal: string;
  tipo: TipoDocumento; titulo?: string; titularDeclarado?: string | null; observacao?: string | null;
  situacaoInicial?: "pendente_confirmacao" | "titular_divergente";
}) {
  if (!a.arquivo.length) throw new DocumentoErro(400, "Arquivo vazio.", "arquivo_vazio");
  if (a.arquivo.length > MAX_BYTES) throw new DocumentoErro(413, "Arquivo maior que 10 MB.", "arquivo_grande");
  const tipoReal = detectarTipo(a.arquivo);
  if (!tipoReal) throw new DocumentoErro(415, "Envie PDF, PNG, JPEG ou WebP. O conteúdo do arquivo não corresponde a nenhum desses tipos.", "tipo_nao_aceito");
  const sha = createHash("sha256").update(a.arquivo).digest("hex");
  const dup = (await db.execute(sql`SELECT id FROM profissional_documentos WHERE professional_id=${a.professionalId} AND sha256=${sha} AND situacao <> 'arquivado'`)).rows[0];
  if (dup) throw new DocumentoErro(409, "Este mesmo arquivo já está anexado a este profissional.", "documento_duplicado");
  const caminho = `profissionais/documentos/${a.empresaId}/${a.professionalId}/${randomUUID()}.${tipoReal.ext}`;
  const storage = new ObjectStorageService();
  await storage.savePrivateObject(caminho, a.arquivo, tipoReal.mime);
  try {
    const nome = a.nomeOriginal.replace(/[\u0000-\u001f\\/]/g, "_").slice(0, 200) || `documento.${tipoReal.ext}`;
    const linha = (await db.execute(sql`INSERT INTO profissional_documentos
      (empresa_id, professional_id, tipo, titulo, nome_original, mime, tamanho_bytes, sha256, storage_path, situacao, titular_declarado, observacao, enviado_por)
      VALUES (${a.empresaId}, ${a.professionalId}, ${a.tipo}, ${(a.titulo?.trim() || nome).slice(0, 120)}, ${nome}, ${tipoReal.mime}, ${a.arquivo.length}, ${sha},
        ${caminho}, ${a.situacaoInicial ?? "pendente_confirmacao"}, ${a.titularDeclarado?.trim().slice(0, 160) || null}, ${a.observacao?.trim().slice(0, 500) || null}, ${a.ator})
      RETURNING *`)).rows[0];
    await auditarDocumento(a.empresaId, a.professionalId, Number(linha.id), a.ator, "enviou", { tipo: a.tipo, mime: tipoReal.mime, bytes: a.arquivo.length, sha256: sha });
    return projetar(linha);
  } catch (e) {
    await storage.deletePrivateObject(caminho).catch(() => undefined); // não deixa arquivo órfão se o registro falhou
    throw e;
  }
}

export async function lerArquivo(empresaId: number, professionalId: number, documentoId: number) {
  const d = (await db.execute(sql`SELECT * FROM profissional_documentos WHERE id=${documentoId} AND empresa_id=${empresaId} AND professional_id=${professionalId}`)).rows[0];
  if (!d) throw new DocumentoErro(404, "Documento não encontrado.", "documento_nao_encontrado");
  const buffer = await new ObjectStorageService().readPrivateObject(String(d.storage_path));
  const hash = createHash("sha256").update(buffer).digest("hex");
  if (hash !== d.sha256) throw new DocumentoErro(500, "O arquivo guardado não confere com o registro; não foi exibido.", "arquivo_corrompido");
  return { buffer, mime: String(d.mime), nome: String(d.nome_original), linha: d };
}

export async function mudarSituacao(empresaId: number, professionalId: number, documentoId: number, ator: number,
  situacao: (typeof SITUACOES)[number], observacao?: string | null) {
  const r = (await db.execute(sql`UPDATE profissional_documentos SET situacao=${situacao},
      observacao=COALESCE(${observacao?.trim().slice(0, 500) || null}, observacao),
      arquivado_em=${situacao === "arquivado" ? sql`now()` : null}, arquivado_por=${situacao === "arquivado" ? ator : null}
    WHERE id=${documentoId} AND empresa_id=${empresaId} AND professional_id=${professionalId} RETURNING *`)).rows[0];
  if (!r) throw new DocumentoErro(404, "Documento não encontrado.", "documento_nao_encontrado");
  await auditarDocumento(empresaId, professionalId, documentoId, ator, `situacao_${situacao}`);
  return projetar(r);
}

const CAMPOS_SUGERIDOS = ["nome", "registro_conselho", "registro_numero", "registro_uf", "habilitacao", "naturalidade", "filiacao", "data_nascimento", "validade"] as const;
const HABILITACOES = ["enfermeiro", "tecnico_enfermagem", "auxiliar_enfermagem"];

/** Sugestões lidas do documento: ficam como "sugerido" até alguém aceitar. Aceitar é a única forma de gravar no cadastro. */
export async function sugerirDados(empresaId: number, professionalId: number, documentoId: number, ator: number, dados: { campo: string; valor: string }[]) {
  const d = (await db.execute(sql`SELECT id FROM profissional_documentos WHERE id=${documentoId} AND empresa_id=${empresaId} AND professional_id=${professionalId}`)).rows[0];
  if (!d) throw new DocumentoErro(404, "Documento não encontrado.", "documento_nao_encontrado");
  for (const x of dados) {
    if (!(CAMPOS_SUGERIDOS as readonly string[]).includes(x.campo)) throw new DocumentoErro(400, `Campo não aceito: ${x.campo}.`, "campo_invalido");
    if (!x.valor.trim()) throw new DocumentoErro(400, "Valor vazio não é sugestão.", "valor_vazio");
    await db.execute(sql`INSERT INTO profissional_documento_dados (documento_id, campo, valor) VALUES (${documentoId}, ${x.campo}, ${x.valor.trim().slice(0, 200)})
      ON CONFLICT (documento_id, campo) DO UPDATE SET valor=EXCLUDED.valor, status='sugerido', revisado_por=NULL, revisado_em=NULL
      WHERE profissional_documento_dados.status = 'sugerido'`);
  }
  await auditarDocumento(empresaId, professionalId, documentoId, ator, "sugeriu_dados", { campos: dados.map((x) => x.campo) });
}

export async function revisarDado(empresaId: number, professionalId: number, documentoId: number, ator: number, campo: string, acao: "aceitar" | "recusar") {
  return db.transaction(async (tx) => {
    const d = (await tx.execute(sql`SELECT dd.* FROM profissional_documento_dados dd JOIN profissional_documentos p ON p.id=dd.documento_id
      WHERE dd.documento_id=${documentoId} AND dd.campo=${campo} AND p.empresa_id=${empresaId} AND p.professional_id=${professionalId} FOR UPDATE OF dd`)).rows[0];
    if (!d) throw new DocumentoErro(404, "Sugestão não encontrada.", "sugestao_nao_encontrada");
    if (d.status !== "sugerido") throw new DocumentoErro(409, "Esta sugestão já foi revisada.", "sugestao_ja_revisada");
    let anterior: string | null = null;
    if (acao === "aceitar") {
      const valor = String(d.valor);
      const atual = (await tx.execute(sql`SELECT registration_council, registration_number, habilitacao_nivel FROM professionals WHERE id=${professionalId} FOR UPDATE`)).rows[0];
      if (campo === "registro_conselho") { anterior = (atual.registration_council as string | null) ?? null; await tx.execute(sql`UPDATE professionals SET registration_council=${valor} WHERE id=${professionalId}`); }
      else if (campo === "registro_numero") { anterior = (atual.registration_number as string | null) ?? null; await tx.execute(sql`UPDATE professionals SET registration_number=${valor} WHERE id=${professionalId}`); }
      else if (campo === "habilitacao") {
        if (!HABILITACOES.includes(valor)) throw new DocumentoErro(422, "Habilitação deve ser enfermeiro, tecnico_enfermagem ou auxiliar_enfermagem.", "habilitacao_invalida");
        anterior = (atual.habilitacao_nivel as string | null) ?? null;
        await tx.execute(sql`UPDATE professionals SET habilitacao_nivel=${valor} WHERE id=${professionalId}`);
      }
    }
    await tx.execute(sql`UPDATE profissional_documento_dados SET status=${acao === "aceitar" ? "aceito" : "recusado"}, valor_anterior=${anterior},
      revisado_por=${ator}, revisado_em=now() WHERE id=${d.id}`);
    await tx.execute(sql`INSERT INTO profissional_documento_auditoria (empresa_id, documento_id, professional_id, ator_id, acao, detalhe)
      VALUES (${empresaId}, ${documentoId}, ${professionalId}, ${ator}, ${acao === "aceitar" ? "aceitou_dado" : "recusou_dado"}, ${JSON.stringify({ campo })}::jsonb)`);
    return { campo, status: acao === "aceitar" ? "aceito" : "recusado" };
  });
}
