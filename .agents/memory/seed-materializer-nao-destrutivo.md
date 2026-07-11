---
name: Seed/materializador não destrutivo com campos editáveis pela UI
description: UPSERT do boot que roda toda inicialização não pode sobrescrever no conflito campos que o humano edita pela tela — só semeá-los no INSERT.
---

Quando um seeder/materializador roda em TODO boot com `onConflictDoUpdate`, o `set:` do
conflito NÃO pode incluir colunas que o usuário edita pela interface. Só as semeie no
INSERT inicial; no conflito, atualize apenas os metadados de que a curadoria é dona.

**Why:** faixas de exame — o médico escolhe a unidade padrão (`canonicalUnit`/`isCanonical`)
e a direção pela tela; o seed materializava tudo no conflito e o reboot silenciosamente
revertia a escolha manual. Bug não aparece no typecheck nem numa sessão só; aparece no
próximo boot. Reprovado pelo architect como "destrutivo".

**How to apply:** ao criar/editar qualquer seed que corre no `index.ts`, liste as colunas
que alguma rota PUT/PATCH grava; remova-as do `set:` do `onConflictDoUpdate` (mantêm-se
apenas no `.values()` do INSERT). Prova de não-destrutividade = 2º boot loga "inseridas: 0"
para as coleções guardadas. Direção manual pode viver em tabela própria só-insere
(direcao_favoravel_exame), mas a coluna espelho no catálogo também precisa sair do conflito.
