-- Onda 3 (DEV/laboratorio): cadastro unico da PADUMANN na tabela mestre empresas. Idempotente (guarda por CNPJ).
-- Status: cadastro de laboratorio, PENDENTE de validacao documental. Sem CPF/RG/endereco residencial/regime/IM/IE/ISS.
DO $$
DECLARE eid integer; fid bigint;
BEGIN
  SELECT id INTO eid FROM empresas WHERE cnpj IN ('69.410.873/0001-79','69410873000179') LIMIT 1;
  IF eid IS NULL THEN
    INSERT INTO empresas (nome, nick, slug, cnpj, razao_social, cnae, cnae_descricao, cnaes_secundarios, natureza_juridica, data_abertura, capital_social,
                          endereco, cep, bairro, cidade, estado, status, ativa)
    VALUES ('Instituto Padumann Clínica Médica','Padumann','padumann','69.410.873/0001-79','PADUMANN CLÍNICA MÉDICA LTDA','86.30-5-03',
            'Atividade médica ambulatorial restrita a consultas',
            '["72.10-0-00","85.99-6-99","86.30-5-01","86.30-5-02","86.30-5-04","86.30-5-99","86.40-2-02","86.40-2-07","86.40-2-08","86.40-2-09","86.40-2-99","86.50-0-01","86.50-0-02","86.50-0-03","86.50-0-04","86.50-0-05","86.50-0-06","86.50-0-07","86.60-7-00","86.90-9-01","86.90-9-03","86.90-9-04","87.11-5-03","87.12-3-00","87.20-4-01","87.20-4-99","88.00-6-00"]'::jsonb,
            'Sociedade empresária limitada unipessoal','2026-08-13',500000,
            'Rua Guaxupé, 327, Sala 02','03416-050','Vila Formosa','São Paulo','SP','ATIVO',true)
    RETURNING id INTO eid;
  END IF;
  SELECT id INTO fid FROM fin_entity WHERE company_id = eid AND cnpj = '69.410.873/0001-79';
  IF fid IS NULL THEN
    INSERT INTO fin_entity (company_id,cnpj,razao_social,nome_fantasia,nome_fantasia_preferencial,aliases,data_constituicao,natureza_juridica,porte,capital_social_cents,capital_integralizado,sede,
                            cnae_principal,cnae_principal_descricao,cnaes_secundarios,origem_campos)
    SELECT eid,'69.410.873/0001-79','PADUMANN CLÍNICA MÉDICA LTDA','Instituto Padumann Clínica Médica','Instituto Padumann Clínica Médica',
           '["Padumann","Instituto Padumann","Instituto Padumann Clínica Médica"]'::jsonb,'2026-08-13','Sociedade empresária limitada unipessoal','Empresa de Pequeno Porte (EPP)',50000000,NULL,
           '{"logradouro":"Rua Guaxupé","numero":"327","complemento":"Sala 02","bairro":"Vila Formosa","municipio":"São Paulo","uf":"SP","cep":"03416-050"}'::jsonb,
           '86.30-5-03','Atividade médica ambulatorial restrita a consultas', cnaes_secundarios,
           '{"_registro":["Cadastro de laboratório — pendente de validação documental (documentos societários enviados)"]}'::jsonb
    FROM empresas WHERE id = eid RETURNING id INTO fid;
    INSERT INTO fin_partner (company_id,entity_id,nome,papel,participacao_bp,registro_profissional,origem,origem_doc)
    VALUES (eid,fid,'Dayana Ludman Alves Caldas da Silva','socio_administrador',10000,NULL,'documento','{"documentos":["Contrato social","Certidão JUCESP"]}'),
           (eid,fid,'Caio Henrique Fernandes Pádua','responsavel_tecnico',NULL,'CRM/SP 125475/SP','documento','{"documentos":["Contrato social"]}');
    INSERT INTO fin_audit_log (company_id,actor_id,action,entity,entity_id,detail)
    VALUES (eid,NULL,'empresa.cadastro_laboratorio','empresas',eid,'{"origem":"documentos societarios enviados pelo CEO","status":"pendente_validacao"}');
  END IF;
  -- Acesso do CEO (profissional 6) para o seletor; so se ainda nao houver vinculo.
  IF EXISTS (SELECT 1 FROM professionals WHERE id=6) AND NOT EXISTS (SELECT 1 FROM professional_empresas WHERE professional_id=6 AND empresa_id=eid) THEN
    INSERT INTO professional_empresas (professional_id, empresa_id, ordem) VALUES (6, eid, COALESCE((SELECT MAX(ordem) FROM professional_empresas WHERE professional_id=6),1)+1);
  END IF;
END $$;
