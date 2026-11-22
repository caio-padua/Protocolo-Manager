-- Liga a mensagem enviada pelo WhatsApp ao pedido de segunda via e registra
-- estados confirmados pelo provedor e o acesso ao PDF protegido.
CREATE TABLE IF NOT EXISTS evolution_status_recebidos (
  empresa_id INTEGER NOT NULL,
  provider_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('aceito','enviado','entregue','lido','falha')),
  recebido_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (empresa_id,provider_id,status)
);

ALTER TABLE IF EXISTS evolution_mensagens
  ADD COLUMN IF NOT EXISTS reissue_request_id BIGINT;

CREATE INDEX IF NOT EXISTS evolution_mensagens_reissue_request
  ON evolution_mensagens (empresa_id, reissue_request_id)
  WHERE reissue_request_id IS NOT NULL;

DO $$
BEGIN
  IF to_regclass('public.clinical_document_reissue_requests') IS NOT NULL THEN
    ALTER TABLE clinical_document_reissue_requests
      ADD COLUMN IF NOT EXISTS document_accessed_at TIMESTAMPTZ;
    ALTER TABLE clinical_document_reissue_requests
      DROP CONSTRAINT IF EXISTS clinical_document_reissue_delivery_ck;
    ALTER TABLE clinical_document_reissue_requests
      ADD CONSTRAINT clinical_document_reissue_delivery_ck
      CHECK (delivery_status IN (
        'not_started', 'queued', 'provider_accepted', 'delivered', 'read', 'failed', 'unknown'
      ));
  END IF;
END
$$;
