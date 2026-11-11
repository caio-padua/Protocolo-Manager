-- Endereco da agenda EXTERNA (modalidade 'externo'): CEP preenche logradouro/bairro/cidade/UF; numero e complemento digitados.
-- Aditiva e idempotente (tambem executada no boot). Nao altera nem apaga agendas existentes.
ALTER TABLE agenda_resources ADD COLUMN IF NOT EXISTS external_cep text;
ALTER TABLE agenda_resources ADD COLUMN IF NOT EXISTS external_logradouro text;
ALTER TABLE agenda_resources ADD COLUMN IF NOT EXISTS external_bairro text;
ALTER TABLE agenda_resources ADD COLUMN IF NOT EXISTS external_cidade text;
ALTER TABLE agenda_resources ADD COLUMN IF NOT EXISTS external_uf text;
ALTER TABLE agenda_resources ADD COLUMN IF NOT EXISTS external_numero text;
ALTER TABLE agenda_resources ADD COLUMN IF NOT EXISTS external_complemento text;
