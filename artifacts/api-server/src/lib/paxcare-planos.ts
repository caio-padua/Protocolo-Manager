/**
 * Planos PaxCare (B2C): catalogo configuravel, contratacao com aceite e franquia.
 * Separado do PAM/beneficios da clinica (client_member_beneficios): nada aqui concede beneficio de clinica.
 * Nenhum valor e inventado: preco, franquia, excedente e desconto nascem vazios (NULL).
 */
import { createHash } from "node:crypto";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { brtISODate } from "./brt";

export type PlanoStatus = "rascunho" | "ativo" | "encerrado";
export type Periodo = "mensal" | "anual";

export interface Plano {
  id: number; nome: string; descricao: string | null; status: PlanoStatus; gratuito: boolean;
  preco_centavos: number | null; periodicidade: Periodo | null;
  franquia_qtd: number | null; franquia_unidade: string | null; franquia_periodo: Periodo | null;
  preco_excedente_centavos: number | null; desconto_excedente_pct: string | number | null;
  beneficios: string[]; termo_aceite: string | null;
}

export async function ensurePaxcarePlanosTables(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS paxcare_planos (
      id SERIAL PRIMARY KEY,
      nome TEXT NOT NULL,
      descricao TEXT,
      status TEXT NOT NULL DEFAULT 'rascunho',
      gratuito BOOLEAN NOT NULL DEFAULT FALSE,
      preco_centavos INTEGER,
      periodicidade TEXT,
      franquia_qtd INTEGER,
      franquia_unidade TEXT,
      franquia_periodo TEXT,
      preco_excedente_centavos INTEGER,
      desconto_excedente_pct NUMERIC(5,2),
      beneficios JSONB NOT NULL DEFAULT '[]'::jsonb,
      termo_aceite TEXT,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT paxcare_planos_status_ck CHECK (status IN ('rascunho','ativo','encerrado')),
      CONSTRAINT paxcare_planos_per_ck CHECK (periodicidade IS NULL OR periodicidade IN ('mensal','anual')),
      CONSTRAINT paxcare_planos_fper_ck CHECK (franquia_periodo IS NULL OR franquia_periodo IN ('mensal','anual')),
      CONSTRAINT paxcare_planos_valores_ck CHECK (
        (preco_centavos IS NULL OR preco_centavos >= 0) AND (franquia_qtd IS NULL OR franquia_qtd >= 0)
        AND (preco_excedente_centavos IS NULL OR preco_excedente_centavos >= 0)
        AND (desconto_excedente_pct IS NULL OR (desconto_excedente_pct >= 0 AND desconto_excedente_pct <= 100)))
    )`);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS paxcare_assinaturas (
      id SERIAL PRIMARY KEY,
      client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      plano_id INTEGER NOT NULL REFERENCES paxcare_planos(id),
      status TEXT NOT NULL DEFAULT 'ativa',
      ambiente TEXT NOT NULL DEFAULT 'teste',
      aceite_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      aceite_termo TEXT NOT NULL,
      aceite_hash TEXT NOT NULL,
      plano_snapshot JSONB NOT NULL,
      cobranca_status TEXT NOT NULL DEFAULT 'sem_cobranca',
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      cancelado_em TIMESTAMPTZ,
      CONSTRAINT paxcare_assin_status_ck CHECK (status IN ('ativa','cancelada')),
      CONSTRAINT paxcare_assin_amb_ck CHECK (ambiente IN ('teste','real')),
      CONSTRAINT paxcare_assin_cob_ck CHECK (cobranca_status IN ('sem_cobranca','pendente_integracao'))
    )`);
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS ux_paxcare_assin_ativa ON paxcare_assinaturas (client_id) WHERE status = 'ativa'`);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS paxcare_consumo (
      id SERIAL PRIMARY KEY,
      assinatura_id INTEGER NOT NULL REFERENCES paxcare_assinaturas(id),
      periodo_ref TEXT NOT NULL,
      qtd INTEGER NOT NULL,
      chave_idem TEXT NOT NULL,
      dentro_franquia INTEGER NOT NULL,
      excedente INTEGER NOT NULL,
      valor_excedente_centavos INTEGER,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT paxcare_consumo_qtd_ck CHECK (qtd > 0)
    )`);
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS ux_paxcare_consumo_idem ON paxcare_consumo (assinatura_id, chave_idem)`);
}

export const hashTermo = (t: string) => createHash("sha256").update(t).digest("hex");

/** Hash da oferta COMPLETA (preco, periodo, franquia, excedente, desconto, beneficios e termo): mudou qualquer condicao, o aceite antigo vale nada. */
export function hashOferta(p: Plano): string {
  const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  return hashTermo(JSON.stringify([p.id, p.nome, p.gratuito, p.preco_centavos, p.periodicidade, p.franquia_qtd, p.franquia_unidade,
    p.franquia_periodo, p.preco_excedente_centavos, num(p.desconto_excedente_pct), p.beneficios, p.termo_aceite ?? ""]));
}

/** Plano so pode ficar ativo com o que o paciente precisa ler: nome, termo e (gratuito OU preco+periodicidade). */
export function pendenciasParaAtivar(p: Pick<Plano, "nome" | "termo_aceite" | "gratuito" | "preco_centavos" | "periodicidade" | "franquia_qtd" | "franquia_unidade" | "franquia_periodo">): string[] {
  const m: string[] = [];
  if (!p.nome?.trim()) m.push("nome");
  if (!p.termo_aceite?.trim()) m.push("termo de aceite");
  if (p.gratuito) {
    if (p.preco_centavos) m.push("plano gratuito não pode ter preço");
  } else {
    if (p.preco_centavos === null) m.push("preço");
    if (!p.periodicidade) m.push("periodicidade");
  }
  if (p.franquia_qtd !== null && (!p.franquia_unidade?.trim() || !p.franquia_periodo)) m.push("unidade e período da franquia");
  return m;
}

export function periodoRef(periodo: Periodo, data = brtISODate()): string {
  return periodo === "anual" ? data.slice(0, 4) : data.slice(0, 7);
}

/** Divide o consumo entre franquia e excedente. Excedente sem preco cadastrado NAO pode ser consumido (nunca inventa valor). */
export function calcularConsumo(p: Pick<Plano, "franquia_qtd" | "preco_excedente_centavos" | "desconto_excedente_pct">, jaUsado: number, qtd: number):
  { ok: true; dentro: number; excedente: number; valorCentavos: number | null } | { ok: false; motivo: "SEM_EXCEDENTE_PRECIFICADO" } {
  if (p.franquia_qtd === null) return { ok: true, dentro: qtd, excedente: 0, valorCentavos: null }; // sem franquia: plano nao mede
  const restante = Math.max(0, p.franquia_qtd - jaUsado);
  const dentro = Math.min(qtd, restante);
  const excedente = qtd - dentro;
  if (excedente === 0) return { ok: true, dentro, excedente: 0, valorCentavos: null };
  if (p.preco_excedente_centavos === null) return { ok: false, motivo: "SEM_EXCEDENTE_PRECIFICADO" };
  const desc = Number(p.desconto_excedente_pct ?? 0);
  const valor = Math.round(excedente * p.preco_excedente_centavos * (1 - desc / 100));
  return { ok: true, dentro, excedente, valorCentavos: valor };
}

export type ResultadoConsumo =
  | { ok: true; repetido: boolean; dentro: number; excedente: number; valorCentavos: number | null }
  | { ok: false; motivo: "SEM_ASSINATURA" | "SEM_EXCEDENTE_PRECIFICADO" };

/** Registra consumo do paciente: idempotente por chave, serializado por assinatura (franquia nunca estoura em concorrencia). */
export async function registrarConsumo(clientId: number, qtd: number, chaveIdem: string): Promise<ResultadoConsumo> {
  return db.transaction(async (tx) => {
    const a = (await tx.execute(sql`SELECT id, plano_snapshot FROM paxcare_assinaturas WHERE client_id=${clientId} AND status='ativa'`)).rows[0] as { id: number; plano_snapshot: Plano } | undefined;
    if (!a) return { ok: false, motivo: "SEM_ASSINATURA" } as const;
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"paxcare-consumo:" + a.id}))`);
    const rep = (await tx.execute(sql`SELECT dentro_franquia, excedente, valor_excedente_centavos FROM paxcare_consumo WHERE assinatura_id=${a.id} AND chave_idem=${chaveIdem}`)).rows[0] as
      { dentro_franquia: number; excedente: number; valor_excedente_centavos: number | null } | undefined;
    if (rep) return { ok: true, repetido: true, dentro: rep.dentro_franquia, excedente: rep.excedente, valorCentavos: rep.valor_excedente_centavos } as const;
    const plano = a.plano_snapshot;
    const ref = periodoRef(plano.franquia_periodo ?? "mensal");
    const usado = (await tx.execute(sql`SELECT COALESCE(SUM(qtd),0)::int AS n FROM paxcare_consumo WHERE assinatura_id=${a.id} AND periodo_ref=${ref}`)).rows[0] as { n: number };
    const c = calcularConsumo(plano, usado.n, qtd);
    if (!c.ok) return c;
    await tx.execute(sql`INSERT INTO paxcare_consumo (assinatura_id, periodo_ref, qtd, chave_idem, dentro_franquia, excedente, valor_excedente_centavos)
      VALUES (${a.id}, ${ref}, ${qtd}, ${chaveIdem}, ${c.dentro}, ${c.excedente}, ${c.valorCentavos})`);
    return { ok: true, repetido: false, dentro: c.dentro, excedente: c.excedente, valorCentavos: c.valorCentavos } as const;
  });
}
