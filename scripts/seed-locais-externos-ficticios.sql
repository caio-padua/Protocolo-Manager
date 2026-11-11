-- SOMENTE homologacao/dev: dois locais externos FICTICIOS da Clinica Padua (empresa 5). Idempotente.
-- Nunca rodar em producao. Enderecos reais de rua/CEP, consultorios e numeros inventados.
INSERT INTO locais_externos (empresa_id, nome, cep, logradouro, numero, complemento, bairro, cidade, uf, observacao)
SELECT 5, 'Consultório Jardins (fictício)', '01424-001', 'Alameda Lorena', '1000', 'Sala 52', 'Jardim Paulista', 'São Paulo', 'SP',
       'Dado fictício de homologação: consultório sublocado, mesmo CNPJ da Clínica Pádua.'
WHERE NOT EXISTS (SELECT 1 FROM locais_externos WHERE empresa_id = 5 AND nome = 'Consultório Jardins (fictício)');
INSERT INTO locais_externos (empresa_id, nome, cep, logradouro, numero, complemento, bairro, cidade, uf, observacao)
SELECT 5, 'Consultório São Miguel Paulista (fictício)', '08011-190', 'Rua Firmino Barbosa', '0', 'Sala 1', 'Vila Pedroso', 'São Paulo', 'SP',
       'Dado fictício de homologação: consultório sublocado, mesmo CNPJ da Clínica Pádua.'
WHERE NOT EXISTS (SELECT 1 FROM locais_externos WHERE empresa_id = 5 AND nome = 'Consultório São Miguel Paulista (fictício)');
