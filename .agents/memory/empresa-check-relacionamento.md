---
name: Restrição SQL do vínculo empresarial
description: Compatibilidade entre a classificação empresarial independente e a restrição de valores do banco.
---

Regra: antes de alterar os valores aceitos ou o padrão de `tipo_relacionamento`, conferir as restrições reais no PostgreSQL. A restrição pode existir no banco sem estar declarada no esquema Drizzle; alinhar banco, padrão e validação da aplicação antes de gravar.

**Why:** um padrão novo de classificação foi rejeitado pela restrição antiga e a transação foi revertida; o build não detecta essa divergência de dados.

**How to apply:** em mudanças de classificação empresarial, consultar `pg_constraint`, testar a migração no banco de desenvolvimento e conferir os valores depois do `COMMIT`.
