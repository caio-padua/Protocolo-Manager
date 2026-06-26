/**
 * Tipos do motor de Assinatura Remota (Paxter).
 * Espelham as tabelas Drizzle nativas. Mantidos em arquivo único para evitar
 * dispersão semântica — quem precisa de assinatura importa daqui.
 */

export type ProvedorCodigo =
  | "clicksign"
  | "zapsign"
  | "dock"
  | "d4sign"
  | "autentique"
  | "icp_a1_local";

export type SolicitacaoStatus =
  | "RASCUNHO"
  | "HIDRATADO"
  | "ENVIADO"
  | "PARCIAL"
  | "CONCLUIDO"
  | "REJEITADO"
  | "EXPIRADO"
  | "FALHA";

export type PapelSignatario =
  | "PACIENTE"
  | "MEDICO"
  | "CLINICA"
  | "CLINICA_ECNPJ"
  | "FARMACIA_ECNPJ"
  | "TESTEMUNHA"
  | "RESPONSAVEL_LEGAL";

/**
 * Modalidades de autenticação Lei 14.063/2020 art. 4º:
 *  - simples:           toque + nome digitado
 *  - avancada:          toque + token WhatsApp/Email + IP + geo + hash
 *  - qualificada:       ICP-Brasil A1/A3 (e-CPF médico)
 *  - qualificada_ecnpj: ICP-Brasil e-CNPJ (clínica/farmácia bilateral)
 *
 * Mapeamento padrão por papel:
 *   PACIENTE         -> avancada           (toque + token WhatsApp)
 *   MEDICO           -> qualificada        (e-CPF ICP-Brasil A1/A3)
 *
 * REGRA FERRO: paciente NUNCA recebe ICP-Brasil (UX trava idoso brasileiro).
 */
export type AuthMode = "simples" | "avancada" | "qualificada" | "qualificada_ecnpj";

export type CanalDistribuicao = "EMAIL" | "WHATSAPP" | "DRIVE";

export type MomentoNotificacao = "ENVIO_INICIAL" | "POS_ASSINATURA" | "LEMBRETE";

export interface Signatario {
  papel: PapelSignatario;
  nome: string;
  cpf?: string;
  email?: string;
  telefone?: string;
  ordem: number;
  /** Override do auth_mode default por papel (ZapSign). */
  authMode?: AuthMode;
}

export interface PayloadEnvelope {
  templateCodigo: string;
  /**
   * Conteúdo do documento. Se for HTML/texto, é convertido a base64 PDF pelo
   * helper htmlParaPdf. Se for PDF cru, passe via {@link pdfBase64}.
   */
  conteudoHtml: string;
  /** PDF já renderizado em base64. Se presente, sobrepõe conteudoHtml. */
  pdfBase64?: string;
  hashOriginal: string;
  signatarios: Signatario[];
  /**
   * External id estável (ex: "ras-1234-1761512000"). Persistido em
   * assinatura_solicitacoes.zapsign_external_id e enviado ao ZapSign como
   * external_id para reconciliar webhook -> DB sem ambiguidade.
   */
  externalId?: string;
  /** Acionar envio automático via WhatsApp (ZapSign cobra por disparo). */
  enviarWhatsappAutomatico?: boolean;
  /**
   * Sequenciamento de assinaturas. true = ordem ativa (signatário seguinte só
   * recebe link após o anterior assinar). false = paralelo. Default false.
   */
  ordemAssinaturaAtiva?: boolean;
  metadata: Record<string, unknown>;
}

export interface ResultadoEnvio {
  envelopeId: string;
  linksAssinatura: Array<{ email: string; url: string }>;
  rawProvider: unknown;
}

export interface StatusDocumento {
  status: SolicitacaoStatus;
  signatariosStatus: Array<{ email: string; assinado: boolean; assinadoEm?: string }>;
  pdfAssinadoUrl?: string;
}

export interface EventoWebhook {
  eventId: string;
  eventType: string;
  envelopeId?: string;
  signatureValid: boolean;
  payload: Record<string, unknown>;
}

export interface ResultadoReentregaWebhook {
  ok: boolean;
  mock: boolean;
  detalhe: string;
}

/** Interface única que TODOS os provedores implementam. */
export interface SignatureProviderAdapter {
  readonly codigo: ProvedorCodigo;
  isConfigured(): boolean;
  createDocumentEnvelope(payload: PayloadEnvelope): Promise<ResultadoEnvio>;
  sendForSignature(envelopeId: string): Promise<void>;
  getDocumentStatus(envelopeId: string): Promise<StatusDocumento>;
  handleWebhook(
    rawBody: Buffer,
    headers: Record<string, string | string[] | undefined>,
  ): Promise<EventoWebhook>;
  downloadSignedArtifact(envelopeId: string): Promise<Buffer>;
  reentregarWebhook(envelopeId: string): Promise<ResultadoReentregaWebhook>;
  signatureHeaderName(): string;
}
