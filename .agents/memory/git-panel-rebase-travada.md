---
name: Sync do painel Git interrompido deixa rebase interativa travada
description: painel Git do Replit (botão Pull/Sync) roda "pull --rebase" por baixo; se essa operação for interrompida no meio, o repositório fica preso numa rebase interativa parcial — sintoma é "DIRTY_WORKTREE" / "GitHub travado", não um erro de autenticação.
---

Sintoma reportado pelo usuário: painel Git mostra erro "DIRTY_WORKTREE — There are uncommitted changes" e o botão de sync não avança, mesmo sem o usuário ter editado nada manualmente.

Causa raiz observada: o botão Pull/"Sync Changes" do painel Git do Replit executa `git pull --quiet --no-edit --rebase origin <branch>` por baixo dos panos. Se esse processo for interrompido antes de terminar todos os passos (conexão perdida, aba fechada, ou uma operação de merge manual concorrente no terminal disputando o mesmo repositório), o git fica com um diretório `.git/rebase-merge/` órfão: uma rebase interativa parada no meio (ex.: "17 comandos feitos, 21 restantes... You are currently editing a commit while rebasing").

**Por que engana:** `git status --short`/`-s` (formato compacto) NÃO mostra o aviso "interactive rebase in progress" — só lista arquivos. Rodar apenas a versão curta faz parecer que o working tree está limpo quando na verdade há uma rebase pendurada. Só o `git status` completo (sem `--short`) revela o estado real.

**Como diagnosticar:** rodar `git status` (completo) primeiro sempre que o painel Git reportar erro sem uma causa óbvia de arquivo sujo. Se aparecer "rebase in progress" ou "editing a commit while rebasing", NÃO é erro de credencial — é uma operação de sync anterior que nunca terminou.

**Como resolver com segurança:** antes de abortar, confirmar que `cat .git/rebase-merge/orig-head` aponta para um commit que já contém todo o trabalho local esperado (normalmente sim, porque a rebase só está tentando REPETIR commits que já existem). Depois, `git rebase --abort` — isso é seguro porque o `abort` restaura o branch exatamente para o commit onde a rebase começou (documentado no próprio git); nada é perdido porque o branch nomeado só é atualizado quando uma rebase TERMINA, nunca durante. Confirmar com `git status` (limpo) e `git log --oneline -1 HEAD` batendo com o `orig-head` antes de seguir em frente.
