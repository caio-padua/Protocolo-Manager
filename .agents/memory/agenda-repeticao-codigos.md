---
name: Agenda Configuração — códigos de repetição das janelas
description: repeat_weeks codifica semanal, a cada N semanas e posição no mês na mesma coluna; nome oficial da tela e vocabulário
---
Repetição da janela vive em `agenda_windows.repeat_weeks` (inteiro, sem CHECK): 1 semanal; 2,3,4,6,8 a cada N semanas (exige data inicial no mesmo dia da semana); 101–104 = 1º–4º dia do mês; 105 = último.
**Why:** coluna única preserva a comparação `expectedWindows` (concorrência otimista) e ~60 testes; mensais começam em 100 para nunca colidir com nº de semanas.
**How to apply:** registro espelhado em `api-server/src/lib/agenda-window-recurrence.ts` e `padcom/src/lib/agenda-repeticao.ts` — mexeu num, mexa no outro. Sobreposição só vale se os padrões podem coincidir (`janelasSobrepostas`). Após codegen, api-zod/index.ts deve continuar exportando só `generated/api`.
Vocabulário (decisão do CEO 11/11/2026): "recurso" NÃO é usado para o usuário — é "agenda de atendimento por profissional"; a tela/menu chama-se "Agenda Configuração" (rota /agenda/motor mantida, nunca "Motor de Agenda").
