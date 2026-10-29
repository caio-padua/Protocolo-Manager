-- Apenas vínculos inequívocos, sem disparar lembretes ou alterar dados clínicos.
WITH candidates AS (
  SELECT p.id AS prescription_id, c.id AS client_id,
    regexp_replace(coalesce(p.client_cpf, ''), '[^0-9]', '', 'g') AS p_cpf,
    regexp_replace(coalesce(c.cpf, ''), '[^0-9]', '', 'g') AS c_cpf
  FROM prescriptions p
  JOIN clients c ON c.empresa_id = p.empresa_id
  WHERE p.client_id IS NULL AND (
    (regexp_replace(coalesce(p.client_cpf, ''), '[^0-9]', '', 'g') <> ''
     AND regexp_replace(p.client_cpf, '[^0-9]', '', 'g') = regexp_replace(c.cpf, '[^0-9]', '', 'g'))
    OR (btrim(coalesce(p.client_email, '')) <> ''
        AND lower(btrim(p.client_email)) = lower(btrim(c.email)))
  )
), unique_matches AS (
  SELECT prescription_id, min(client_id) AS client_id
  FROM candidates GROUP BY prescription_id
  HAVING count(*) = 1
     AND bool_and(p_cpf = '' OR c_cpf = '' OR p_cpf = c_cpf)
), updated AS (
  UPDATE prescriptions p SET client_id = m.client_id
  FROM unique_matches m
  WHERE p.id = m.prescription_id AND p.client_id IS NULL
  RETURNING p.id
)
SELECT count(*) AS prescriptions_linked FROM updated;

SELECT count(*) AS prescriptions_still_unlinked FROM prescriptions WHERE client_id IS NULL;
