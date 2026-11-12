---
name: Agenda — barra congelada, faixa de agendas e cartão rápido
description: Lições de layout/teste da tela /agenda (barra sticky, chips de agendas, hover card)
---
A tela /agenda tem um bloco sticky (comandos + faixa de agendas contínua com +/− que abre gaveta) e um cartão rápido por hover nos eventos da linha do tempo.

**Why:** pedido do CEO de tela menos carregada, controles congelados e resumo ao passar o mouse; padrão registrado no skill-layout-paxter (Padrão 42).

**How to apply:**
- Sticky dentro do contêiner de rolagem do Layout (que tem padding) precisa de `top` NEGATIVO igual ao padding (-1rem / -1.5rem), senão para 24px abaixo do topo e cobre o conteúdo.
- `scroll-snap` na faixa de chips esconde o rótulo do primeiro grupo: não usar.
- Testes e2e do filtro agora precisam clicar `filtro-agendas-recolher` (+) antes de usar o painel por grupo; os chips (`chip-agenda-<chave>`, role checkbox) ficam na barra minimizada.
- O dev server é lento no primeiro carregamento (goto ate ~45s com 3 navegações): rodar specs com `--timeout=120000 --workers=1`, ou em segundo plano com log.
- Hover card do Radix ignora toque; no celular o clique abre os detalhes como antes.
- Aviso que aparece/some ao lado de uma faixa clicavel precisa de largura FIXA: senao o 2o clique do duplo clique cai no aviso (dblclick falhava).
- Ocupacao "N/M" = vagas ocupadas / vagas das janelas (agenda_windows) no periodo, calculada no servidor (GET /agenda/ocupacao, funcao pura); nao usa o motor de slots (cadeia/Google).
- Se o preview cair ("ERR_CONNECTION_REFUSED" no e2e), reiniciar os workflows padcom e api-server antes de culpar o codigo.
