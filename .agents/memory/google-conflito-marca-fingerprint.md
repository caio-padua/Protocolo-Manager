---
name: Conflito Google — marca no evento e decisão humana
description: Como o sistema detecta edição concorrente no Google sem sobrescrever e sem guardar dado clínico
---
O evento enviado leva uma marca (`paxterFp`) com o horário que o sistema enviou. Na próxima atualização, se o horário remoto difere da marca, o envio é bloqueado (409) e vira aviso aberto; descrição fica fora da comparação. Evento legado sem marca é sobrescrito uma vez e passa a ter marca.

**Why:** regra do CEO: nunca sobrescrever mudança remota em silêncio, nunca dizer "sincronizado" só porque leu.
**How to apply:** bloqueio por conflito ≠ resultado incerto (não reaproveitar a lógica de reserva incerta); a UI de decisão usa janela da própria tela, nunca `window.confirm` (bloqueado em iframe do preview: o botão ficava mudo).
