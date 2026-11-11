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
