# CARTA AO DR. CODE — INSTALAR O CLAUDE-MEM EM TODOS OS REPOS
De: Dr. Replit Paxter
Para: Dr. Code (Claude Code) + CEO Dr. Caio (leia antes de executar)
Data: 28/07/2026
Assunto: Como instalar o claude-mem UMA VEZ e cobrir todos os repositorios.

---

## O QUE E O CLAUDE-MEM

claude-mem e um plugin de memoria persistente para o Claude Code.
Ele usa "hooks" (ganchos de ciclo de vida) — ou seja, scripts que
disparam automaticamente nos eventos:

    SessionStart      -> injeta contexto de sessoes anteriores
    UserPromptSubmit  -> captura o que voce pediu
    PostToolUse       -> captura o que a IA fez
    Stop / SessionEnd -> comprime e salva a memoria em SQLite local

Resultado: o Dr. Code "lembra" de sessoes anteriores, decisoes tomadas,
erros ja encontrados e solucoes aplicadas — mesmo depois de fechar o terminal.

---

## PONTO CRITICO: UMA INSTALACAO VALE PARA TODOS OS REPOS

O claude-mem instala os hooks em ~/.claude/hooks/ (pasta global do Claude Code
no seu computador). Isso significa: instala UMA VEZ, funciona em TODOS os
projetos que voce abrir com o Claude Code. Nao precisa repetir por repositorio.

---

## PASSO A PASSO — EXECUTAR NO SEU COMPUTADOR

Passo 1: Abra o terminal no seu computador (nao dentro do Replit).

Passo 2: Execute o comando de instalacao:

    npx claude-mem install

    O que acontece:
    - Baixa e instala o claude-mem globalmente (via npx)
    - Registra os 6 scripts de hook em ~/.claude/hooks/
    - Inicia o worker local (servico HTTP em SQLite)
    - Imprime a URL do painel web (algo como http://localhost:PORT)

Passo 3: Reinicie o Claude Code completamente (feche e abra de novo).

Passo 4: Confirme que funcionou. Na primeira sessao apos o restart,
o Claude Code deve mostrar uma linha como:

    [claude-mem] Session started. X observations loaded.

Se aparecer, esta funcionando.

---

## SE O DR. CODE USA O PLUGIN MARKETPLACE (alternativa ao npx)

Dentro de qualquer sessao do Claude Code, rode:

    /plugin marketplace add thedotmack/claude-mem
    /plugin install claude-mem

Depois reinicie o Claude Code.

---

## PARA O CEO: COMO CONFIRMAR QUE FUNCIONOU

Abra o terminal e rode:

    ls ~/.claude/hooks/

Deve aparecer algo como:

    claude-mem-session-start.sh
    claude-mem-post-tool-use.sh
    claude-mem-stop.sh
    claude-mem-session-end.sh
    ...

Se esses arquivos existirem, o claude-mem esta instalado e ativo
para todos os seus repositorios.

---

## OBSERVACAO SOBRE O CLAUDE.MD (segundo pedido do CEO)

O CEO pediu tambem que a Biblia (DIRETRIZES_CENTRAIS_E_PRE_REQUISITOS)
fosse colocada como item nas regras do Claude Code.

Isso foi feito: o arquivo CLAUDE.md foi criado na raiz deste repositorio
(Protocolo-Manager) com a copia exata da versao 26.06.15 da Biblia.

O Claude Code le o CLAUDE.md automaticamente ao abrir qualquer sessao
dentro deste repositorio. Nao e preciso fazer nada alem de abrir o projeto.

Para os outros repos do CEO (IHE, Pactor, etc.), o mesmo arquivo CLAUDE.md
deve ser copiado para a raiz de cada um. O Dr. Code pode fazer isso com:

    cp /caminho/para/Protocolo-Manager/CLAUDE.md /caminho/para/outro-repo/CLAUDE.md

Ou o CEO pode pedir ao Dr. Replit responsavel por cada repo que crie
o CLAUDE.md la dentro — e so copiar o conteudo.

---

## REPOSITORIOS QUE O CEO TEM NO GITHUB (para referencia)

Os repos conhecidos do CEO em github.com/caio-padua:

    Protocolo-Manager     -> CLAUDE.md JA CRIADO (feito agora)
    Integrative-Health-Engine (IHE / Pawards)  -> pendente
    Pactor                -> pendente
    parxis-core-protocol  -> pendente (repo do Dr. Lovable, acesso separado)

Para cada repo pendente: copiar o CLAUDE.md da raiz deste repo.

---

RESUMO EM 1 LINHA: claude-mem instala com UM comando no seu computador
e cobre todos os repos; o CLAUDE.md com a Biblia 26.06.15 ja esta criado
neste repo e deve ser copiado para os demais.
