import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Link NOVO de exame (v1): assinado (HMAC), com escopo "exame", validade e vínculo com a pessoa.
 * Não guarda o PDF nem dado clínico no token: só id do documento, id do cliente e vencimento.
 * Revogação fica no banco (exam_request_pdfs.revogado_em); o token sozinho não prova que ainda vale.
 * Links LEGADOS (48 hexadecimais, sem validade) seguem valendo; ver docs/exame-link-migracao.md.
 */
const SEGREDO = process.env.SESSION_SECRET || randomBytes(32).toString("hex");
export const EXAME_LINK_TTL_DIAS_PADRAO = 30;
const ESCOPO = "exame";

export type ResultadoToken =
  | { ok: true; pdfId: number; clientId: number; expiraEm: number }
  | { ok: false; motivo: "formato" | "assinatura" | "expirado" };

const assinar = (payload: string) => createHmac("sha256", SEGREDO).update(payload).digest("base64url");

export function criarTokenExame(p: { pdfId: number; clientId: number; ttlDias?: number; agora?: number }): string {
  const exp = (p.agora ?? Date.now()) + (p.ttlDias ?? EXAME_LINK_TTL_DIAS_PADRAO) * 86_400_000;
  const payload = Buffer.from(`${ESCOPO}:${p.pdfId}:${p.clientId}:${exp}`).toString("base64url");
  return `v1.${payload}.${assinar(`v1.${payload}`)}`;
}

export function verificarTokenExame(token: string, agora = Date.now()): ResultadoToken {
  const partes = token.split(".");
  if (partes.length !== 3 || partes[0] !== "v1" || partes[1].length > 200) return { ok: false, motivo: "formato" };
  const esperado = Buffer.from(assinar(`v1.${partes[1]}`));
  const recebido = Buffer.from(partes[2]);
  if (esperado.length !== recebido.length || !timingSafeEqual(esperado, recebido)) return { ok: false, motivo: "assinatura" };
  const [escopo, pdf, cli, exp] = Buffer.from(partes[1], "base64url").toString().split(":");
  const pdfId = Number(pdf), clientId = Number(cli), expiraEm = Number(exp);
  if (escopo !== ESCOPO || !Number.isSafeInteger(pdfId) || !Number.isSafeInteger(clientId) || !Number.isFinite(expiraEm)) return { ok: false, motivo: "formato" };
  if (agora > expiraEm) return { ok: false, motivo: "expirado" };
  return { ok: true, pdfId, clientId, expiraEm };
}

export const ehTokenLegado = (t: string) => /^[a-f0-9]{48}$/.test(t);
export const ehTokenNovo = (t: string) => t.startsWith("v1.");

/** Decisão pura sobre a linha do documento (testável sem banco). */
export function decidirAcessoExame(
  token: ResultadoToken, linha: { id: number; clientId: number; revogadoEm: Date | null } | undefined,
): "liberar" | "negar_invalido" | "negar_expirado" | "negar_revogado" | "negar_inexistente" {
  if (!token.ok) return token.motivo === "expirado" ? "negar_expirado" : "negar_invalido";
  if (!linha || linha.id !== token.pdfId) return "negar_inexistente";
  if (linha.clientId !== token.clientId) return "negar_invalido"; // token de uma pessoa não abre documento de outra
  if (linha.revogadoEm) return "negar_revogado";
  return "liberar";
}

/** O link novo só é emitido se a operação decidir ligar (padrão: desligado = comportamento atual em produção). */
export const emissaoLinkNovoLigada = () => process.env.EXAME_LINK_NOVO === "1";

/** Token que vai na URL enviada: novo (com validade) só quando a operação liga EXAME_LINK_NOVO=1; senão o legado. */
export function tokenParaEnvio(row: { id: number; clientId: number; token: string }): string {
  return emissaoLinkNovoLigada() ? criarTokenExame({ pdfId: row.id, clientId: row.clientId }) : row.token;
}
