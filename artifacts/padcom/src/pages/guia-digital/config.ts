/**
 * Guia Digital do Cliente PaxMed — configuração, identidade da clínica e eventos.
 * Sem dependência de React além dos hooks. Nada aqui envia mensagem ao cliente.
 */
import { createContext, useEffect, useState } from "react";

// ── Endereço da Área do Cliente ──────────────────────────────────────────────
// VITE_AREA_URL é obrigatória em produção. O fallback para window.location.origin foi
// REMOVIDO de propósito: no ambiente de desenvolvimento ele gera um endereço efêmero que
// quebraria o link do cliente. Sem configuração, a página pede o endereço à clínica.
export const AREA_URL_ENV: string | null = import.meta.env.VITE_AREA_URL
  ? String(import.meta.env.VITE_AREA_URL)
  : null;

export const API_BASE = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");

// ── Links OFICIAIS do Telegram (lojas e site oficial) ────────────────────────
export const TELEGRAM_LINKS = {
  appStore: "https://apps.apple.com/app/telegram-messenger/id686449807",
  playStore: "https://play.google.com/store/apps/details?id=org.telegram.messenger",
  desktop: "https://desktop.telegram.org/",
  web: "https://web.telegram.org/",
  todosOsApps: "https://telegram.org/apps",
} as const;

// ── Identidade da clínica (dinâmica, multiclínica por ?tenant=) ──────────────
export interface GuiaConfig {
  /** Nome da clínica exibido no manual. */
  clinicaNome: string;
  /** Ex.: "@Paduaclinica_bot". */
  botHandle: string;
  /** Ex.: "t.me/Paduaclinica_bot" (sem protocolo, para exibição). */
  botLink: string;
  /** Endereço da Área do Cliente, ou null se ainda não estiver configurado. */
  areaUrl: string | null;
  /** "carregando" | "ok" | "indisponivel" (tenant informado, mas a clínica não foi encontrada). */
  identidade: "carregando" | "ok" | "indisponivel";
}

const BOT_PADRAO = "@Paduaclinica_bot";

export const CONFIG_PADRAO: GuiaConfig = {
  clinicaNome: "Instituto Pádua",
  botHandle: BOT_PADRAO,
  botLink: `t.me/${BOT_PADRAO.replace(/^@/, "")}`,
  areaUrl: AREA_URL_ENV,
  identidade: "ok",
};

export const GuiaConfigContext = createContext<GuiaConfig>(CONFIG_PADRAO);

export function readTenant(): string | undefined {
  const t = new URLSearchParams(window.location.search).get("tenant");
  return t ? t.trim().toLowerCase() : undefined;
}

export function readClientId(): number | undefined {
  const raw = new URLSearchParams(window.location.search).get("c");
  if (!raw) return undefined;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/**
 * Lê ?tenant= e busca a identidade da clínica no servidor.
 * Sem tenant: mantém o comportamento histórico (Instituto Pádua).
 * Tenant informado e não encontrado: NUNCA mostra o nome de outra clínica; usa texto neutro.
 */
export function useGuiaConfigLoader(): GuiaConfig {
  const slug = readTenant();
  const [config, setConfig] = useState<GuiaConfig>(
    slug ? { ...CONFIG_PADRAO, clinicaNome: "sua clínica", identidade: "carregando" } : CONFIG_PADRAO,
  );

  useEffect(() => {
    if (!slug) return;
    const controller = new AbortController();
    fetch(`${API_BASE}/api/onboarding/config?tenant=${encodeURIComponent(slug)}`, { signal: controller.signal })
      .then((r) =>
        r.ok
          ? (r.json() as Promise<{ clinicaNome: string; botHandle: string | null; areaUrl: string | null }>)
          : Promise.reject(new Error(String(r.status))),
      )
      .then((d) => {
        const handle = d.botHandle ?? BOT_PADRAO;
        setConfig({
          clinicaNome: d.clinicaNome || "sua clínica",
          botHandle: handle,
          botLink: `t.me/${handle.replace(/^@/, "")}`,
          areaUrl: d.areaUrl || AREA_URL_ENV,
          identidade: "ok",
        });
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setConfig({ ...CONFIG_PADRAO, clinicaNome: "sua clínica", identidade: "indisponivel" });
      });
    return () => controller.abort();
  }, [slug]);

  return config;
}

// ── Eventos de abertura (silenciosos; nunca bloqueiam o cliente) ─────────────
// O servidor só aceita estas cinco chaves; as demais seções não geram evento.
const SECOES_COM_EVENTO = new Set(["iphone", "android", "computador", "login", "telegram"]);

export function registrarEvento(device: string, secao: string): void {
  if (!SECOES_COM_EVENTO.has(secao)) return;
  const client_id = readClientId();
  const tenantSlug = readTenant();
  fetch(`${API_BASE}/api/onboarding/evento`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      device,
      secao,
      ...(tenantSlug ? { tenantSlug } : {}),
      ...(client_id ? { client_id } : {}),
    }),
  }).catch(() => {
    /* silencioso */
  });
}

export function detectDevice(): "iphone" | "android" | "desktop" {
  const ua = navigator.userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) return "iphone";
  if (/android/.test(ua)) return "android";
  return "desktop";
}
