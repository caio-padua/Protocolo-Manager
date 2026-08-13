---
name: Log de erro do Vite pode ser estado transitório durante merge
description: Erro de sintaxe no log do workflow pode já estar resolvido; verificar estado atual (mtime, conteúdo, screenshot) antes de "corrigir" um bug que já sumiu.
---

Durante uma janela de poucos segundos em que muitos arquivos mudam de uma vez (ex.: merge de task agent sendo aplicado no workspace), o Vite pode logar "Failed to reload X: Identifier already declared" para um arquivo que está passando por um estado intermediário de escrita — e no MESMO segundo, logar "hot updated" com sucesso para o mesmo arquivo, porque o conteúdo final já chegou.

**Por quê:** o log é cumulativo desde o último cursor lido (RefreshAllLogs mostra tudo, inclusive erros já superados); não é um retrato do estado atual do sistema.

**Como aplicar:** antes de "corrigir" um erro de sintaxe visto no log, conferir o arquivo real agora (grep/leitura do conteúdo atual + `stat` do horário de modificação) e, se possível, um screenshot da tela afetada. Se o conteúdo atual já está correto e a tela renderiza normalmente, o erro era transitório — não mexer no arquivo.
