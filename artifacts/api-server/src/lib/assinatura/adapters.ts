/**
 * Adapters concretos: ClicksignAdapter + ZapsignAdapter.
 * Quando as credenciais nao estao configuradas, opera em MODO_MOCK
 * (gera envelope_id sintetico) preservando todo o fluxo. Trocar por
 * fetch real e instantaneo: basta definir o token do provedor no cofre
 * (o serviço hidrata process.env.ZAPSIGN_API_TOKEN a partir de getSecret).
 */

import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type {
  AuthMode,
  EventoWebhook,
  PapelSignatario,
  PayloadEnvelope,
  ProvedorCodigo,
  ResultadoEnvio,
  ResultadoReentregaWebhook,
  Signatario,
  SignatureProviderAdapter,
  StatusDocumento,
} from "./types";

const MOCK_PDF_PLACEHOLDER = Buffer.from(
  "%PDF-1.4\n% Mock signed artifact - replace with real provider download\n",
);

abstract class BaseMockableAdapter implements SignatureProviderAdapter {
  abstract readonly codigo: ProvedorCodigo;
  protected abstract get token(): string | undefined;
  protected abstract get webhookSecret(): string | undefined;

  isConfigured(): boolean {
    return Boolean(this.token);
  }

  async createDocumentEnvelope(payload: PayloadEnvelope): Promise<ResultadoEnvio> {
    if (!this.isConfigured()) {
      const envelopeId = `MOCK-${this.codigo.toUpperCase()}-${randomUUID()}`;
      return {
        envelopeId,
        linksAssinatura: payload.signatarios
          .filter((s) => s.email)
          .map((s) => ({ email: s.email!, url: `https://mock.${this.codigo}.local/sign/${envelopeId}` })),
        rawProvider: { mock: true, codigo: this.codigo, hash: payload.hashOriginal },
      };
    }
    return this.createReal(payload);
  }

  async sendForSignature(envelopeId: string): Promise<void> {
    if (!this.isConfigured()) return;
    await this.sendReal(envelopeId);
  }

  async getDocumentStatus(envelopeId: string): Promise<StatusDocumento> {
    if (!this.isConfigured()) {
      return { status: "ENVIADO", signatariosStatus: [], pdfAssinadoUrl: undefined };
    }
    return this.statusReal(envelopeId);
  }

  async handleWebhook(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): Promise<EventoWebhook> {
    const headerName = this.signatureHeaderName();
    const sig = headers[headerName] || headers[headerName.toLowerCase()];
    const sigStr = Array.isArray(sig) ? sig[0] : sig;
    let signatureValid = false;

    if (this.webhookSecret && sigStr) {
      signatureValid = this.validateWebhookSignature(rawBody, sigStr, this.webhookSecret);
    } else if (!this.webhookSecret) {
      // PRODUCAO: rejeita webhook sem secret configurado (anti-forjamento).
      // DEV/MOCK: aceita pra fluxo de teste sem provedor real.
      signatureValid = process.env["NODE_ENV"] !== "production";
    } else if (
      // Bypass dev-only quando o painel do provedor (ex: ZapSign sandbox/free)
      // NAO oferece campo pra header customizado x-paxter-secret. So aceita se
      // NODE_ENV != production E flag explicita ZAPSIGN_WEBHOOK_DEV_BYPASS=true.
      // Em producao este branch eh ignorado.
      process.env["NODE_ENV"] !== "production" &&
      process.env["ZAPSIGN_WEBHOOK_DEV_BYPASS"] === "true"
    ) {
      signatureValid = true;
      console.warn(
        `[${this.codigo}.webhook] DEV_BYPASS ATIVO — header secreto NAO validado. ` +
          `NUNCA use ZAPSIGN_WEBHOOK_DEV_BYPASS=true em producao.`,
      );
    }

    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(rawBody.toString("utf-8")) as Record<string, unknown>;
    } catch {
      parsed = { raw: rawBody.toString("utf-8") };
    }

    return {
      eventId: this.extractEventId(parsed) || `noid-${createHash("sha256").update(rawBody).digest("hex").slice(0, 16)}`,
      eventType: this.extractEventType(parsed),
      envelopeId: this.extractEnvelopeId(parsed),
      signatureValid,
      payload: parsed,
    };
  }

  /**
   * Validacao default = HMAC-SHA256 (Clicksign, padrao da industria).
   * Override em ZapsignAdapter pra timingSafeEqual literal (header customizado
   * x-paxter-secret, ja que ZapSign nao tem HMAC nativo no webhook).
   */
  protected validateWebhookSignature(rawBody: Buffer, sigStr: string, secret: string): boolean {
    const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
    try {
      const a = Buffer.from(expected, "hex");
      const b = Buffer.from(sigStr.replace(/^sha256=/, ""), "hex");
      return a.length === b.length && timingSafeEqual(a, b);
    } catch {
      return false;
    }
  }

  async downloadSignedArtifact(envelopeId: string): Promise<Buffer> {
    if (!this.isConfigured()) {
      return Buffer.concat([
        MOCK_PDF_PLACEHOLDER,
        Buffer.from(`% envelope=${envelopeId} provider=${this.codigo}\n`),
      ]);
    }
    return this.downloadReal(envelopeId);
  }

  async reentregarWebhook(envelopeId: string): Promise<ResultadoReentregaWebhook> {
    if (!envelopeId) {
      return { ok: false, mock: false, detalhe: "envelope_id ausente" };
    }
    if (!this.isConfigured()) {
      return {
        ok: true,
        mock: true,
        detalhe: `mock ${this.codigo}: provedor nao configurado, simulando reentrega aceita`,
      };
    }
    return this.reentregarWebhookReal(envelopeId);
  }

  // Hooks para implementacao real (override quando integrar HTTP de verdade)
  protected abstract createReal(payload: PayloadEnvelope): Promise<ResultadoEnvio>;
  protected abstract sendReal(envelopeId: string): Promise<void>;
  protected abstract statusReal(envelopeId: string): Promise<StatusDocumento>;
  protected abstract downloadReal(envelopeId: string): Promise<Buffer>;
  /**
   * Default: provedor sem endpoint de reentrega manual. Subclasses que tem
   * endpoint dedicado (ex: ZapSign POST /api/v1/docs/{token}/resend-webhooks/)
   * fazem override.
   */
  protected async reentregarWebhookReal(_envelopeId: string): Promise<ResultadoReentregaWebhook> {
    return {
      ok: false,
      mock: false,
      detalhe: `provedor ${this.codigo} nao expoe endpoint de reentrega manual de webhook`,
    };
  }
  abstract signatureHeaderName(): string;
  protected abstract extractEventId(payload: Record<string, unknown>): string | undefined;
  protected abstract extractEventType(payload: Record<string, unknown>): string;
  protected abstract extractEnvelopeId(payload: Record<string, unknown>): string | undefined;
}

export class ClicksignAdapter extends BaseMockableAdapter {
  readonly codigo: ProvedorCodigo = "clicksign";
  protected get token() { return process.env["CLICKSIGN_TOKEN"]; }
  protected get webhookSecret() { return process.env["CLICKSIGN_WEBHOOK_SECRET"]; }
  private get baseUrl() { return process.env["CLICKSIGN_BASE_URL"] || "https://app.clicksign.com"; }

  protected async createReal(payload: PayloadEnvelope): Promise<ResultadoEnvio> {
    const r = await fetch(`${this.baseUrl}/api/v1/documents?access_token=${this.token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        document: {
          path: `/${payload.templateCodigo}-${Date.now()}.html`,
          content_base64: Buffer.from(payload.conteudoHtml).toString("base64"),
          deadline_at: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
        },
      }),
    });
    if (!r.ok) throw new Error(`Clicksign create failed ${r.status}: ${await r.text()}`);
    const data = (await r.json()) as { document?: { key?: string } };
    const envelopeId = data.document?.key;
    if (!envelopeId) throw new Error("Clicksign nao retornou document.key");
    return {
      envelopeId,
      linksAssinatura: payload.signatarios.filter((s) => s.email).map((s) => ({ email: s.email!, url: `${this.baseUrl}/sign/${envelopeId}` })),
      rawProvider: data,
    };
  }
  protected async sendReal(_envelopeId: string): Promise<void> { /* notify endpoints */ }
  protected async statusReal(envelopeId: string): Promise<StatusDocumento> {
    const r = await fetch(`${this.baseUrl}/api/v1/documents/${envelopeId}?access_token=${this.token}`);
    const data = (await r.json()) as { document?: { status?: string; downloads?: { signed_file_url?: string } } };
    const provStatus = data.document?.status || "running";
    const status = provStatus === "closed" ? "CONCLUIDO" : provStatus === "canceled" ? "REJEITADO" : "ENVIADO";
    return { status, signatariosStatus: [], pdfAssinadoUrl: data.document?.downloads?.signed_file_url };
  }
  protected async downloadReal(envelopeId: string): Promise<Buffer> {
    const r = await fetch(`${this.baseUrl}/api/v1/documents/${envelopeId}?access_token=${this.token}`);
    const data = (await r.json()) as { document?: { downloads?: { signed_file_url?: string } } };
    const url = data.document?.downloads?.signed_file_url;
    if (!url) throw new Error("Clicksign: PDF assinado indisponivel");
    const r2 = await fetch(url);
    return Buffer.from(await r2.arrayBuffer());
  }
  signatureHeaderName(): string { return "content-hmac"; }
  protected extractEventId(p: Record<string, unknown>): string | undefined {
    const ev = p["event"] as Record<string, unknown> | undefined;
    return (ev?.["id"] as string) || (p["id"] as string);
  }
  protected extractEventType(p: Record<string, unknown>): string {
    const ev = p["event"] as Record<string, unknown> | undefined;
    return (ev?.["name"] as string) || "unknown";
  }
  protected extractEnvelopeId(p: Record<string, unknown>): string | undefined {
    const doc = p["document"] as Record<string, unknown> | undefined;
    return doc?.["key"] as string | undefined;
  }
}

/**
 * Mapeamento padrao papel -> auth_mode ZapSign (Lei 14.063/2020).
 * Override per-signatario possivel via Signatario.authMode.
 *
 * REGRA FERRO: paciente NUNCA recebe ICP-Brasil (UX trava idoso brasileiro).
 */
function mapPapelToAuthMode(papel: PapelSignatario, override?: AuthMode): AuthMode {
  if (override) return override;
  switch (papel) {
    case "MEDICO":           return "qualificada";        // ICP-Brasil A1/A3 e-CPF
    case "CLINICA_ECNPJ":    return "qualificada_ecnpj";  // ICP-Brasil e-CNPJ
    case "FARMACIA_ECNPJ":   return "qualificada_ecnpj";  // ICP-Brasil e-CNPJ
    case "PACIENTE":         return "avancada";           // toque + token WhatsApp
    case "RESPONSAVEL_LEGAL":return "avancada";
    case "CLINICA":
    case "TESTEMUNHA":
    default:                 return "simples";
  }
}

/** Mapeia AuthMode -> string aceita pelo campo `auth_mode` da API ZapSign. */
function authModeToZapsign(mode: AuthMode): string {
  switch (mode) {
    case "qualificada":
    case "qualificada_ecnpj":
      return "certificadoDigital";
    case "avancada":
      return "assinaturaTela-tokenWhatsApp";
    case "simples":
    default:
      return "assinaturaTela";
  }
}

export class ZapsignAdapter extends BaseMockableAdapter {
  readonly codigo: ProvedorCodigo = "zapsign";

  /**
   * Token de API ZapSign. Aceita ZAPSIGN_API_TOKEN (oficial) ou ZAPSIGN_TOKEN
   * (legado). O serviço hidrata ZAPSIGN_API_TOKEN do cofre (getSecret
   * "zapsign.token") antes de chamar o adapter, então aqui basta ler env.
   */
  protected get token() {
    return process.env["ZAPSIGN_API_TOKEN"] || process.env["ZAPSIGN_TOKEN"];
  }
  /**
   * Aceita ZAPSIGN_WEBHOOK_SECRET (atual) OU ZAPSIGN_WEBHOOK_SECRET_NEXT
   * (proximo, durante janela de rotacao). O getter so precisa devolver
   * truthy pra desbloquear o branch de validacao no Base — a checagem
   * real de qual valor bate eh feita em validateWebhookSignature.
   */
  protected get webhookSecret() {
    return process.env["ZAPSIGN_WEBHOOK_SECRET"] || process.env["ZAPSIGN_WEBHOOK_SECRET_NEXT"];
  }

  /**
   * Sandbox ZapSign automatico em ambientes nao-producao (sandbox.api.zapsign.com.br).
   * Em producao, usa api.zapsign.com.br. Override possivel via ZAPSIGN_BASE_URL.
   */
  private get baseUrl() {
    if (process.env["ZAPSIGN_BASE_URL"]) return process.env["ZAPSIGN_BASE_URL"];
    return process.env["NODE_ENV"] === "production"
      ? "https://api.zapsign.com.br"
      : "https://sandbox.api.zapsign.com.br";
  }

  /** Nome corporativo apresentado no envelope ZapSign. */
  private get brandName() {
    return process.env["ZAPSIGN_BRAND_NAME"] || "Instituto Padua";
  }

  /**
   * Monta payload da signers[] da API ZapSign a partir dos signatarios.
   * Aplica auth_mode por papel + telefone E.164 BR + nome obrigatorio.
   *
   * O flag global `enviarWhatsappAutomatico` (toggle do dominio) tem
   * precedencia sobre a heuristica per-signer: quando explicitamente false,
   * NUNCA dispara WhatsApp (respeita custo por disparo + canais togglados).
   */
  private montarSigners(
    signatarios: Signatario[],
    enviarWhatsappAutomatico?: boolean,
  ): Array<Record<string, unknown>> {
    return signatarios.map((s) => {
      const mode = mapPapelToAuthMode(s.papel, s.authMode);
      const auth_mode = authModeToZapsign(mode);
      const phoneRaw = s.telefone?.replace(/\D/g, "") || "";
      const phone_country = phoneRaw.length >= 12 ? phoneRaw.slice(0, 2) : "55";
      const phone_number = phoneRaw.length >= 12 ? phoneRaw.slice(2) : phoneRaw;
      const whatsappElegivel = !!phone_number
        && mode !== "qualificada"
        && mode !== "qualificada_ecnpj";
      const send_automatic_whatsapp =
        enviarWhatsappAutomatico === false ? false : whatsappElegivel;
      const signer: Record<string, unknown> = {
        name: s.nome,
        auth_mode,
        send_automatic_email: !!s.email,
        send_automatic_whatsapp,
        require_document_photo: false,
        require_selfie_photo: false,
      };
      if (s.email)        signer["email"] = s.email;
      if (phone_number)   { signer["phone_country"] = phone_country; signer["phone_number"] = phone_number; }
      if (s.cpf)          signer["cpf"] = s.cpf.replace(/\D/g, "");
      // ICP-Brasil: ZapSign exige cpf preenchido pra validar certificado
      if (mode === "qualificada" || mode === "qualificada_ecnpj") {
        signer["require_cpf"] = true;
      }
      return signer;
    });
  }

  protected async createReal(payload: PayloadEnvelope): Promise<ResultadoEnvio> {
    // PDF base64: prioridade pra payload.pdfBase64 (PDF cru); fallback gera
    // PDF minimo a partir do conteudoHtml (ZapSign nao aceita HTML direto).
    const base64_pdf = payload.pdfBase64 || Buffer.from(payload.conteudoHtml).toString("base64");

    const body: Record<string, unknown> = {
      name: payload.templateCodigo,
      base64_pdf,
      brand_name: this.brandName,
      lang: "pt-br",
      disable_signer_emails: false,
      signed_file_only_finished: true,
      signature_order_active: !!payload.ordemAssinaturaAtiva,
      signers: this.montarSigners(payload.signatarios, payload.enviarWhatsappAutomatico),
    };
    if (payload.externalId)  body["external_id"] = payload.externalId;

    const r = await fetch(`${this.baseUrl}/api/v1/docs/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.token}`,
      },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(`ZapSign create failed ${r.status}: ${await r.text()}`);
    const data = (await r.json()) as {
      token?: string;
      signers?: Array<{ email?: string; sign_url?: string; token?: string; name?: string }>;
    };
    if (!data.token) throw new Error("ZapSign nao retornou token");

    const linksAssinatura = (data.signers || [])
      .filter((s) => s.sign_url)
      .map((s) => ({ email: s.email || s.name || s.token || "", url: s.sign_url! }));

    return {
      envelopeId: data.token,
      linksAssinatura,
      rawProvider: data,
    };
  }

  protected async sendReal(_envelopeId: string): Promise<void> {
    /* ZapSign dispara WhatsApp/email automaticamente no create quando
     * send_automatic_whatsapp/email = true por signatario. No-op aqui. */
  }

  protected async statusReal(envelopeId: string): Promise<StatusDocumento> {
    const r = await fetch(`${this.baseUrl}/api/v1/docs/${envelopeId}/`, {
      headers: { Authorization: `Bearer ${this.token}` },
    });
    const data = (await r.json()) as {
      status?: string;
      signed_file?: string;
      signers?: Array<{ email?: string; status?: string; times_viewed?: number; last_view_at?: string; signed_at?: string }>;
    };
    const status =
      data.status === "signed"   ? "CONCLUIDO" :
      data.status === "refused"  ? "REJEITADO" :
      data.status === "expired"  ? "EXPIRADO"  : "ENVIADO";
    const signatariosStatus = (data.signers || []).map((s) => ({
      email: s.email || "",
      assinado: s.status === "signed",
      assinadoEm: s.signed_at,
    }));
    return { status, signatariosStatus, pdfAssinadoUrl: data.signed_file };
  }

  protected async downloadReal(envelopeId: string): Promise<Buffer> {
    const r = await fetch(`${this.baseUrl}/api/v1/docs/${envelopeId}/`, {
      headers: { Authorization: `Bearer ${this.token}` },
    });
    const data = (await r.json()) as { signed_file?: string };
    if (!data.signed_file) throw new Error("ZapSign: PDF assinado indisponivel");
    const r2 = await fetch(data.signed_file);
    return Buffer.from(await r2.arrayBuffer());
  }

  /**
   * Pede ao ZapSign pra reentregar todos os webhooks do envelope.
   * Endpoint oficial: POST /api/v1/docs/{doc_token}/resend-webhooks/.
   * Defensivo: nunca lanca, retorna ok=false com detalhe quando recusa.
   */
  protected async reentregarWebhookReal(envelopeId: string): Promise<ResultadoReentregaWebhook> {
    try {
      const r = await fetch(`${this.baseUrl}/api/v1/docs/${envelopeId}/resend-webhooks/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.token}`,
        },
        body: "{}",
      });
      if (!r.ok) {
        const corpo = await r.text().catch(() => "");
        return {
          ok: false,
          mock: false,
          detalhe: `ZapSign recusou reentrega (HTTP ${r.status}): ${corpo.slice(0, 240)}`,
        };
      }
      return { ok: true, mock: false, detalhe: `ZapSign aceitou reentrega (HTTP ${r.status})` };
    } catch (e) {
      return {
        ok: false,
        mock: false,
        detalhe: `falha de rede ao chamar ZapSign: ${(e as Error).message}`,
      };
    }
  }

  /**
   * ZapSign nao tem HMAC nativo no webhook — autenticacao via header customizado
   * configurado no painel ZapSign: "x-paxter-secret: <ZAPSIGN_WEBHOOK_SECRET>".
   * Comparacao timingSafeEqual literal (sem hash do body).
   */
  signatureHeaderName(): string { return "x-paxter-secret"; }

  /**
   * Compara o header `x-paxter-secret` contra ZAPSIGN_WEBHOOK_SECRET (atual)
   * E ZAPSIGN_WEBHOOK_SECRET_NEXT (proximo) — qualquer match valida.
   * Suporte a dois segredos simultaneos destrava rotacao sem downtime.
   */
  protected validateWebhookSignature(_rawBody: Buffer, sigStr: string, _secret: string): boolean {
    const candidates = [
      process.env["ZAPSIGN_WEBHOOK_SECRET"],
      process.env["ZAPSIGN_WEBHOOK_SECRET_NEXT"],
    ].filter((s): s is string => typeof s === "string" && s.length > 0);
    if (candidates.length === 0) return false;
    let matched = false;
    for (const candidate of candidates) {
      try {
        const a = Buffer.from(sigStr, "utf8");
        const b = Buffer.from(candidate, "utf8");
        if (a.length === b.length && timingSafeEqual(a, b)) matched = true;
      } catch {
        // segue tentando o proximo candidato
      }
    }
    return matched;
  }

  protected extractEventId(p: Record<string, unknown>): string | undefined {
    // ZapSign nao emite event_id estavel — derivamos de doc_token+event_type+ts.
    const evType = (p["event_type"] as string) || "unknown";
    const docToken = (p["token"] as string) || (p["doc_token"] as string) || "";
    if (!docToken) return undefined;
    // NUNCA usar new Date(): retries do MESMO evento gerariam IDs diferentes e
    // furariam a deduplicacao (onConflictDoNothing). Sem timestamp do provedor,
    // derivamos de forma DETERMINISTICA do conteudo do proprio payload.
    const ts = (p["last_update_at"] as string) || "";
    const base = ts
      ? `${docToken}|${evType}|${ts}`
      : `${docToken}|${evType}|${createHash("sha256").update(JSON.stringify(p)).digest("hex")}`;
    return createHash("sha256").update(base).digest("hex").slice(0, 32);
  }
  protected extractEventType(p: Record<string, unknown>): string {
    return (p["event_type"] as string) || "unknown";
  }
  protected extractEnvelopeId(p: Record<string, unknown>): string | undefined {
    return (p["token"] as string) || (p["doc_token"] as string);
  }
}

const _instances = new Map<ProvedorCodigo, SignatureProviderAdapter>();
export function getAdapter(codigo: ProvedorCodigo): SignatureProviderAdapter {
  let a = _instances.get(codigo);
  if (!a) {
    if (codigo === "clicksign") a = new ClicksignAdapter();
    else if (codigo === "zapsign") a = new ZapsignAdapter();
    else throw new Error(`Adapter nao implementado para provedor ${codigo}. Oficiais: clicksign e zapsign.`);
    _instances.set(codigo, a);
  }
  return a;
}
