import { afterEach, describe, expect, it, vi } from "vitest";
import { baseUrlFromEnv, absoluteBaseUrl } from "../lib/messaging/base-url";

describe("PUBLIC_BASE_URL de produção governa os links /agendar", () => {
  afterEach(() => { vi.unstubAllEnvs(); });
  it("com a variável de produção, base e links usam só o domínio oficial", () => {
    vi.stubEnv("PUBLIC_BASE_URL", "https://paxmed.com.br");
    vi.stubEnv("REPLIT_DOMAINS", "dev-xyz.replit.dev");
    vi.stubEnv("RAILWAY_PUBLIC_DOMAIN", "x.railway.app");
    expect(baseUrlFromEnv()).toBe("https://paxmed.com.br");
    expect(`${baseUrlFromEnv().replace(/\/$/, "")}/agendar`).toBe("https://paxmed.com.br/agendar");
    expect(`${baseUrlFromEnv()}/agendar/status/7?t=x`).toBe("https://paxmed.com.br/agendar/status/7?t=x");
    expect(absoluteBaseUrl({ get: () => "outro.replit.dev" } as never)).toBe("https://paxmed.com.br");
  });
  it("barra final e caminho extra são removidos; valor sem https é ignorado", () => {
    vi.stubEnv("PUBLIC_BASE_URL", "https://paxmed.com.br/");
    expect(baseUrlFromEnv()).toBe("https://paxmed.com.br");
    vi.stubEnv("PUBLIC_BASE_URL", "http://paxmed.com.br");
    vi.stubEnv("REPLIT_DOMAINS", "dev-xyz.replit.dev");
    expect(baseUrlFromEnv()).toBe("https://dev-xyz.replit.dev");
  });
});
