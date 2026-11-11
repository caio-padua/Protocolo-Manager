---
name: Agenda Configuração — códigos de repetição das janelas
description: repeat_weeks codifica semanal, a cada N semanas e posição no mês na mesma coluna; nome oficial da tela e vocabulário
---
Repetição da janela vive em `agenda_windows.repeat_weeks` (inteiro, sem CHECK): 1 semanal; 2,3,4,6,8 a cada N semanas (exige data inicial no mesmo dia da semana); 101–104 = 1º–4º dia do mês; 105 = último.
**Why:** coluna única preserva a comparação `expectedWindows` (concorrência otimista) e ~60 testes; mensais começam em 100 para nunca colidir com nº de semanas.
**How to apply:** registro espelhado em `api-server/src/lib/agenda-window-recurrence.ts` e `padcom/src/lib/agenda-repeticao.ts` — mexeu num, mexa no outro. Sobreposição só vale se os padrões podem coincidir (`janelasSobrepostas`). Após codegen, api-zod/index.ts deve continuar exportando só `generated/api`.
Vocabulário (decisão do CEO 11/11/2026): "recurso" NÃO é usado para o usuário — é "agenda de atendimento por profissional"; a tela/menu chama-se "Agenda Configuração" (rota /agenda/motor mantida, nunca "Motor de Agenda").

## Tela Agenda Configuração — padrões de interface
- Item de lista clicável = classe `.tecla-3d` (Saliente solto; `aria-pressed="true"` = APERTADO navy/dourado). Reutilizar em outras listas selecionáveis.
- Ordem das agendas persiste em `sortOrder` via PUT por agenda (só as que mudam de posição; reaproveita os valores existentes para não colidir com agendas inativas ocultas).
- Marca de registro no canto (`Registro`/`ComRegistro` em MarcadorVinculo.tsx, classe `.registro-canto`): mesmo código = mesmo conceito em todas as telas; novos códigos J1, X1, K1, T1, S1.
- Janelas: botão Salvar em cada dia grava a SEMANA inteira (o endpoint substitui todas as janelas); rótulo visível "Salvar" para não colidir com o "Salvar Janelas" dos testes.
**Why:** pedido do CEO — o Salvar do topo ficava longe ao rolar.
- Cor da agenda = `VidroCor`/`SeletorCorVidro` (components/VidroCor.tsx), em TODO lugar que mostra ou escolhe cor de agenda (lista, Nova agenda, Identidade). Vidro brilhante, cantos pouco arredondados, tampo quase plano, luz só DENTRO do quadrado (sem halo/neon). Item selecionado da lista = côncavo creme (insert bevel), nunca escuro.
**Why:** CEO rejeitou halo neon, vidro fosco, cantos muito redondos, seleção escura e `input type=color` cru no formulário de nova agenda.
- Atualização: `VidroCor` virou PEDRA LAPIDADA (princesa, engastada em ouro, 4 facetas + mesa, luz de cima-esquerda, sem reflexo branco). CEO rejeitou faixa branca/brilho artificial. Item da lista em 3 linhas: "AGENDA {categoria}" (negrito; categoria nula = "categoria pendente", nunca deduzida do nome) / nome da agenda / individual-compartilhada · modalidade.
