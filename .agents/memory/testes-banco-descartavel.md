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

O Dr. Caio autoriza e exige profissionais fictícios quando necessários para
testar o funcionamento e preparar o crescimento do sistema. Também autorizou
criá-los no cadastro do Instituto Pádua quando solicitado. Identificá-los
claramente como sintéticos e não alterar ou reclassificar profissionais
existentes; testes destrutivos continuam restritos ao banco isolado.
