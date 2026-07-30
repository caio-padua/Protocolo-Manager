/**
 * AI Central — Guard de clone + Headers para Cloudflare AI Gateway
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * COMO FUNCIONA:
 *
 *  Instância CEO (padrão):
 *    PADAXOR_AI_BYPASS=true         → Guard desativado. IA usa Replit integrations.
 *
 *  Clone licenciado (autorizado):
 *    PADAXOR_TENANT_TOKEN=<tok>     → Guard passa. Headers injetados nas chamadas.
 *    AI_INTEGRATIONS_*_BASE_URL     → deve apontar para CF AI Gateway do CEO.
 *    CF_AI_GATEWAY_URL=<url>        → ativa injeção de cf-aig-metadata.
 *
 *  Clone sem credenciais:
 *    → requireAiTenant() lança erro explícito. IA bloqueada.
 *    → modelo de negócio fechado: sem token CEO = sem IA.
 *
 * CLOUDFLARE AI GATEWAY (quando CF_AI_GATEWAY_URL estiver configurado):
 *  Cada chamada recebe o header:
 *    cf-aig-metadata: {"empresa_id":"5","tipo":"clinical"}
 *  O Gateway usa isso para metering por tenant (Item B — Ledger).
 *
 *  Provider   | Header injetado em
 *  Anthropic  | messages.create(params, { headers })
 *  OpenAI     | fetch(url, { headers: { ...getGatewayHeaders() } })
 *  Gemini     | generateContent(params, { headers })  [requer @google/genai ≥ 1.3]
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type AiRequestType =
  | "clinical"   // extração de laudo
  | "ocr"        // OCR de documento (RG, CNH, contrato)
  | "whatsapp"   // bot WhatsApp
  | "agent"      // agente virtual (chat)
  | "voice"      // TTS / voz
  | "other";

export interface AiTenantContext {
  empresaId: number;
  /** Headers prontos para injetar em qualquer provider. Vazio quando CF gateway não configurado. */
  headers: Record<string, string>;
  /** true quando CF_AI_GATEWAY_URL está configurado e ativo */
  gatewayEnabled: boolean;
}

// ─── GUARD PRINCIPAL ─────────────────────────────────────────────────────────

/**
 * requireAiTenant — deve ser chamado antes de QUALQUER chamada de IA.
 *
 * Regras:
 *  - PADAXOR_AI_BYPASS=true  → modo CEO, sem guard.
 *  - PADAXOR_TENANT_TOKEN    → clone licenciado.
 *  - Nenhum dos dois        → lança erro (clone sem credenciais).
 *
 * @param empresaId  ID da empresa que originou a chamada (para metering).
 *                   Use 0 quando não disponível no contexto (fallback ao CEO).
 * @param tipo       Tipo da chamada (para billing granular no gateway).
 */
export function requireAiTenant(
  empresaId: number,
  tipo: AiRequestType = "other",
): AiTenantContext {
  const bypass     = process.env.PADAXOR_AI_BYPASS === "true";
  const token      = process.env.PADAXOR_TENANT_TOKEN;
  const gatewayUrl = process.env.CF_AI_GATEWAY_URL;

  // ── Guard de clone ───────────────────────────────────────────────────────
  if (!bypass && !token) {
    throw new Error(
      "[PADAXOR] Chamada de IA bloqueada: este ambiente não tem PADAXOR_AI_BYPASS nem " +
      "PADAXOR_TENANT_TOKEN configurados.\n" +
      "• Instância CEO: defina PADAXOR_AI_BYPASS=true nos Replit Secrets.\n" +
      "• Clone licenciado: solicite PADAXOR_TENANT_TOKEN em suporte@padaxor.com.br.",
    );
  }

  // ── Headers para CF AI Gateway ───────────────────────────────────────────
  const gatewayEnabled = !!gatewayUrl;
  const headers: Record<string, string> = {};

  if (gatewayEnabled) {
    headers["cf-aig-metadata"] = JSON.stringify({
      empresa_id: String(empresaId),
      tipo,
    });
  }

  return { empresaId, headers, gatewayEnabled };
}

// ─── VERIFICAÇÃO NO BOOT ──────────────────────────────────────────────────────

/**
 * checkAiSetup — chamado no boot do api-server.
 * Emite warnings se a configuração estiver inconsistente.
 * Nunca lança — o boot nunca falha por causa disso.
 */
export function checkAiSetup(log: { warn: (msg: string) => void; info: (msg: string) => void }): void {
  const bypass     = process.env.PADAXOR_AI_BYPASS === "true";
  const token      = process.env.PADAXOR_TENANT_TOKEN;
  const gatewayUrl = process.env.CF_AI_GATEWAY_URL;

  if (!bypass && !token) {
    log.warn(
      "[PADAXOR AI] AVISO: PADAXOR_AI_BYPASS e PADAXOR_TENANT_TOKEN estão ausentes. " +
      "Todas as chamadas de IA vão falhar. " +
      "Defina PADAXOR_AI_BYPASS=true (instância CEO) ou PADAXOR_TENANT_TOKEN (clone licenciado).",
    );
    return;
  }

  if (bypass) {
    log.info("[PADAXOR AI] Modo CEO (PADAXOR_AI_BYPASS=true) — IA direta via Replit integrations.");
  } else {
    log.info(`[PADAXOR AI] Modo Clone licenciado (token: ${token!.slice(0, 4)}…).`);
  }

  if (token && !gatewayUrl) {
    log.warn(
      "[PADAXOR AI] PADAXOR_TENANT_TOKEN configurado mas CF_AI_GATEWAY_URL ausente. " +
      "Metering via CF AI Gateway não vai funcionar. " +
      "Configure CF_AI_GATEWAY_URL quando o CEO criar o gateway (Decisão 11).",
    );
  }

  if (gatewayUrl) {
    const anthropicBase = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL ?? "";
    const geminiBase    = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL ?? "";
    const openaiBase    = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL ?? "";
    const gw = gatewayUrl.replace(/\/$/, "");

    for (const [name, base, suffix] of [
      ["Anthropic", anthropicBase, "anthropic"],
      ["Gemini",    geminiBase,    "google-ai-studio"],
      ["OpenAI",    openaiBase,    "openai"],
    ] as const) {
      if (base && !base.startsWith(gw)) {
        log.warn(
          `[PADAXOR AI] CF_AI_GATEWAY_URL configurado mas AI_INTEGRATIONS_${name.toUpperCase()}_BASE_URL ` +
          `(${base}) não aponta para o gateway. ` +
          `Esperado: ${gw}/${suffix}. Chamadas ${name} passam pelo Replit, não pelo gateway.`,
        );
      }
    }

    log.info(`[PADAXOR AI] CF AI Gateway ativo: ${gw}. Headers cf-aig-metadata serão injetados.`);
  }
}
