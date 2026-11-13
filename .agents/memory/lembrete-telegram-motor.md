---
name: Lembrete por período no Telegram
description: como o motor de lembrete escolhe canal e como provar execução automática do worker em desenvolvimento
---

- Mesmo motor (`executarLembretesPeriodo`), canal por `lembrete.telegram.modo` em app_settings (desligado padrão | lista | ligado). Autorização de lembrete recorrente continua obrigatória em todos os modos.
- Cada janela deve levar só os períodos do próprio horário (`periodosDaJanela`); antes toda janela mandava todas as doses com a abertura da manhã.
- Prova de execução automática sem subir o worker inteiro: o Job 2 foi extraído em `iniciarJobLembretes` e roda isolado com tsx; criar lembrete de teste (texto NÃO clínico) + autorização de teste + modo lista, e reverter tudo depois.

**Why:** o api-worker não tem workflow no desenvolvimento e subir todos os jobs dispararia farmácia, Drive e monitor de LLMs.
**How to apply:** nunca testar com prescrição real; só chats autorizados; apagar o registro de autorização de teste ao final.
