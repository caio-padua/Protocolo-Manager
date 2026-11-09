// Resolve a base pública (HTTPS) do app para montar URLs absolutas de imagem
// e banner. Em produção e no preview, REPLIT_DOMAINS já é público; cai para o
// domínio de dev e, por fim, localhost. Helper único — não duplicar por rota.
import type { Request } from "express";

/** Dominio proprio da marca (ex.: https://receita.suamarca.com.br). Tem prioridade
 *  sobre o dominio tecnico da hospedagem, para o paciente nunca ver o dominio do provedor. */
function brandBaseUrl(): string | null {
  const raw = process.env.PUBLIC_BASE_URL?.trim();
  if (!raw) return null;
  try {
    const u = new URL(raw);
    return u.protocol === "https:" ? u.origin : null;
  } catch {
    return null;
  }
}

/** Domínio público da hospedagem em produção no Railway (nome de host, sem protocolo). */
function railwayHost(): string | undefined {
  const raw = process.env.RAILWAY_PUBLIC_DOMAIN?.trim();
  return raw ? raw.replace(/^https?:\/\//i, "").replace(/\/+$/, "") : undefined;
}

export function baseUrlFromEnv(): string {
  const brand = brandBaseUrl();
  if (brand) return brand;
  const fromDomains = process.env.REPLIT_DOMAINS?.split(",")[0]?.trim();
  const host = fromDomains || railwayHost() || process.env.REPLIT_DEV_DOMAIN || "localhost";
  const proto = host.includes("localhost") ? "http" : "https";
  return `${proto}://${host}`;
}

export function absoluteBaseUrl(req?: Request): string {
  const brand = brandBaseUrl();
  if (brand) return brand;
  if (req) {
    const fromDomains = process.env.REPLIT_DOMAINS?.split(",")[0]?.trim();
    const host = fromDomains || process.env.REPLIT_DEV_DOMAIN || req.get("host") || "localhost";
    const proto = host.includes("localhost") ? "http" : "https";
    return `${proto}://${host}`;
  }
  return baseUrlFromEnv();
}
