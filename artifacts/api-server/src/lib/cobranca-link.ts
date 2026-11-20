/**
 * Link publico de pagamento PaxMed: o cliente abre pelo celular, sem sessao.
 * Seguranca: token aleatorio (32 bytes) guardado so como hash SHA-256; valor, situacao e link de pagamento
 * vem SEMPRE do Asaas na hora da consulta (nunca de copia local); resposta sem nome, CPF ou e-mail.
 * A clinica vem do cadastro do cliente da cobranca (isolamento por clinica); sem consulta ao provedor = erro explicito.
 */
import { createHash, randomBytes } from "node:crypto";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { asaasGetCharge } from "./asaas.js";
import { baseUrlFromEnv } from "./messaging/base-url.js";
import { renderFlyerPaxmed } from "./flyer-paxmed.js";

export type SituacaoLink = "pendente" | "paga" | "vencida" | "cancelada" | "outra";
export interface LinkPublico {
  clinica: string;
  valor: number;
  valorFormatado: string;
  situacao: SituacaoLink;
  situacaoProvedor: string;
  vencimento: string | null;
  pagaEm: string | null;
  teste: boolean;
  /** Presente somente se pendente/vencida e o endereco for https do dominio do Asaas. */
  linkPagamento: string | null;
}
export class LinkIndisponivel extends Error {
  constructor(public codigo: 404 | 410 | 502, msg: string) { super(msg); }
}

export async function ensureCobrancaLinkTable(): Promise<void> {
  await db.execute(sql`CREATE TABLE IF NOT EXISTS cobranca_link_publico (
    token_hash TEXT PRIMARY KEY,
    origem TEXT NOT NULL CHECK (origem IN ('teste')),
    origem_id INTEGER NOT NULL,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revogado_em TIMESTAMPTZ
  )`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_cobranca_link_origem ON cobranca_link_publico (origem, origem_id)`);
}
const hash = (t: string) => createHash("sha256").update(t).digest("hex");
export const tokenValido = (t: string) => /^[A-Za-z0-9_-]{43}$/.test(t);

/** Emite um link novo (os anteriores continuam validos: a mensagem ja enviada nao pode quebrar). Nao cria cobranca nem envia nada. */
export async function emitirLinkTeste(cobrancaTesteId: number): Promise<string> {
  await ensureCobrancaLinkTable();
  const token = randomBytes(32).toString("base64url");
  await db.execute(sql`INSERT INTO cobranca_link_publico (token_hash, origem, origem_id) VALUES (${hash(token)}, 'teste', ${cobrancaTesteId})`);
  return `${baseUrlFromEnv()}/pagar/${token}`;
}

function situacaoDe(status: string, vencido: boolean): SituacaoLink {
  if (["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"].includes(status)) return "paga";
  if (["PENDING", "AWAITING_RISK_ANALYSIS"].includes(status)) return vencido ? "vencida" : "pendente";
  if (status === "OVERDUE") return "vencida";
  if (["REFUNDED", "DELETED", "CHARGEBACK_REQUESTED"].includes(status)) return "cancelada";
  return "outra";
}
const brl = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function enderecoAsaasSeguro(u: unknown): string | null {
  if (typeof u !== "string") return null;
  try {
    const x = new URL(u);
    return x.protocol === "https:" && /(^|\.)asaas\.com$/.test(x.hostname) ? x.toString() : null;
  } catch { return null; }
}

export async function consultarLink(token: string): Promise<LinkPublico> {
  if (!tokenValido(token)) throw new LinkIndisponivel(404, "Link nao encontrado.");
  await ensureCobrancaLinkTable();
  const l: any = (await db.execute(sql`SELECT origem_id, revogado_em FROM cobranca_link_publico WHERE token_hash=${hash(token)}`)).rows[0];
  if (!l) throw new LinkIndisponivel(404, "Link nao encontrado.");
  if (l.revogado_em) throw new LinkIndisponivel(410, "Este link foi revogado.");
  const c: any = (await db.execute(sql`
    SELECT t.asaas_charge_id, t.descricao, e.nome AS clinica
    FROM asaas_cobrancas_teste t
    JOIN clients cl ON cl.id = t.client_id
    JOIN empresas e ON e.id = cl.empresa_id
    WHERE t.id=${l.origem_id}`)).rows[0];
  if (!c?.asaas_charge_id) throw new LinkIndisponivel(404, "Cobranca nao encontrada.");
  let ch: any;
  try { ch = await asaasGetCharge(c.asaas_charge_id); }
  catch { throw new LinkIndisponivel(502, "Nao foi possivel consultar a situacao no provedor agora. Tente novamente em instantes."); }
  if (typeof ch?.value !== "number" || !ch?.status) throw new LinkIndisponivel(502, "Resposta incompleta do provedor.");
  const hoje = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10); // dia em Brasilia (UTC-3)
  const situacao = situacaoDe(String(ch.status), !!ch.dueDate && String(ch.dueDate) < hoje);
  return {
    clinica: String(c.clinica),
    valor: ch.value,
    valorFormatado: brl(ch.value),
    situacao,
    situacaoProvedor: String(ch.status),
    vencimento: ch.dueDate ?? null,
    pagaEm: ch.paymentDate ?? ch.clientPaymentDate ?? null,
    teste: String(c.descricao ?? "").length > 0,
    linkPagamento: situacao === "pendente" || situacao === "vencida" ? enderecoAsaasSeguro(ch.invoiceUrl) : null,
  };
}

const dataBR = (iso: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : null);
const ROTULO_SITUACAO: Record<SituacaoLink, string> = {
  pendente: "Aguardando pagamento", paga: "Pagamento confirmado", vencida: "Vencida", cancelada: "Cobrança cancelada", outra: "Em análise",
};

/** Flyer PNG do molde unico PaxMed com os dados AO VIVO do provedor. Campos fixos; ausente = "Não localizado".
 *  O Asaas informa so a DATA do pagamento; horario so entra se o provedor um dia enviar (hoje: Não localizado). */
export async function flyerDoLink(token: string): Promise<Buffer> {
  const d = await consultarLink(token);
  return renderFlyerPaxmed({
    titulo: "Pagamento",
    linhas: [
      { rotulo: "Situação", valor: ROTULO_SITUACAO[d.situacao] },
      { rotulo: "Valor", valor: d.valorFormatado },
      { rotulo: "Vencimento", valor: dataBR(d.vencimento) },
      { rotulo: "Data do pagamento", valor: dataBR(d.pagaEm) },
      { rotulo: "Horário do pagamento", valor: null },
    ],
    clinica: d.clinica,
  });
}
