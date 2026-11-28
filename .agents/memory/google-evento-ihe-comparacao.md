---
name: Evento Google — comparação com o IHE e armadilha do print
description: Como o IHE atualizava o evento ao aplicar, por que o print parece ter cores diferentes do código e o que ainda não existe (fase por relógio, cor do evento por estado).
---

- No IHE (repo caio-padua/Integrative-Health-Engine, branch replit-agent) a rota confirmar-substancia chamava updateCalendarEventDescription em melhor esforço. O Manager perdeu isso: confirm-substance só grava no banco.
- O print do Google do CEO mostra programada/PROX em âmbar e indisponível em lilás porque o Google renderiza o quadrado amarelo e o quadrado branco assim. Os emojis emitidos são os mesmos do IHE e da spec (verde DISP, amarelo PROX, azul APLI, branco INDI). NÃO é divergência de código.

**Why:** numa auditoria eu afirmei "cores diferentes" comparando o print com o código; amostrei os pixels do print (âmbar FFAD53, lilás DAC7E9) e confirmei que era renderização, não código.

**How to apply:** nunca julgar cor de emoji pelo print; comparar os caracteres emitidos. O quadrado laranja (Registro a Conferir) fica visualmente parecido com o amarelo renderizado pelo Google: tratar como risco de leitura.

- A cor do evento (colorId) é fixa por tipo de procedimento em ambos os sistemas; nenhuma fase por data existe: pendente "disp" continua verde depois que o dia passa. A agenda interna só tem barra lateral por estado e anel "HOJE".
- Existe node-cron em BRT (lib/cron.ts) para uma tarefa de virada do dia.
