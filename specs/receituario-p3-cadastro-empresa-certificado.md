# Spec P3 — Cadastro do Certificado Digital na Empresa

**Data:** 20/07/2026
**Empresa em questão:** Instituto Padua (nome fantasia) = Paduccia Clínica Médica (razão social) = location id=8

## Mudanças no banco (ALTER TABLE via raw SQL — nunca db push)
Adicionar à tabela `locations`:
```sql
ALTER TABLE locations ADD COLUMN IF NOT EXISTS cnpj TEXT;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS razao_social TEXT;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS nome_fantasia TEXT;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS cert_titular TEXT;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS cert_validade TEXT;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS cert_tipo TEXT;
```

## Seed do Instituto Padua (id=8)
```sql
UPDATE locations SET
  razao_social = 'Paduccia Clínica Médica',
  nome_fantasia = 'Instituto Padua',
  cert_titular = 'Dr. Caio Henrique Fernandes Pádua',
  cert_tipo = 'A1 ICP-Brasil',
  cert_validade = 'verificar via GET /api/cert/metadata'
WHERE id = 8;
```

## API: extensão da rota de location
`PATCH /api/locations/:id/empresa` — atualiza os campos novos (cnpj, razao_social, nome_fantasia, cert_titular, cert_validade, cert_tipo)
`GET /api/locations/:id/empresa` — retorna os campos novos

## UI: nova seção em `configuracoes/empresa.tsx`
Adicionar accordion "Certificado Digital da Empresa" com:
- Razão Social, Nome Fantasia, CNPJ
- Cert Titular, Cert Tipo, Cert Validade (campos de texto simples)
- Botão salvar → PATCH /api/locations/:id/empresa

## Sem mudanças em
- Drizzle schema (ALTER é via raw SQL direto no banco)
- Nenhuma migração automática — comando único executado no boot do api-server se coluna não existir
