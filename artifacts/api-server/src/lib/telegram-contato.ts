// Regras do primeiro contato pelo Telegram (cliente ou visitante).
// Sem acesso a banco aqui, exceto onde indicado, para ser fácil de testar.
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

/** Texto natural, sem dado pessoal, quando o chat ainda não está vinculado e o atendimento aberto está desligado. */
export const MENSAGEM_PRIMEIRO_CONTATO =
  "Olá! Este é o atendimento do Instituto Pádua.\n\n" +
  "Se você já é nosso cliente, peça à equipe o seu link individual: com um toque o seu Telegram fica ligado ao seu cadastro. " +
  "Se preferir, envie aqui o código de validação do seu cadastro. Esse código é da clínica, não é a senha do Telegram.\n\n" +
  "Se ainda não é cliente, a equipe responde por aqui assim que o atendimento estiver aberto.";

/** Código igual ao de mais de um cadastro: nunca vincula, orienta o caminho seguro. */
export const MENSAGEM_CODIGO_REPETIDO =
  "Este código aparece em mais de um cadastro, por isso não consegui ligar com segurança. " +
  "Peça à equipe o seu link individual: ele é só seu e resolve em um toque.";

/** Quantas mensagens de um mesmo visitante por hora a assistente aceita antes de apenas registrar. */
export const LIMITE_MENSAGENS_VISITANTE_HORA = 30;

/** Quantos cadastros ATIVOS têm este código de validação (maiúsculas, sem espaços nas pontas). */
export async function contarCadastrosComCodigo(codigo: string, excetoClienteId?: number): Promise<number> {
  const c = codigo.trim().toUpperCase();
  if (!c) return 0;
  const r = await db.execute(sql`SELECT COUNT(*)::int AS n FROM clients
    WHERE status = 'active' AND upper(btrim(validation_password)) = ${c}
      ${excetoClienteId !== undefined ? sql`AND id <> ${excetoClienteId}` : sql``}`);
  return Number((r.rows[0] as { n: number | string }).n);
}

/**
 * Procura o cadastro ATIVO cujo código de validação foi digitado. Devolve o único
 * cadastro, "ambiguo" se mais de um tiver o mesmo código (nunca vincula) ou null.
 */
export async function buscarCadastroPorCodigo(
  candidatos: Iterable<string>,
): Promise<{ id: number; name: string } | "ambiguo" | null> {
  const lista = [...new Set([...candidatos].map((c) => c.trim().toUpperCase()).filter(Boolean))].slice(0, 12);
  if (lista.length === 0) return null;
  const achados = await db.execute(sql`SELECT id, name FROM clients
    WHERE status = 'active' AND validation_password IS NOT NULL
      AND upper(btrim(validation_password)) IN (${sql.join(lista.map((c) => sql`${c}`), sql`, `)})
    LIMIT 3`);
  const rows = achados.rows as Array<{ id: number; name: string }>;
  if (rows.length === 1) return { id: rows[0].id, name: rows[0].name };
  return rows.length > 1 ? "ambiguo" : null;
}
