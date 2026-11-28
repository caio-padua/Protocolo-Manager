---
name: Remarcar e cancelar visita de protocolo (duração, Google, numeração)
description: Regras que a remarcação e o cancelamento de visita de protocolo precisam preservar no sistema e no Google Agenda.
---

Visita de protocolo reserva vários períodos de 20 minutos. Remarcar nunca
devolve a duração para um período e exige o trecho inteiro livre.

**Why:** a rotina antiga sobrescrevia a duração pela do horário da agenda, e a
visita passava a ocupar menos do que reservou (outra marcação cabia por cima).

**How to apply:**
- Google nunca é chamado dentro da transação da remarcação (a segunda conexão
  trava na linha bloqueada): quem chama atualiza o MESMO evento depois de gravar.
- Falha do Google vira aviso e nunca desfaz o sistema. Cancelar mantém o
  ponteiro do evento se o Google falhar; repetir o cancelamento tenta de novo.
- Antes de apagar ou atualizar evento, confirmar a conta Google da clínica:
  conta errada recebe 404 num calendário alheio, e 404 não prova remoção.
- Numeração "n/total" da descrição vem da posição entre visitas ativas, não do
  número gravado na sessão.
- O aviso prévio de Google usa a MESMA função de destino do envio, para as duas
  regras nunca divergirem.
- Leitura de sessão por número precisa filtrar pela empresa (já houve vazamento
  entre clínicas numa rota GET antiga).
