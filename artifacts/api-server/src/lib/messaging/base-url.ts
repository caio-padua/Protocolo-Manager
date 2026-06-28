// Resolve a base pública (HTTPS) do app para montar URLs absolutas de imagem
// e banner. Em produção e no preview, REPLIT_DOMAINS já é público; cai para o
// domínio de dev e, por fim, localhost. Helper único — não duplicar por rota.
import type { Request } from "express";

export function baseUrlFromEnv(): string {
  const fromDomains = process.env.REPLIT_DOMAINS?.split(",")[0]?.trim();
  const host = fromDomains || process.env.REPLIT_DEV_DOMAIN || "localhost";
  const proto = host.includes("localhost") ? "http" : "https";
  return `${proto}://${host}`;
}

export function absoluteBaseUrl(req?: Request): string {
  if (req) {
    const fromDomains = process.env.REPLIT_DOMAINS?.split(",")[0]?.trim();
    const host = fromDomains || process.env.REPLIT_DEV_DOMAIN || req.get("host") || "localhost";
    const proto = host.includes("localhost") ? "http" : "https";
    return `${proto}://${host}`;
  }
  return baseUrlFromEnv();
}
