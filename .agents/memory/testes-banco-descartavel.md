---
name: Testes de banco descartável
description: Isolamento de testes que verificam alterações e conflitos no PostgreSQL.
---

Testes de escrita e migração usam uma instância PostgreSQL descartável, não a
conexão configurada da aplicação, mesmo que usem tabelas temporárias.

**Why:** a conexão configurada pode apontar para uma base com dados reais ou
para outro ambiente, e uma tabela temporária não isola os privilégios nem os
efeitos colaterais de toda a suíte.

**How to apply:** iniciar uma instância própria sem escuta de rede, usar dados
sintéticos, encerrar a instância e limpar apenas os arquivos temporários
criados pelo próprio teste.
