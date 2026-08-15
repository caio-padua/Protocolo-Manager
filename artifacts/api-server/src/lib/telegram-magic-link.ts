/**
 * telegram-magic-link.ts
 *
 * LINK MÁGICO DO TELEGRAM — vinculação do paciente em um toque.
 *
 * Problema que resolve: o caminho antigo exigia que o paciente digitasse (ou
 * colasse) a senha de validação dentro do bot. Idoso, dedo grande, senha longa:
 * muita gente parava no meio.
 *
 * Como funciona:
 *   1. O sistema emite um token aleatório com validade e uso único e grava
 *      no cadastro do paciente (colunas telegram_magic_*).
 *   2. O e-mail de onboarding leva um botão para
 *      https://t.me/Paduaclinica_bot?start=<token>
 *   3. Ao tocar, o Telegram abre o bot e envia sozinho "/start <token>".
 *   4. O webhook consome o token de forma ATÔMICA e vincula o chat.
 *
 * Segurança:
 *   — Token de 24 bytes aleatórios (192 bits), alfabeto aceito pelo deep-link.
 *   — Uso único garantido pelo próprio UPDATE condicional (não há janela de
 *     corrida entre "ler" e "gastar": quem grava primeiro leva).
 *   — Validade curta; expirado não vincula.
 *   — A senha de validação continua funcionando como caminho alternativo.
 */

import { randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

/** Bot oficial da clínica. */
export const BOT_USERNAME = "Paduaclinica_bot";
export const BOT_LINK = `https://t.me/${BOT_USERNAME}`;

/** Validade padrão do link enviado por e-mail. */
export const VALIDADE_PADRAO_DIAS = 7;

/**
 * Gera o token no alfabeto que o deep-link do Telegram aceita
 * (A-Z, a-z, 0-9, "_" e "-", no máximo 64 caracteres).
 * base64url de 24 bytes = 32 caracteres, sem "=" de preenchimento.
 */
export function gerarToken(): string {
  return randomBytes(24).toString("base64url");
}

/** Monta a URL que vai no botão do e-mail. */
export function montarUrl(token: string): string {
  return `${BOT_LINK}?start=${token}`;
}

/**
 * Interpreta o texto recebido no webhook.
 * Aceita "/start", "/start TOKEN" e "/start@Paduaclinica_bot TOKEN".
 * payload só volta preenchido se tiver a cara de um token nosso.
 */
export function parseStart(texto: string): { isStart: boolean; payload: string | null } {
  const t = (texto ?? "").trim();
  if (!/^\/start(@\w+)?(\s|$)/i.test(t)) return { isStart: false, payload: null };
  const resto = t.replace(/^\/start(@\w+)?/i, "").trim();
  const bruto = resto.split(/\s+/)[0] ?? "";
  const valido = /^[A-Za-z0-9_-]{16,64}$/.test(bruto);
  return { isStart: true, payload: valido ? bruto : null };
}

export interface LinkMagico {
  token: string;
  url: string;
  expiraEm: Date;
}

/**
 * Emite (ou reemite) o link mágico do paciente.
 * Reemitir invalida o anterior de propósito: o e-mail mais novo é o que vale.
 * Retorna null se o cliente não existir.
 */
export async function emitirLinkMagico(
  clienteId: number,
  validadeDias: number = VALIDADE_PADRAO_DIAS,
): Promise<LinkMagico | null> {
  const token = gerarToken();
  const { rows } = await db.execute<{ expira: string }>(sql`
    UPDATE clients
       SET telegram_magic_token      = ${token},
           telegram_magic_expira_em  = now() + make_interval(days => ${validadeDias}),
           telegram_magic_usado_em   = NULL
     WHERE id = ${clienteId}
     RETURNING telegram_magic_expira_em AS expira
  `);
  const linha = rows[0];
  if (!linha) return null;
  return { token, url: montarUrl(token), expiraEm: new Date(linha.expira) };
}

export type ResultadoConsumo =
  | { status: "vinculado"; clienteId: number; nome: string }
  | { status: "expirado" }
  | { status: "usado" }
  | { status: "ja_vinculado" }
  | { status: "colisao" }
  | { status: "desconhecido" };

/**
 * Consome o token e vincula o chat ao paciente — de forma atômica.
 *
 * As quatro travas moram DENTRO do mesmo UPDATE, porque não pode existir
 * janela entre "ler" e "gastar" (dois toques simultâneos disputam a linha):
 *   1. telegram_magic_usado_em IS NULL   → o token vale uma única vez;
 *   2. telegram_magic_expira_em > now()  → link vencido não vincula;
 *   3. telegram_chat_id IS NULL          → um link ainda válido NUNCA rouba um
 *      cadastro que já tem Telegram ativo; trocar de aparelho é ato deliberado,
 *      feito pela equipe, e não por quem tiver um e-mail antigo na mão;
 *   4. índice único parcial em telegram_chat_id (no banco) → o mesmo celular
 *      não vira dois pacientes quando dois tokens diferentes são tocados no
 *      mesmo aparelho ao mesmo tempo. A violação vira recusa, nunca erro 500.
 */
export async function consumirLinkMagico(
  token: string,
  chatId: string,
): Promise<ResultadoConsumo> {
  let rows: Array<{ id: number; name: string }>;
  try {
    ({ rows } = await db.execute<{ id: number; name: string }>(sql`
      UPDATE clients
         SET telegram_chat_id        = ${chatId},
             telegram_vinculado_em   = now(),
             telegram_magic_usado_em = now()
       WHERE telegram_magic_token     = ${token}
         AND telegram_magic_usado_em IS NULL
         AND telegram_magic_expira_em > now()
         AND telegram_chat_id IS NULL
       RETURNING id, name
    `));
  } catch (e) {
    // 23505 = violação de índice único: este chat já pertence a outro cadastro.
    if ((e as { code?: string })?.code === "23505") return { status: "colisao" };
    throw e;
  }

  const vinculado = rows[0];
  if (vinculado) {
    return { status: "vinculado", clienteId: vinculado.id, nome: vinculado.name };
  }

  // Não vinculou: diz honestamente o porquê, para a mensagem ao paciente ser útil.
  const { rows: diag } = await db.execute<{
    usado: string | null; expirado: boolean; javinculado: boolean;
  }>(sql`
    SELECT telegram_magic_usado_em AS usado,
           (telegram_magic_expira_em <= now()) AS expirado,
           (telegram_chat_id IS NOT NULL)      AS javinculado
      FROM clients
     WHERE telegram_magic_token = ${token}
     LIMIT 1
  `);
  const linha = diag[0];
  if (!linha) return { status: "desconhecido" };
  if (linha.usado) return { status: "usado" };
  if (linha.javinculado) return { status: "ja_vinculado" };
  return { status: "expirado" };
}
