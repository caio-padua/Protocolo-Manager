-- SOMENTE homologacao/dev: dois locais externos FICTICIOS da Clinica Padua (empresa 5). Idempotente.
-- Nunca rodar em producao. CNPJ/CPF sao FICTICIOS (prefixo 99.000, digitos validos), sem ligacao com nada.
-- Endereco: rua/CEP reais de Sao Paulo, sala e numero inventados. Exige as migracoes 20261116 e 20261117.
INSERT INTO locais_externos (empresa_id, nome, cep, logradouro, numero, complemento, bairro, cidade, uf, observacao)
SELECT 5, 'Consultório Jardins (fictício)', '01424-001', 'Alameda Lorena', '1000', 'Sala 52', 'Jardim Paulista', 'São Paulo', 'SP',
       'Dado fictício de homologação: consultório sublocado.'
WHERE NOT EXISTS (SELECT 1 FROM locais_externos WHERE empresa_id = 5 AND nome = 'Consultório Jardins (fictício)');
INSERT INTO locais_externos (empresa_id, nome, cep, logradouro, numero, complemento, bairro, cidade, uf, observacao)
SELECT 5, 'Consultório São Miguel Paulista (fictício)', '08011-190', 'Rua Firmino Barbosa', '0', 'Sala 1', 'Vila Pedroso', 'São Paulo', 'SP',
       'Dado fictício de homologação: consultório sublocado.'
WHERE NOT EXISTS (SELECT 1 FROM locais_externos WHERE empresa_id = 5 AND nome = 'Consultório São Miguel Paulista (fictício)');

UPDATE locais_externos SET
  observacao = 'Dado fictício de homologação: cadastro interno, sem ligação com nenhum sistema externo.',
  nome_fantasia = 'Consultório Jardins', razao_social = 'Consultório Jardins Serviços Médicos Ltda (fictícia)',
  nick = 'Jardins', cnpj = '99.000.001/0001-01', tipo_unidade = 'CLINICA', dono_nome = 'Responsável Fictício Jardins',
  telefone = '(11) 90000-0001', email_geral = 'jardins.ficticio@exemplo.invalid', email_agenda = 'agenda.jardins@exemplo.invalid',
  email_enfermagem = 'enfermagem.jardins@exemplo.invalid', email_financeiro = 'financeiro.jardins@exemplo.invalid',
  natureza_juridica = 'Ltda', regime_tributario = 'simples_nacional', cnae = '86.30-5/01',
  cnae_descricao = 'Atividade médica ambulatorial com recursos para realização de procedimentos cirúrgicos',
  inscricao_estadual = '000.000.001.001', inscricao_municipal = '0.000.001-1', data_abertura = '2024-01-15', capital_social = 10000.00,
  responsavel_legal_nome = 'Sócio Fictício Jardins', responsavel_legal_cpf = '111.444.777-35',
  contador_nome = 'Contador Fictício Um', contador_crc = 'CRC-SP 000001/O', contador_email = 'contador1@exemplo.invalid', contador_telefone = '(11) 90000-0101',
  zona = 'Zona Oeste', cep_fiscal = '01424-001', endereco_fiscal = 'Alameda Lorena, 1000', complemento_fiscal = 'Sala 52',
  bairro_fiscal = 'Jardim Paulista', cidade_fiscal = 'São Paulo', estado_fiscal = 'SP', codigo_ibge = '3550308',
  nfe_ambiente = 'homologacao', optante_simples = true, nfe_serie = '1', nfe_proximo_numero = 1, nfe_codigo_servico = '4.01',
  nfe_aliquota_iss = 2.00, nfe_codigo_iss = '04010', nfe_discriminacao_padrao = 'Prestação de serviços médicos (modelo fictício de homologação).'
WHERE empresa_id = 5 AND nome = 'Consultório Jardins (fictício)' AND cnpj IS NULL;

UPDATE locais_externos SET
  observacao = 'Dado fictício de homologação: cadastro interno, sem ligação com nenhum sistema externo.',
  nome_fantasia = 'Consultório São Miguel', razao_social = 'Consultório São Miguel Paulista Serviços Médicos Ltda (fictícia)',
  nick = 'São Miguel', cnpj = '99.000.002/0001-48', tipo_unidade = 'CLINICA', dono_nome = 'Responsável Fictício São Miguel',
  telefone = '(11) 90000-0002', email_geral = 'saomiguel.ficticio@exemplo.invalid', email_agenda = 'agenda.saomiguel@exemplo.invalid',
  email_enfermagem = 'enfermagem.saomiguel@exemplo.invalid', email_financeiro = 'financeiro.saomiguel@exemplo.invalid',
  natureza_juridica = 'Ltda', regime_tributario = 'simples_nacional', cnae = '86.30-5/01',
  cnae_descricao = 'Atividade médica ambulatorial com recursos para realização de procedimentos cirúrgicos',
  inscricao_estadual = '000.000.002.002', inscricao_municipal = '0.000.002-2', data_abertura = '2024-03-10', capital_social = 10000.00,
  responsavel_legal_nome = 'Sócio Fictício São Miguel', responsavel_legal_cpf = '123.456.789-09',
  contador_nome = 'Contador Fictício Dois', contador_crc = 'CRC-SP 000002/O', contador_email = 'contador2@exemplo.invalid', contador_telefone = '(11) 90000-0202',
  zona = 'Zona Leste', cep_fiscal = '08011-190', endereco_fiscal = 'Rua Firmino Barbosa, s/n', complemento_fiscal = 'Sala 1',
  bairro_fiscal = 'Vila Pedroso', cidade_fiscal = 'São Paulo', estado_fiscal = 'SP', codigo_ibge = '3550308',
  nfe_ambiente = 'homologacao', optante_simples = true, nfe_serie = '1', nfe_proximo_numero = 1, nfe_codigo_servico = '4.01',
  nfe_aliquota_iss = 2.00, nfe_codigo_iss = '04010', nfe_discriminacao_padrao = 'Prestação de serviços médicos (modelo fictício de homologação).'
WHERE empresa_id = 5 AND nome = 'Consultório São Miguel Paulista (fictício)' AND cnpj IS NULL;
