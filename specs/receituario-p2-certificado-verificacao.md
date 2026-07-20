# Spec P2 — Verificação e Exposição do Certificado Digital

**Data:** 20/07/2026

## Status atual (verificado)
- Arquivo `artifacts/api-server/certs/assinatura.pfx` **EXISTE**
- É um A1 ICP-Brasil do CPF 293.274.948-06 (Dr. Caio Henrique Fernandes Pádua)
- Senha: gerenciada internamente pelo pdf-signer.ts
- O certificado é do TITULAR (pessoa física), não da empresa (CNPJ)

## O que fazer
1. Criar rota `GET /api/cert/metadata` que lê o .pfx com node-forge (sem expor chave privada)
   - Retorna: titular, cpf_cnpj, validade, tipo (A1), emissor, serial
   - Rota protegida por requireCollaborator
2. No bloco P12 da tela do receituário: exibir os metadados do certificado carregado
   - Botão "Ver certificado do servidor" → faz GET /api/cert/metadata → exibe em card
3. Nenhuma mudança no pdf-signer.ts

## Resposta ao CEO
O certificado do Instituto Padua:
- EXISTE no servidor em certs/assinatura.pfx
- Está em nome de Dr. Caio Pádua (CPF) — não no CNPJ da Paduccia Clínica Médica
- Para assinar como empresa (CNPJ), precisaria de um certificado A1 de pessoa jurídica separado
- Atualmente: o PDF já é assinado com o CPF do Dr. Caio, o que é legalmente válido no Brasil
