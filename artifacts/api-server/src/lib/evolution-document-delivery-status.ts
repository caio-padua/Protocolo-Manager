import { pool } from "@workspace/db";

/** Persistência atômica do estado confirmado pelo provedor; nunca envia mensagens. */
export async function registrarStatusEvolution(
  empresaId: number,
  providerId: string,
  novo: "aceito" | "enviado" | "entregue" | "lido" | "falha",
): Promise<void> {
  await pool.query(`INSERT INTO evolution_status_recebidos (empresa_id,provider_id,status)
    VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, [empresaId, providerId, novo]);
  await reconciliarStatusEvolution(empresaId, providerId);
}

export async function reconciliarStatusEvolution(empresaId: number, providerId: string): Promise<void> {
  // O estado desejado é derivado de confirmações persistidas, não de leitura
  // anterior da mensagem. O PostgreSQL revalida a condição após esperar o lock.
  await pool.query(
    `WITH desired AS (
      SELECT CASE
        WHEN bool_or(status='lido') THEN 'lido'
        WHEN bool_or(status='entregue') THEN 'entregue'
        WHEN bool_or(status='falha') THEN 'falha'
        WHEN bool_or(status='enviado') THEN 'enviado'
        ELSE 'aceito' END AS status
      FROM evolution_status_recebidos WHERE empresa_id=$1 AND provider_id=$2
      HAVING COUNT(*)>0
    ), changed_message AS (
      UPDATE evolution_mensagens msg
        SET status=d.status, erro=CASE WHEN d.status='falha' THEN 'provedor_reportou_erro' ELSE NULL END,
            atualizado_em=NOW()
      FROM desired d
      WHERE msg.empresa_id=$1 AND msg.provider_id=$2 AND msg.direcao='saida'
        AND (CASE d.status WHEN 'lido' THEN 5 WHEN 'entregue' THEN 4 WHEN 'falha' THEN 3 WHEN 'enviado' THEN 2 ELSE 1 END)
          > (CASE msg.status WHEN 'lido' THEN 5 WHEN 'entregue' THEN 4 WHEN 'falha' THEN 3 WHEN 'enviado' THEN 2 WHEN 'aceito' THEN 1 ELSE 0 END)
      RETURNING msg.reissue_request_id,msg.empresa_id,msg.status
    ), changed_request AS (
      UPDATE clinical_document_reissue_requests
          SET delivery_status=CASE m.status WHEN 'lido' THEN 'read' WHEN 'entregue' THEN 'delivered' ELSE 'failed' END,
              request_status=CASE WHEN m.status='falha' THEN 'failed'
                WHEN request_status IN ('delivery_pending','provider_accepted','unknown') THEN 'provider_accepted'
                WHEN request_status='failed' AND m.status IN ('entregue','lido') THEN 'provider_accepted'
                ELSE request_status END,
              delivery_completed_at=COALESCE(delivery_completed_at,NOW()),
              delivery_result=CASE m.status
                WHEN 'lido' THEN 'A Evolution confirmou a leitura da mensagem com o link seguro.'
                WHEN 'entregue' THEN 'A Evolution confirmou a entrega da mensagem com o link seguro.'
                ELSE 'A Evolution reportou falha na entrega da mensagem com o link seguro.' END,
              updated_at=NOW()
        FROM changed_message m
        WHERE id=m.reissue_request_id AND clinical_document_reissue_requests.empresa_id=m.empresa_id
          AND delivery_channel='whatsapp' AND m.status IN ('entregue','lido','falha')
          AND request_status IN ('delivery_pending','provider_accepted','unknown','failed')
          AND delivery_status<>'read'
          AND (delivery_status<>'delivered' OR m.status='lido')
        RETURNING id,clinical_document_reissue_requests.empresa_id,location_id,m.status
    )
    INSERT INTO clinical_document_reissue_events
       (request_id,empresa_id,location_id,event_type,details)
     SELECT id,empresa_id,location_id,'delivery_provider_'||status,
       jsonb_build_object('providerMessageId',$2::text,'status',status) FROM changed_request`,
    [empresaId, providerId],
  );
}
