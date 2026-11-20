---
name: Lembrete por período no Telegram
description: como o motor de lembrete escolhe canal e como provar execução automática do worker em desenvolvimento
---

- Mesmo motor (`executarLembretesPeriodo`), canal por `lembrete.telegram.modo` em app_settings (desligado padrão | lista | ligado). Autorização de lembrete recorrente continua obrigatória em todos os modos.
- Cada janela deve levar só os períodos do próprio horário (`periodosDaJanela`); antes toda janela mandava todas as doses com a abertura da manhã.
- Prova de execução automática sem subir o worker inteiro: o Job 2 foi extraído em `iniciarJobLembretes` e roda isolado com tsx; criar lembrete de teste (texto NÃO clínico) + autorização de teste + modo lista, e reverter tudo depois.

**Why:** o api-worker não tem workflow no desenvolvimento e subir todos os jobs dispararia farmácia, Drive e monitor de LLMs.
**How to apply:** nunca testar com prescrição real; só chats autorizados; apagar o registro de autorização de teste ao final.

## Acompanhamento futuro após encaminhar exames
- O CEO quer uma sequência que confirme o recebimento algumas horas após o envio e pergunte, quatro dias depois, se a cliente conseguiu marcar o exame.
- Esse acompanhamento por etapas ainda precisa ser construído; não é o mesmo que o lembrete periódico de exame já existente.
- O intervalo exato de horas e as regras para interromper, repetir ou encaminhar a conversa à equipe ainda precisam ser definidos.

**Why:** o objetivo é confirmar que o pedido chegou e ajudar a cliente a avançar sem gerar mensagens duplicadas ou insistentes.
**How to apply:** ligar cada etapa ao pedido de exame correto, registrar resposta e estado, respeitar a autorização de contato e impedir duplicações; manter a sequência separada do motor de lembretes por horário.
