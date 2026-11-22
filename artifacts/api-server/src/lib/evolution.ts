/**
 * Evolution API — WhatsApp por QR Code (alternativa PROVISÓRIA ao WhatsApp oficial).
 *
 * Princípios:
 *  - Por clínica: cada empresa tem a sua instância; chave e token do webhook ficam no cofre
 *    cifrado com o id da empresa na chave. Nada é compartilhado entre empresas.
 *  - Nunca simula: servidor fora, credencial recusada, celular desconectado ou resposta
 *    desconhecida viram estados explícitos.
 *  - Nunca envia sozinho: o webhook só REGISTRA. Respostas partem de ação humana.
 *  - Nunca espelha no Telegram nem toca no Twilio.
 *  - O servidor só é contatado se o endereço passar na checagem anti-SSRF (acesso a rede interna).
 */
import dns from "node:dns/promises";
import net from "node:net";
import crypto from "node:crypto";
import { pool } from "@workspace/db";
import { getSecret, setSecret } from "./secure-settings";
import { telefoneCanonico } from "./whatsapp-seguranca";

// ── Tabelas (criadas sob demanda; nunca destrutivo) ────────────────────────
let pronto: Promise<void> | null = null;
export function garantirTabelasEvolution(): Promise<void> {
  pronto ??= (async () => {
    await pool.query(`CREATE TABLE IF NOT EXISTS evolution_instancias (
      empresa_id INTEGER PRIMARY KEY,
      base_url TEXT NOT NULL,
      instance_name TEXT NOT NULL,
      atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      atualizado_por TEXT
    )`);
    await pool.query(`CREATE TABLE IF NOT EXISTS evolution_mensagens (
      id SERIAL PRIMARY KEY,
      empresa_id INTEGER NOT NULL,
      instancia TEXT NOT NULL,
      direcao TEXT NOT NULL,
      contato TEXT NOT NULL,
      corpo TEXT NOT NULL,
      provider_id TEXT,
      status TEXT NOT NULL,
      erro TEXT,
      contexto TEXT,
      enviado_por INTEGER,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS evolution_mensagens_prov_unico
      ON evolution_mensagens (empresa_id, provider_id) WHERE provider_id IS NOT NULL`);
    await pool.query(`CREATE INDEX IF NOT EXISTS evolution_mensagens_contato
      ON evolution_mensagens (empresa_id, contato, criado_em DESC)`);
  })().catch((e) => { pronto = null; throw e; });
  return pronto;
}

// ── Configuração por empresa ────────────────────────────────────────────────
export const chaveApi = (empresaId: number) => `evolution.apiKey.${empresaId}`;
export const chaveWebhook = (empresaId: number) => `evolution.webhookToken.${empresaId}`;

export interface ConfigEvolution { empresaId: number; baseUrl: string; instanceName: string; }

export async function lerConfig(empresaId: number): Promise<ConfigEvolution | null> {
  await garantirTabelasEvolution();
  const r = await pool.query(`SELECT base_url, instance_name FROM evolution_instancias WHERE empresa_id = $1`, [empresaId]);
  const row = r.rows[0] as { base_url: string; instance_name: string } | undefined;
  return row ? { empresaId, baseUrl: row.base_url, instanceName: row.instance_name } : null;
}

export class ConfigInvalida extends Error {}

export function normalizarBaseUrl(raw: unknown, env: NodeJS.ProcessEnv = process.env): string {
  let u: URL;
  try { u = new URL(String(raw ?? "").trim()); } catch { throw new ConfigInvalida("Endereço do servidor inválido."); }
  if (u.protocol !== "https:" && !(u.protocol === "http:" && env.EVOLUTION_PERMITIR_HTTP === "true")) {
    throw new ConfigInvalida("O servidor Evolution precisa usar https.");
  }
  if (u.username || u.password) throw new ConfigInvalida("O endereço não pode conter usuário ou senha.");
  u.hash = ""; u.search = "";
  return u.toString().replace(/\/+$/, "");
}

export function validarNomeInstancia(raw: unknown): string {
  const s = String(raw ?? "").trim();
  if (!/^[A-Za-z0-9_.-]{1,80}$/.test(s)) throw new ConfigInvalida("Nome da instância: 1 a 80 letras, números, ponto, traço ou sublinhado.");
  return s;
}

export async function salvarConfig(empresaId: number, baseUrl: string, instanceName: string, apiKey: string | undefined, por: string): Promise<void> {
  await garantirTabelasEvolution();
  await pool.query(
    `INSERT INTO evolution_instancias (empresa_id, base_url, instance_name, atualizado_por)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (empresa_id) DO UPDATE SET base_url=EXCLUDED.base_url, instance_name=EXCLUDED.instance_name,
       atualizado_em=NOW(), atualizado_por=EXCLUDED.atualizado_por`,
    [empresaId, baseUrl, instanceName, por],
  );
  if (apiKey !== undefined && apiKey !== "") await setSecret(chaveApi(empresaId), apiKey, por);
  if (!(await getSecret(chaveWebhook(empresaId)))) await setSecret(chaveWebhook(empresaId), crypto.randomBytes(32).toString("hex"), por);
}

// ── Anti-SSRF ───────────────────────────────────────────────────────────────
export function ipPrivado(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number) as [number, number];
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
  }
  const v = ip.toLowerCase();
  if (v === "::1" || v === "::") return true;
  if (v.startsWith("::ffff:")) return ipPrivado(v.slice(7));
  return v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe8") || v.startsWith("fe9") || v.startsWith("fea") || v.startsWith("feb");
}

export async function enderecoSeguro(baseUrl: string): Promise<void> {
  const host = new URL(baseUrl).hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost") throw new ConfigInvalida("Endereço interno não é permitido.");
  const ips = net.isIP(host) ? [host] : (await dns.lookup(host, { all: true })).map((x) => x.address);
  if (!ips.length || ips.some(ipPrivado)) throw new ConfigInvalida("Endereço interno não é permitido.");
}

// ── Chamadas ao servidor ────────────────────────────────────────────────────
export type EstadoConexao =
  | "nao_configurado" | "sem_credencial" | "servidor_inacessivel" | "credenciais_recusadas"
  | "instancia_inexistente" | "erro_do_provedor" | "desconectado" | "conectando" | "conectado";

export interface RespostaProvedor { ok: boolean; status: number; json: any; falha?: "rede" | "tempo" | "endereco" }

export async function chamar(cfg: ConfigEvolution, metodo: "GET" | "POST", caminho: string, corpo?: unknown): Promise<RespostaProvedor> {
  const chave = await getSecret(chaveApi(cfg.empresaId));
  if (!chave) return { ok: false, status: 0, json: null, falha: "endereco" };
  try { await enderecoSeguro(cfg.baseUrl); } catch { return { ok: false, status: 0, json: null, falha: "endereco" }; }
  try {
    const r = await fetch(`${cfg.baseUrl}${caminho}`, {
      method: metodo,
      redirect: "manual",
      signal: AbortSignal.timeout(12_000),
      headers: { apikey: chave, "Content-Type": "application/json" },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
    const json = await r.json().catch(() => null);
    return { ok: r.ok, status: r.status, json };
  } catch (e) {
    const tempo = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    return { ok: false, status: 0, json: null, falha: tempo ? "tempo" : "rede" };
  }
}

export function estadoDaResposta(r: RespostaProvedor): EstadoConexao {
  if (r.falha === "rede" || r.falha === "tempo") return "servidor_inacessivel";
  if (r.falha === "endereco") return "servidor_inacessivel";
  if (r.status === 401 || r.status === 403) return "credenciais_recusadas";
  if (r.status === 404) return "instancia_inexistente";
  if (!r.ok) return "erro_do_provedor";
  const st = String(r.json?.instance?.state ?? r.json?.state ?? "").toLowerCase();
  if (st === "open") return "conectado";
  if (st === "connecting") return "conectando";
  if (st === "close" || st === "closed") return "desconectado";
  return "erro_do_provedor"; // resposta que não reconhecemos: não presumimos conexão
}

export async function consultarConexao(empresaId: number): Promise<{ estado: EstadoConexao; detalhe?: string }> {
  const cfg = await lerConfig(empresaId);
  if (!cfg) return { estado: "nao_configurado" };
  if (!(await getSecret(chaveApi(empresaId)))) return { estado: "sem_credencial" };
  const r = await chamar(cfg, "GET", `/instance/connectionState/${encodeURIComponent(cfg.instanceName)}`);
  return { estado: estadoDaResposta(r), detalhe: r.status ? `HTTP ${r.status}` : r.falha };
}

/** QR só é devolvido quando o provedor o entrega; nada é inventado. */
export async function obterQr(empresaId: number): Promise<{ estado: EstadoConexao | "qr_indisponivel"; qrBase64?: string; codigoPareamento?: string }> {
  const cfg = await lerConfig(empresaId);
  if (!cfg) return { estado: "nao_configurado" };
  if (!(await getSecret(chaveApi(empresaId)))) return { estado: "sem_credencial" };
  const r = await chamar(cfg, "GET", `/instance/connect/${encodeURIComponent(cfg.instanceName)}`);
  if (!r.ok) return { estado: estadoDaResposta(r) };
  const b64 = typeof r.json?.base64 === "string" ? r.json.base64 : null;
  if (b64 && /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(b64)) {
    return { estado: "desconectado", qrBase64: b64, codigoPareamento: typeof r.json?.pairingCode === "string" ? r.json.pairingCode : undefined };
  }
  if (String(r.json?.instance?.state ?? "").toLowerCase() === "open") return { estado: "conectado" };
  return { estado: "qr_indisponivel" };
}

export function urlDoWebhook(baseApi: string, empresaId: number, token: string): string {
  return `${baseApi.replace(/\/$/, "")}/api/evolution/webhook/${empresaId}/${token}`;
}

export async function registrarWebhook(empresaId: number, urlPublica: string): Promise<RespostaProvedor> {
  const cfg = await lerConfig(empresaId);
  if (!cfg) return { ok: false, status: 0, json: null, falha: "endereco" };
  return chamar(cfg, "POST", `/webhook/set/${encodeURIComponent(cfg.instanceName)}`, {
    webhook: {
      enabled: true, url: urlPublica, byEvents: false, base64: false,
      events: ["MESSAGES_UPSERT", "MESSAGES_UPDATE", "CONNECTION_UPDATE"],
    },
  });
}

// ── Mensagens ───────────────────────────────────────────────────────────────
const RANK: Record<string, number> = { aceito: 1, enviado: 2, entregue: 3, lido: 4 };

/** Evolution: PENDING / SERVER_ACK / DELIVERY_ACK / READ / PLAYED / ERROR. */
export function statusDoProvedor(s: unknown): "aceito" | "enviado" | "entregue" | "lido" | "falha" | null {
  switch (String(s ?? "").toUpperCase()) {
    case "PENDING": return "aceito";
    case "SERVER_ACK": return "enviado";
    case "DELIVERY_ACK": return "entregue";
    case "READ": case "PLAYED": return "lido";
    case "ERROR": return "falha";
    default: return null;
  }
}

export function statusEvolutionPodeAvancar(atual: string, novo: string): boolean {
  if (atual === novo) return false;
  if (novo === "falha") return (RANK[atual] ?? 0) < 3;       // falha não apaga entrega
  if (atual === "falha") return false;
  return (RANK[novo] ?? 0) > (RANK[atual] ?? 0);
}

/** Contato: número completo (@s.whatsapp.net) ou o próprio identificador quando o WhatsApp não revela o número. */
export function contatoDoJid(jid: string): { contato: string; grupo: boolean } | null {
  if (!jid) return null;
  if (jid.endsWith("@g.us") || jid === "status@broadcast" || jid.endsWith("@broadcast")) return { contato: jid, grupo: true };
  if (jid.endsWith("@s.whatsapp.net")) {
    const d = jid.split("@")[0]!.replace(/\D/g, "");
    return d.length >= 8 && d.length <= 15 ? { contato: d, grupo: false } : null;
  }
  return /^[\w.:-]+@[a-z.]+$/i.test(jid) ? { contato: jid, grupo: false } : null;
}

export function textoDaMensagem(m: any): string | null {
  const t = m?.conversation ?? m?.extendedTextMessage?.text ?? null;
  return typeof t === "string" && t.trim() ? t.slice(0, 4000) : null;
}

export function normalizarEvento(e: unknown): string {
  return String(e ?? "").toLowerCase().replace(/_/g, ".");
}

export function mascararContato(c: string): string {
  const d = c.replace(/\D/g, "");
  return c.includes("@") && !c.endsWith("@s.whatsapp.net") ? "contato sem número visível" : d.length >= 4 ? `***${d.slice(-4)}` : "***";
}

/** Destino de envio: número completo; ou o identificador sem número já conhecido. */
export function destinoDeEnvio(entrada: string): string | null {
  if (entrada.includes("@")) return contatoDoJid(entrada)?.grupo === false ? entrada : null;
  const canon = telefoneCanonico(entrada.startsWith("+") ? entrada : entrada);
  return canon;
}

// ── Limite de envios (humano, 1 destinatário por vez) ──────────────────────
const janelaEnvios = new Map<number, number[]>();
export function podeEnviarAgora(empresaId: number, max = 10, ms = 60_000, agora = Date.now()): boolean {
  const lista = (janelaEnvios.get(empresaId) ?? []).filter((t) => agora - t < ms);
  if (lista.length >= max) { janelaEnvios.set(empresaId, lista); return false; }
  lista.push(agora); janelaEnvios.set(empresaId, lista);
  return true;
}
export function _zerarLimite() { janelaEnvios.clear(); }

export function tokenConfere(recebido: string, esperado: string | null): boolean {
  if (!esperado) return false;
  const a = crypto.createHash("sha256").update(recebido).digest();
  const b = crypto.createHash("sha256").update(esperado).digest();
  return crypto.timingSafeEqual(a, b);
}


// ── Homologação: contatos autorizados pelo proprietário (falha fechada) ────
/**
 * Enquanto a integração está em homologação, SÓ números da lista EVOLUTION_CONTATOS_AUTORIZADOS
 * (separados por vírgula) podem receber ou ter mensagem registrada. Lista vazia = ninguém.
 * Só sai desse modo com EVOLUTION_HOMOLOGACAO=false, decisão explícita do proprietário.
 */
export function homologacaoAtiva(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env.EVOLUTION_HOMOLOGACAO ?? "").trim().toLowerCase() !== "false";
}
export function contatosAutorizados(env: NodeJS.ProcessEnv = process.env): string[] {
  return (env.EVOLUTION_CONTATOS_AUTORIZADOS ?? "").split(",")
    .map((x) => telefoneCanonico(x.trim())).filter((x): x is string => Boolean(x));
}
export function contatoAutorizado(contato: string, env: NodeJS.ProcessEnv = process.env): boolean {
  if (!homologacaoAtiva(env)) return true;
  const alvo = telefoneCanonico(contato.endsWith("@s.whatsapp.net") ? contato.split("@")[0] : contato);
  return Boolean(alvo && contatosAutorizados(env).includes(alvo));
}
