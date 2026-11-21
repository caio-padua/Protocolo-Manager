import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { brtISODate } from "./brt.js";

/**
 * ANAMNESE DE RETORNO: o que vem do cadastro e o que nunca pode ser retirado.
 * Identidade (nome 1, CPF 2, idade 41) vem do cadastro autenticado: nao e pergunta de evolucao.
 * Fatos de cirurgia (8, 9, 88, 315) so crescem: o cliente acrescenta, nunca retira.
 * Identidade de pergunta = id numerico do questionario (question_row_id); pergunta_id REPETE.
 */
export const IDENTIDADE_IDS: readonly number[] = [1, 2, 41];
export const CIRURGIA_IDS: readonly number[] = [8, 9, 88, 315];
export const ehIdentidade = (id: number) => IDENTIDADE_IDS.includes(id);
export const ehCirurgia = (id: number) => CIRURGIA_IDS.includes(id);

export type ValorResposta = Record<string, unknown> & { tipo?: string };

const norm = (s: unknown) => String(s ?? "").normalize("NFD").replace(/\p{M}/gu, "").trim().toLowerCase();
const SEM_FATO = new Set(["", "nao", "nenhuma", "nenhum", "nada", "n/a", "-", "nunca"]);
const ehNegacao = (s: string) => SEM_FATO.has(norm(s)) || /^nunca\b/.test(norm(s));

/** Idade em anos completos na data (BRT) a partir da data de nascimento AAAA-MM-DD ou DD/MM/AAAA. */
export function idadeDe(nascimento: string | null | undefined, hojeISO: string = brtISODate()): number | null {
  if (!nascimento) return null;
  const t = nascimento.trim();
  let y: number, m: number, d: number;
  let r = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (r) { y = +r[1]; m = +r[2]; d = +r[3]; } else if ((r = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(t))) { d = +r[1]; m = +r[2]; y = +r[3]; } else return null;
  const h = /^(\d{4})-(\d{2})-(\d{2})/.exec(hojeISO);
  if (!h || m < 1 || m > 12 || d < 1 || d > 31) return null;
  let idade = +h[1] - y;
  if (+h[2] < m || (+h[2] === m && +h[3] < d)) idade -= 1;
  return idade >= 0 && idade < 130 ? idade : null;
}

export function mascararCpf(cpf: string | null | undefined): string | null {
  const dig = (cpf ?? "").replace(/\D/g, "");
  if (dig.length !== 11) return dig ? "***" : null;
  return `${dig.slice(0, 3)}.***.***-${dig.slice(9)}`;
}

/** O novo valor RETIRA algum fato que o valor anterior (ja concluido) tinha? */
export function retiraFato(base: ValorResposta | undefined, novo: ValorResposta): boolean {
  if (!base || typeof base !== "object") return false;
  switch (base.tipo) {
    case "multi": {
      const antes = (Array.isArray(base.selecionados) ? base.selecionados : []).map(String).filter((x) => !ehNegacao(x));
      if (antes.length === 0) return false;
      const depois = new Set((novo.tipo === "multi" && Array.isArray(novo.selecionados) ? novo.selecionados : []).map(norm));
      return antes.some((x) => !depois.has(norm(x)));
    }
    case "texto": {
      const antes = norm(base.texto);
      if (ehNegacao(antes)) return false;
      return novo.tipo !== "texto" || !norm(novo.texto).includes(antes);
    }
    case "boolean":
      return base.bool === true && !(novo.tipo === "boolean" && novo.bool === true);
    case "single":
      return norm(base.opcao) === "sim" && !(novo.tipo === "single" && norm(novo.opcao) === "sim");
    default:
      return false;
  }
}

/** Fatos de cirurgia da ULTIMA anamnese concluida do mesmo cliente (fora a sessao atual). */
export async function fatosBloqueados(clientId: number, sessaoId: number): Promise<Map<number, ValorResposta>> {
  const ant = (await db.execute(sql`SELECT id FROM anamnese_sessions WHERE client_id=${clientId} AND status IN ('concluida','concluido') AND id<>${sessaoId} ORDER BY completed_at DESC NULLS LAST, id DESC LIMIT 1`)).rows[0] as { id: number } | undefined;
  const out = new Map<number, ValorResposta>();
  if (!ant) return out;
  const rows = (await db.execute(sql`SELECT question_row_id, valor FROM anamnese_session_answers WHERE session_id=${ant.id} AND question_row_id IN (${sql.join(CIRURGIA_IDS.map((i) => sql`${i}`), sql`,`)})`)).rows as Array<{ question_row_id: number; valor: ValorResposta }>;
  for (const r of rows) out.set(Number(r.question_row_id), r.valor);
  return out;
}

export interface IdentidadeCadastro { nome: string | null; cpfMascarado: string | null; dataNascimento: string | null; idade: number | null; sexoBiologico: "M" | "F" | null }

/** Pergunta A04 (sexo biologico). Sexo nao se edita: depois de gravado no cadastro, a anamnese so le. */
export const SEXO_QUESTION_ID = 42;

let colunasSexoProntas: Promise<void> | null = null;
/** Colunas aditivas (fora do Drizzle): sexo do cadastro e referencia/motivo das perguntas. Idempotente. */
export function garantirColunasSexoReferencia(): Promise<void> {
  colunasSexoProntas ??= (async () => {
    await db.execute(sql`ALTER TABLE clients ADD COLUMN IF NOT EXISTS sexo_biologico text`);
    await db.execute(sql`DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='clients_sexo_biologico_chk') THEN
        ALTER TABLE clients ADD CONSTRAINT clients_sexo_biologico_chk CHECK (sexo_biologico IS NULL OR sexo_biologico IN ('M','F'));
      END IF; END $$`);
    await db.execute(sql`ALTER TABLE anamnese_questionario ADD COLUMN IF NOT EXISTS referencia jsonb`);
  })().catch((e) => { colunasSexoProntas = null; throw e; });
  return colunasSexoProntas;
}

export async function sexoDoCadastro(clientId: number): Promise<"M" | "F" | null> {
  await garantirColunasSexoReferencia();
  const r = (await db.execute(sql`SELECT sexo_biologico FROM clients WHERE id=${clientId}`)).rows[0] as { sexo_biologico: string | null } | undefined;
  return r?.sexo_biologico === "M" || r?.sexo_biologico === "F" ? r.sexo_biologico : null;
}

/** Converte a resposta da A04 em M/F; qualquer outra coisa vira null (nunca inventa). */
export function sexoDaResposta(valor: unknown): "M" | "F" | null {
  const v = valor as { tipo?: string; valor?: unknown; opcao?: unknown } | null;
  if (!v || v.tipo !== "single") return null;
  const t = String(v.valor ?? v.opcao ?? "").trim().toUpperCase();
  return t === "M" || t === "MASCULINO" ? "M" : t === "F" || t === "FEMININO" ? "F" : null;
}

/** Grava o sexo SOMENTE se o cadastro ainda estiver vazio. Nunca sobrescreve. Retorna true se gravou. */
export async function gravarSexoSeVazio(clientId: number, sexo: "M" | "F"): Promise<boolean> {
  await garantirColunasSexoReferencia();
  const r = await db.execute(sql`UPDATE clients SET sexo_biologico=${sexo} WHERE id=${clientId} AND sexo_biologico IS NULL`);
  return (r.rowCount ?? 0) > 0;
}
export async function identidadeDoCadastro(clientId: number): Promise<IdentidadeCadastro | null> {
  await garantirColunasSexoReferencia();
  const c = (await db.execute(sql`SELECT name, cpf, birth_date, sexo_biologico FROM clients WHERE id=${clientId}`)).rows[0] as { name: string | null; cpf: string | null; birth_date: string | null; sexo_biologico: string | null } | undefined;
  if (!c) return null;
  const sexo = c.sexo_biologico === "M" || c.sexo_biologico === "F" ? c.sexo_biologico : null;
  return { nome: c.name, cpfMascarado: mascararCpf(c.cpf), dataNascimento: c.birth_date, idade: idadeDe(c.birth_date), sexoBiologico: sexo };
}

let tabelaPronta: Promise<void> | null = null;
/** Pedidos de correcao de fato registrado: tabela propria, aditiva; o historico nunca e alterado. */
export function garantirTabelaCorrecoes(): Promise<void> {
  tabelaPronta ??= (async () => {
    await db.execute(sql`CREATE TABLE IF NOT EXISTS anamnese_correcoes (
      id SERIAL PRIMARY KEY,
      client_id integer NOT NULL,
      empresa_id integer,
      session_id integer NOT NULL,
      question_row_id integer NOT NULL,
      texto text NOT NULL,
      status text NOT NULL DEFAULT 'pendente',
      criado_em timestamptz NOT NULL DEFAULT now(),
      resolvido_em timestamptz,
      resolvido_por integer,
      nota_profissional text
    )`);
  })().catch((e) => { tabelaPronta = null; throw e; });
  return tabelaPronta;
}

let indiceRascunhoPronto: Promise<void> | null = null;
/** Um unico rascunho de paciente por cliente: impede duas sessoes abertas por corrida de requisicoes. Aditivo. */
export function garantirIndiceRascunhoUnico(): Promise<void> {
  indiceRascunhoPronto ??= (async () => {
    await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS anamnese_sessions_rascunho_paciente_unico
      ON anamnese_sessions (client_id) WHERE status = 'rascunho' AND mode = 'paciente' AND client_id IS NOT NULL`);
  })().catch((e) => { indiceRascunhoPronto = null; throw e; });
  return indiceRascunhoPronto;
}

/**
 * Sessao orfa = rascunho publico sem cliente identificado, sem nenhuma resposta e parado ha mais de N dias.
 * NAO apaga: muda o estado para 'abandonada' (reversivel). Sessao orfa COM respostas nunca e tocada.
 */
export async function marcarSessoesOrfas(dias = 7): Promise<number> {
  const r = await db.execute(sql`UPDATE anamnese_sessions s SET status='abandonada', updated_at=now()
    WHERE s.client_id IS NULL AND s.mode='paciente' AND s.status='rascunho'
      AND coalesce(s.last_seen_at, s.started_at) < now() - (${dias} * interval '1 day')
      AND NOT EXISTS (SELECT 1 FROM anamnese_session_answers a WHERE a.session_id = s.id)
    RETURNING s.id`);
  return r.rows.length;
}
