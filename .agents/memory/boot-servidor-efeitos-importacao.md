---
name: Reinício seguro e efeitos na importação
description: Limites da auditoria de inicialização para reiniciar sem executar escritas imprevistas.
---

Para reiniciar sem regravar ou semear dados existentes, não basta desativar as
rotinas explícitas do arquivo principal: módulos importados podem iniciar
gravações ou integrações antes de o servidor começar a escutar.

**Why:** o aplicativo dispara inicializações de rotas e integrações durante a
importação, além de rotinas no início e após a abertura do servidor.

**How to apply:** auditar a cadeia de importações, tarefas imediatas e atrasadas,
e efeitos externos; testar a inicialização completa em ambiente isolado antes de
chamar o reinício seguro. Uma migração isolada testada não prova o boot inteiro.
Não suspender indiscriminadamente a hidratação do cofre nem a sincronização
periódica: integrações podem deixar de funcionar ou ficar desatualizadas.
Conferir também efeitos das primeiras requisições, pois uma leitura pode
executar inicialização e escrever no banco. Um teste de boot sem requisições
não prova a segurança operacional depois de abrir a porta.

**Why:** em testes entre pacotes pnpm, um mock pelo nome do pacote pode atingir
somente a versão instalada no pacote do teste, deixando a versão do worker real.

**How to apply:** ao isolar agendadores em testes de boot, conferir a resolução
da dependência no consumidor e mockar essa instalação. Um mock com zero chamadas
não prova que os agendamentos foram desativados.
