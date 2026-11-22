import { eq, sql } from "drizzle-orm";
import { db, clientsTable } from "@workspace/db";
import { getSetting } from "./secure-settings";
import { sendTelegramBotaoWebApp } from "./telegram";
import { parseBrtParts } from "./brt";
import { logger } from "./logger";
import { jaRespondeuAPrincipal, NOTA_DO_PERIODO, ROTULO_NOTA, type PeriodoPulso } from "./pulso-perguntas";

/**
 * Lembrete automático do Pulso Diário pelo Telegram (um por período, no horário marcado).
 *   app_settings `pulso.lembrete.modo`        : desligado (padrão) | lista | ligado
 *   app_settings `pulso.lembrete.permitidos`  : JSON com ids de cliente (modo lista)
 *   app_settings `pulso.lembrete.horarios`    : JSON {"manha":"08:00","tarde":"15:00","noite":"20:00"}
 * Envia no horário marcado ou até TOLERANCIA_MIN minutos depois, nunca antes. Uma vez por cliente/dia/período
 * (tabela pulso_lembrete_envios). Não envia se a nota daquele período já foi respondida hoje.
 */
export const HORARIOS_PADRAO: Record<PeriodoPulso, string> = { manha: "08:00", tarde: "15:00", noite: "20:00" };
const TOLERANCIA_MIN = 10;
const PERIODOS: PeriodoPulso[] = ["manha", "tarde", "noite"];

const minutos = (hhmm: string): number | null => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

export async function lerConfigPulso(): Promise<{ modo: "desligado" | "lista" | "ligado"; permitidos: Set<number>; horarios: Record<PeriodoPulso, string> }> {
  const horarios = { ...HORARIOS_PADRAO };
  try {
    const m = (await getSetting("pulso.lembrete.modo"))?.trim().toLowerCase();
    const modo = m === "lista" || m === "ligado" ? m : "desligado";
    const permitidos = new Set<number>();
    const raw = await getSetting("pulso.lembrete.permitidos");
    if (raw) { const a: unknown = JSON.parse(raw); if (Array.isArray(a)) for (const v of a) if (Number.isSafeInteger(v) && v > 0) permitidos.add(v as number); }
    const h = await getSetting("pulso.lembrete.horarios");
    if (h) { const o = JSON.parse(h) as Record<string, string>; for (const p of PERIODOS) if (typeof o[p] === "string" && minutos(o[p]!) != null) horarios[p] = o[p]!; }
    return { modo, permitidos, horarios };
  } catch {
    return { modo: "desligado", permitidos: new Set(), horarios: HORARIOS_PADRAO };
  }
}

export function textoLembretePulso(nome: string, periodo: PeriodoPulso): string {
  const campo = NOTA_DO_PERIODO[periodo];
  const pedido = {
    sono: "Como foi o seu sono esta noite? Dê uma nota de 0 a 10.",
    energia: "Como está a sua energia hoje? Dê uma nota de 0 a 10.",
    libido: "Como foi o seu desejo nos últimos dias? Dê uma nota de 0 a 10. Responder é opcional.",
  }[campo];
  const saudacao = periodo === "manha" ? "Bom dia" : periodo === "tarde" ? "Boa tarde" : "Boa noite";
  return `${saudacao}${nome ? `, ${nome}` : ""}. ${pedido} Toque no botão abaixo; leva menos de um minuto. (${ROTULO_NOTA[campo]})`;
}

export function dominioMiniApp(): string | null {
  return process.env["PULSO_MINIAPP_DOMINIO"] || (process.env["REPLIT_DOMAINS"] ?? "").split(",")[0] || null;
}

const primeiroNome = (n: string) => { const p = n.trim().split(/\s+/)[0] ?? ""; return p ? p.charAt(0).toUpperCase() + p.slice(1).toLowerCase() : ""; };

export async function enviarLembretePulso(clienteId: number, periodo: PeriodoPulso): Promise<{ ok: boolean; erro?: string; simulado?: boolean }> {
  const [c] = await db.select({ nome: clientsTable.name, chat: clientsTable.telegramChatId }).from(clientsTable).where(eq(clientsTable.id, clienteId));
  if (!c?.chat) return { ok: false, erro: "cliente sem Telegram vinculado" };
  const dominio = dominioMiniApp();
  if (!dominio) return { ok: false, erro: "domínio público indisponível" };
  const r = await sendTelegramBotaoWebApp(c.chat, textoLembretePulso(primeiroNome(c.nome), periodo), { texto: "Registrar meu pulso", url: `https://${dominio}/pulso-telegram` });
  if (!r.sent) return { ok: false, erro: r.error ?? "falha no envio" };
  if (r.mock) return { ok: false, erro: "telegram_sem_token", simulado: true };
  return { ok: true };
}

let tabelaPronta = false;
async function garantirTabela() {
  if (tabelaPronta) return;
  await db.execute(sql`CREATE TABLE IF NOT EXISTS pulso_lembrete_envios (
    id serial PRIMARY KEY, cliente_id integer NOT NULL, data date NOT NULL, periodo text NOT NULL,
    status text NOT NULL DEFAULT 'PENDENTE', erro text, enviado_em timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT pulso_lembrete_envios_uk UNIQUE (cliente_id, data, periodo))`);
  tabelaPronta = true;
}

export async function executarLembretesPulso(): Promise<{ enviados: number; falhas: number; pulados: number }> {
  const cfg = await lerConfigPulso();
  const r = { enviados: 0, falhas: 0, pulados: 0 };
  if (cfg.modo === "desligado") return r;
  const p = parseBrtParts();
  const agora = Number(p.hour) * 60 + Number(p.minute);
  const periodo = PERIODOS.find((per) => { const alvo = minutos(cfg.horarios[per]); return alvo != null && agora - alvo >= 0 && agora - alvo <= TOLERANCIA_MIN; });
  if (!periodo) return r;
  await garantirTabela();
  const hoje = `${p.year}-${p.month}-${p.day}`;
  const alvos = cfg.modo === "ligado"
    ? (await db.select({ id: clientsTable.id }).from(clientsTable).where(sql`${clientsTable.telegramChatId} IS NOT NULL`)).map((x) => x.id)
    : [...cfg.permitidos];
  for (const id of alvos) {
    try {
      if (await jaRespondeuAPrincipal(id, hoje, periodo)) { r.pulados++; continue; }
      const claim = (await db.execute(sql`INSERT INTO pulso_lembrete_envios (cliente_id, data, periodo) VALUES (${id}, ${hoje}, ${periodo}) ON CONFLICT DO NOTHING RETURNING id`)).rows as Array<{ id: number }>;
      if (!claim[0]) { r.pulados++; continue; }
      const env = await enviarLembretePulso(id, periodo);
      if (env.ok) { r.enviados++; await db.execute(sql`UPDATE pulso_lembrete_envios SET status='ENVIADO' WHERE id=${claim[0].id}`); }
      else { r.falhas++; await db.execute(sql`UPDATE pulso_lembrete_envios SET status='FALHOU', erro=${env.erro ?? null} WHERE id=${claim[0].id}`); logger.warn({ clienteId: id, periodo, erro: env.erro }, "[lembrete-pulso] falha"); }
    } catch (e) { r.falhas++; logger.error({ clienteId: id, err: e instanceof Error ? e.message : String(e) }, "[lembrete-pulso] erro"); }
  }
  return r;
}
